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
import * as awarenessProtocol from 'y-protocols/awareness';
import { SessionParticipantsRepository } from '../persistence/repositories/session-participants.repository';
import { YjsDocStateRepository } from '../persistence/repositories/yjs-doc-state.repository';
import { RedisService } from '../redis/redis.service';

interface JwtPayload {
  email?: string;
  role?: string;
  avatarUrl?: string;
}

interface SessionRoom {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  connAwareness: Map<WebSocket, Set<number>>;
  redisTimer?: NodeJS.Timeout;
  mongoTimer?: NodeJS.Timeout;
}

const FRAME_SYNC_FULL = 0x00;
const FRAME_SYNC_UPDATE = 0x01;
const FRAME_AWARENESS = 0x02;

const REDIS_PERSIST_DEBOUNCE_MS = 500;
const MONGO_PERSIST_DEBOUNCE_MS = 5_000;

@Injectable()
export class YjsService implements OnApplicationShutdown {
  private readonly logger = new Logger(YjsService.name);
  private server?: WebSocketServer;
  private readonly rooms = new Map<string, SessionRoom>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly sessionParticipantsRepository: SessionParticipantsRepository,
    private readonly yjsDocStateRepository: YjsDocStateRepository,
    private readonly redisService: RedisService,
  ) {}

  initialize(server: import('http').Server): void {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ noServer: true });

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

  private async onConnection(
    conn: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
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
        throw new UnauthorizedException(
          'User is not a participant of this session',
        );
      }

      await this.setupConnection(conn, sessionId);
    } catch (error) {
      this.logger.warn(
        `Yjs connection rejected: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      conn.close(1008, 'Unauthorized');
    }
  }

  private async setupConnection(
    conn: WebSocket,
    sessionId: string,
  ): Promise<void> {
    conn.binaryType = 'arraybuffer';

    const room = await this.getOrCreateRoom(sessionId);
    room.conns.add(conn);
    room.connAwareness.set(conn, new Set<number>());

    conn.on('message', (message) => {
      const data =
        message instanceof Buffer
          ? new Uint8Array(message)
          : new Uint8Array(message as ArrayBuffer);

      this.handleFrame(conn, room, sessionId, data);
    });

    conn.on('close', () => {
      this.onConnectionClose(conn, room);
    });

    this.sendFrame(conn, FRAME_SYNC_FULL, Y.encodeStateAsUpdate(room.doc));

    const awarenessStates = room.awareness.getStates();
    if (awarenessStates.size > 0) {
      const payload = awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(awarenessStates.keys()),
      );
      this.sendFrame(conn, FRAME_AWARENESS, payload);
    }
  }

  private async getOrCreateRoom(sessionId: string): Promise<SessionRoom> {
    const cached = this.rooms.get(sessionId);
    if (cached) {
      await this.redisService
        .refreshYjsDocStateTtl(sessionId)
        .catch(() => undefined);
      return cached;
    }

    const doc = new Y.Doc();

    try {
      const redisState = await this.redisService.getYjsDocState(sessionId);
      if (redisState && redisState.byteLength > 0) {
        Y.applyUpdate(doc, redisState);
      } else {
        const mongoState =
          await this.yjsDocStateRepository.findBySessionId(sessionId);
        if (mongoState?.state && mongoState.state.length > 0) {
          Y.applyUpdate(doc, Uint8Array.from(mongoState.state));
          await this.redisService.setYjsDocState(
            sessionId,
            Y.encodeStateAsUpdate(doc),
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to hydrate Yjs doc ${sessionId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);

    const room: SessionRoom = {
      doc,
      awareness,
      conns: new Set<WebSocket>(),
      connAwareness: new Map<WebSocket, Set<number>>(),
    };

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const exceptConn = origin instanceof WebSocket ? origin : undefined;
      this.broadcastFrame(room, FRAME_SYNC_UPDATE, update, exceptConn);
      this.scheduleRedisPersist(room, sessionId);
      this.scheduleMongoPersist(room, sessionId);
    });

    awareness.on(
      'update',
      (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const originConn = origin instanceof WebSocket ? origin : undefined;
        if (originConn && room.connAwareness.has(originConn)) {
          const controlled = room.connAwareness.get(originConn)!;
          for (const clientId of added) controlled.add(clientId);
          for (const clientId of removed) controlled.delete(clientId);
        }

        const changed = added.concat(updated, removed);
        if (changed.length === 0) return;

        const payload = awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          changed,
        );
        this.broadcastFrame(room, FRAME_AWARENESS, payload, originConn);
      },
    );

    this.rooms.set(sessionId, room);
    return room;
  }

  private handleFrame(
    conn: WebSocket,
    room: SessionRoom,
    sessionId: string,
    frame: Uint8Array,
  ): void {
    if (frame.length === 0) return;

    try {
      const type = frame[0];
      const payload = frame.subarray(1);

      if (type === FRAME_SYNC_UPDATE) {
        Y.applyUpdate(room.doc, payload, conn);
        return;
      }

      if (type === FRAME_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, payload, conn);
        return;
      }

      this.logger.warn(
        `Unknown Yjs frame type 0x${type.toString(16)} for ${sessionId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Yjs frame error for ${sessionId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private encodeFrame(type: number, payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(payload.length + 1);
    frame[0] = type;
    frame.set(payload, 1);
    return frame;
  }

  private sendFrame(conn: WebSocket, type: number, payload: Uint8Array): void {
    if (conn.readyState !== WebSocket.OPEN) return;
    conn.send(this.encodeFrame(type, payload));
  }

  private broadcastFrame(
    room: SessionRoom,
    type: number,
    payload: Uint8Array,
    except?: WebSocket,
  ): void {
    if (room.conns.size === 0) return;

    const frame = this.encodeFrame(type, payload);
    for (const conn of room.conns) {
      if (conn === except) continue;
      if (conn.readyState !== WebSocket.OPEN) continue;
      conn.send(frame);
    }
  }

  private scheduleRedisPersist(room: SessionRoom, sessionId: string): void {
    if (room.redisTimer) clearTimeout(room.redisTimer);

    room.redisTimer = setTimeout(() => {
      room.redisTimer = undefined;
      this.redisService
        .setYjsDocState(sessionId, Y.encodeStateAsUpdate(room.doc))
        .catch((error) => {
          this.logger.warn(
            `Failed to persist Yjs doc ${sessionId} to Redis: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        });
    }, REDIS_PERSIST_DEBOUNCE_MS);
  }

  private scheduleMongoPersist(room: SessionRoom, sessionId: string): void {
    if (room.mongoTimer) clearTimeout(room.mongoTimer);

    room.mongoTimer = setTimeout(() => {
      room.mongoTimer = undefined;
      this.yjsDocStateRepository
        .upsert(sessionId, Y.encodeStateAsUpdate(room.doc))
        .catch((error) => {
          this.logger.warn(
            `Failed to persist Yjs doc ${sessionId} to Mongo: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        });
    }, MONGO_PERSIST_DEBOUNCE_MS);
  }

  private onConnectionClose(conn: WebSocket, room: SessionRoom): void {
    room.conns.delete(conn);
    const controlled = room.connAwareness.get(conn);
    room.connAwareness.delete(conn);

    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(controlled),
        null,
      );
    }
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

  async onApplicationShutdown(): Promise<void> {
    const flushes: Promise<void>[] = [];

    for (const [sessionId, room] of this.rooms.entries()) {
      if (room.redisTimer) clearTimeout(room.redisTimer);
      if (room.mongoTimer) clearTimeout(room.mongoTimer);

      flushes.push(
        this.yjsDocStateRepository
          .upsert(sessionId, Y.encodeStateAsUpdate(room.doc))
          .catch((error) => {
            this.logger.warn(
              `Failed to flush Yjs doc ${sessionId} on shutdown: ${
                error instanceof Error ? error.message : 'unknown error'
              }`,
            );
          }),
      );
    }

    await Promise.allSettled(flushes);

    for (const room of this.rooms.values()) {
      room.doc.destroy();
    }

    this.rooms.clear();
    this.server?.close();
  }
}
