import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { SessionParticipantsRepository } from '../persistence/repositories/session-participants.repository';

interface JwtPayload {
  email?: string;
  role?: string;
  avatarUrl?: string;
}

@Injectable()
export class YjsService implements OnApplicationShutdown {
  private readonly logger = new Logger(YjsService.name);
  private server?: WebSocketServer;
  private readonly docs = new Map<string, Y.Doc>();
  private readonly docAwareness = new Map<string, awarenessProtocol.Awareness>();
  private readonly docConnections = new Map<
    string,
    Map<WebSocket, Set<number>>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly sessionParticipantsRepository: SessionParticipantsRepository,
  ) {}

  initialize(server: import('http').Server): void {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({
      noServer: true,
    });

    server.on('upgrade', (request, socket, head) => {
      if (!request.url?.startsWith('/ws/yjs')) {
        return;
      }

      this.handleUpgrade(request, socket, head);
    });

    this.logger.log('Yjs websocket endpoint ready at /ws/yjs/:sessionId');
  }

  private handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    const origin = request.headers.origin;
    const allowedOrigin = this.configService.get<string>('FRONTEND_URL');

    if (allowedOrigin && origin && origin !== allowedOrigin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    this.server?.handleUpgrade(request, socket, head, (conn) => {
      void this.onConnection(conn, request);
    });
  }

  private async onConnection(conn: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      const { sessionId, token } = this.extractConnectionData(request);
      const payload = await this.verifyToken(token);
      const email = payload.email;

      if (!email) {
        throw new UnauthorizedException('JWT payload does not include email');
      }

      const participant =
        await this.sessionParticipantsRepository.findBySessionIdAndUserEmail(
          sessionId,
          email,
        );

      if (!participant) {
        throw new UnauthorizedException('User is not a participant of this session');
      }

      this.setupWsConnection(conn, sessionId);
    } catch (error) {
      this.logger.warn(
        `Yjs connection rejected: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      conn.close(1008, 'Unauthorized');
    }
  }

  private setupWsConnection(conn: WebSocket, docName: string): void {
    conn.binaryType = 'arraybuffer';

    const doc = this.getOrCreateDoc(docName);
    const awareness = this.getOrCreateAwareness(docName, doc);
    const connections = this.getOrCreateConnections(docName);

    connections.set(conn, new Set<number>());

    conn.on('message', (message) => {
      const data =
        message instanceof Buffer
          ? new Uint8Array(message)
          : new Uint8Array(message as ArrayBuffer);

      this.handleMessage(docName, conn, data);
    });

    conn.on('close', () => {
      this.closeConnection(docName, conn);
    });

    this.sendSyncStep1(docName, conn);
    this.sendAwarenessState(docName, conn);
  }

  private handleMessage(docName: string, conn: WebSocket, message: Uint8Array): void {
    const doc = this.docs.get(docName);
    const awareness = this.docAwareness.get(docName);

    if (!doc || !awareness) {
      return;
    }

    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === 0) {
        encoding.writeVarUint(encoder, 0);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

        if (encoding.length(encoder) > 1) {
          this.send(conn, encoding.toUint8Array(encoder));
        }
      }

      if (messageType === 1) {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, conn);
      }
    } catch (error) {
      this.logger.warn(
        `Yjs message error for ${docName}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private sendSyncStep1(docName: string, conn: WebSocket): void {
    const doc = this.docs.get(docName);

    if (!doc) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, doc);

    this.send(conn, encoding.toUint8Array(encoder));
  }

  private sendAwarenessState(docName: string, conn: WebSocket): void {
    const awareness = this.docAwareness.get(docName);

    if (!awareness) {
      return;
    }

    const states = awareness.getStates();

    if (states.size === 0) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(states.keys())),
    );

    this.send(conn, encoding.toUint8Array(encoder));
  }

  private closeConnection(docName: string, conn: WebSocket): void {
    const awareness = this.docAwareness.get(docName);
    const connections = this.docConnections.get(docName);

    if (!awareness || !connections) {
      return;
    }

    const controlledIds = connections.get(conn);
    connections.delete(conn);

    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        awareness,
        Array.from(controlledIds),
        null,
      );
    }

    if (connections.size === 0) {
      this.docs.get(docName)?.destroy();
      this.docs.delete(docName);
      this.docAwareness.delete(docName);
      this.docConnections.delete(docName);
    }
  }

  private send(conn: WebSocket, message: Uint8Array): void {
    if (conn.readyState === WebSocket.OPEN) {
      conn.send(message);
    }
  }

  private getOrCreateDoc(docName: string): Y.Doc {
    const existing = this.docs.get(docName);

    if (existing) {
      return existing;
    }

    const doc = new Y.Doc();

    doc.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      const connections = this.docConnections.get(docName);
      if (!connections) {
        return;
      }

      for (const socket of connections.keys()) {
        this.send(socket, message);
      }
    });

    this.docs.set(docName, doc);
    return doc;
  }

  private getOrCreateAwareness(
    docName: string,
    doc: Y.Doc,
  ): awarenessProtocol.Awareness {
    const existing = this.docAwareness.get(docName);

    if (existing) {
      return existing;
    }

    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);

    awareness.on('update', ({ added, updated, removed }, originConn) => {
      const changedClients = added.concat(updated, removed);
      const connections = this.docConnections.get(docName);

      if (originConn && connections?.has(originConn as WebSocket)) {
        const controlledIds = connections.get(originConn as WebSocket);
        if (controlledIds) {
          for (const clientId of added) {
            controlledIds.add(clientId);
          }
          for (const clientId of removed) {
            controlledIds.delete(clientId);
          }
        }
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const message = encoding.toUint8Array(encoder);

      if (!connections) {
        return;
      }

      for (const socket of connections.keys()) {
        this.send(socket, message);
      }
    });

    this.docAwareness.set(docName, awareness);
    return awareness;
  }

  private getOrCreateConnections(docName: string): Map<WebSocket, Set<number>> {
    const existing = this.docConnections.get(docName);

    if (existing) {
      return existing;
    }

    const connections = new Map<WebSocket, Set<number>>();
    this.docConnections.set(docName, connections);
    return connections;
  }

  private extractConnectionData(request: IncomingMessage): {
    sessionId: string;
    token: string;
  } {
    const rawUrl = request.url ?? '';
    const parsed = new URL(rawUrl, 'http://localhost');
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (pathParts.length < 3) {
      throw new UnauthorizedException('Missing sessionId in yjs path');
    }

    const sessionId = pathParts[2];
    const token = parsed.searchParams.get('token');

    if (!token) {
      throw new UnauthorizedException('Missing token in yjs query params');
    }

    return { sessionId, token };
  }

  private verifyToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }

  onApplicationShutdown(): void {
    for (const doc of this.docs.values()) {
      doc.destroy();
    }

    this.docs.clear();
    this.docAwareness.clear();
    this.docConnections.clear();

    this.server?.close();
  }
}
