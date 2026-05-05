import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WhiteboardJwtGuard } from './whiteboard-jwt.guard';

interface CollaboratorState {
  userEmail: string;
  userColor: string;
  cursor: { x: number; y: number } | null;
}

@WebSocketGateway({
  namespace: '/ws/whiteboard',
  cors: {
    origin: true,
    credentials: true,
  },
})
@UseGuards(WhiteboardJwtGuard)
export class WhiteboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WhiteboardGateway.name);

  private readonly roomElements = new Map<string, unknown[]>();

  private readonly roomCollaborators = new Map<
    string,
    Map<string, CollaboratorState>
  >();

  private readonly clientMeta = new Map<
    string,
    { sessionId: string; userEmail: string; userColor: string }
  >();

  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Whiteboard connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const meta = this.clientMeta.get(client.id);
    if (meta) {
      const { sessionId, userEmail } = meta;
      this.clientMeta.delete(client.id);

      const collabs = this.roomCollaborators.get(sessionId);
      if (collabs) {
        collabs.delete(client.id);
        if (collabs.size === 0) this.roomCollaborators.delete(sessionId);
      }

      client
        .to(this.room(sessionId))
        .emit('whiteboard.collaboratorLeft', { userEmail });
    }
    this.logger.debug(`Whiteboard disconnected: ${client.id}`);
  }

  @SubscribeMessage('whiteboard.join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = String(payload?.sessionId ?? 'global');
    const userEmail = String(payload?.userEmail ?? 'anonymous');
    const userColor = String(payload?.userColor ?? '#7C3AED');

    await client.join(this.room(sessionId));

    this.clientMeta.set(client.id, { sessionId, userEmail, userColor });

    // Register in room collaborators
    let collabs = this.roomCollaborators.get(sessionId);
    if (!collabs) {
      collabs = new Map();
      this.roomCollaborators.set(sessionId, collabs);
    }
    collabs.set(client.id, { userEmail, userColor, cursor: null });

    const elements = this.roomElements.get(sessionId) ?? [];
    const collaborators = this.getCollaboratorsExcept(sessionId, client.id);
    client.emit('whiteboard.joined', { sessionId, elements, collaborators });

    // Announce arrival to the rest of the room
    client
      .to(this.room(sessionId))
      .emit('whiteboard.collaboratorJoined', { userEmail, userColor });

    this.logger.debug(
      `${userEmail} joined whiteboard room ${sessionId} (${elements.length} elements, ${collaborators.length} peers)`,
    );
  }

  @SubscribeMessage('whiteboard.update')
  onUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Record<string, unknown>,
  ): void {
    const sessionId = String(payload?.sessionId ?? 'global');
    const elements = Array.isArray(payload?.elements) ? payload.elements : [];

    this.roomElements.set(sessionId, elements);
    // Broadcast to everyone in the room EXCEPT the sender
    client.to(this.room(sessionId)).emit('whiteboard.update', { elements });
  }

  @SubscribeMessage('whiteboard.pointer')
  onPointer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Record<string, unknown>,
  ): void {
    const sessionId = String(payload?.sessionId ?? 'global');
    const x = Number(payload?.x ?? 0);
    const y = Number(payload?.y ?? 0);

    const meta = this.clientMeta.get(client.id);
    if (!meta) return;

    // Update stored cursor so latecomers see it via getCollaboratorsExcept
    const collab = this.roomCollaborators.get(sessionId)?.get(client.id);
    if (collab) collab.cursor = { x, y };

    client.to(this.room(sessionId)).emit('whiteboard.pointer', {
      userEmail: meta.userEmail,
      userColor: meta.userColor,
      x,
      y,
    });
  }

  private getCollaboratorsExcept(
    sessionId: string,
    excludeSocketId: string,
  ): CollaboratorState[] {
    const collabs = this.roomCollaborators.get(sessionId);
    if (!collabs) return [];
    return Array.from(collabs.entries())
      .filter(([id]) => id !== excludeSocketId)
      .map(([, state]) => state);
  }

  private room(sessionId: string): string {
    return `wb:${sessionId}`;
  }
}
