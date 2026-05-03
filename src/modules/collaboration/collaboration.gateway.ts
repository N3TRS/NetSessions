import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  UnauthorizedException,
  Logger,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionsService } from '../sessions/sessions.service';
import { RedisService } from '../redis/redis.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { WsSessionDto } from './dto/ws-session.dto';
import { WsSessionLeaveDto } from './dto/ws-session-leave.dto';
import { WsUser } from './interfaces/ws-user.interface';

type SocketWithUser = Socket & {
  data: { user?: WsUser; activeSessionId?: string };
};

const USER_COLOR_PALETTE = [
  '#7C3AED',
  '#F97316',
  '#2563EB',
  '#16A34A',
  '#DB2777',
  '#0891B2',
  '#CA8A04',
  '#DC2626',
] as const;

@WebSocketGateway({
  namespace: '/ws/session',
  cors: {
    origin: true,
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CollaborationGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly redisService: RedisService,
  ) {}

  handleConnection(client: SocketWithUser): void {
    const userEmail = client.data.user?.email;
    this.logger.debug(
      `Client connected ${client.id}${userEmail ? ` (${userEmail})` : ''}`,
    );
  }

  emitExecutionResult(sessionId: string, payload: unknown): void {
    this.server.to(this.roomName(sessionId)).emit('execution.result', payload);
  }

  async handleDisconnect(client: SocketWithUser): Promise<void> {
    const sessionId = client.data.activeSessionId;
    const userEmail = client.data.user?.email;

    if (!sessionId || !userEmail) {
      return;
    }

    await this.sessionsService.markParticipantOffline(sessionId, userEmail);
    await this.redisService.publishSessionEvent(sessionId, {
      type: 'session.presence',
      sessionId,
      userEmail,
      status: 'offline',
      at: new Date().toISOString(),
    });

    const colors = await this.redisService.getSessionColors(sessionId);

    this.server.to(this.roomName(sessionId)).emit('session.presence', {
      sessionId,
      userEmail,
      status: 'offline',
      colors,
    });
  }

  @SubscribeMessage('session.join')
  async onSessionJoin(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: WsSessionDto,
  ) {
    const userEmail = this.getUserEmail(client);
    const joined = await this.sessionsService.joinSessionById(
      payload.sessionId,
      userEmail,
    );

    await client.join(this.roomName(payload.sessionId));
    client.data.activeSessionId = payload.sessionId;

    await this.redisService.assignSessionColor(
      payload.sessionId,
      userEmail,
      USER_COLOR_PALETTE,
    );

    const members = await this.redisService.getSessionMembers(
      payload.sessionId,
    );
    const state = await this.redisService.getSessionState(payload.sessionId);
    const colors = await this.redisService.getSessionColors(payload.sessionId);

    await this.redisService.publishSessionEvent(payload.sessionId, {
      type: 'session.presence',
      sessionId: payload.sessionId,
      userEmail,
      status: 'online',
      at: new Date().toISOString(),
    });

    this.server.to(this.roomName(payload.sessionId)).emit('session.presence', {
      sessionId: payload.sessionId,
      userEmail,
      status: 'online',
      members,
      participantsOnline: joined.participantsOnline,
      colors,
    });

    return {
      event: 'session.joined',
      data: {
        session: joined.session,
        participantsOnline: joined.participantsOnline,
        members,
        state,
        colors,
      },
    };
  }

  @SubscribeMessage('session.leave')
  async onSessionLeave(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: WsSessionLeaveDto,
  ) {
    const userEmail = this.getUserEmail(client);

    await this.sessionsService.markParticipantOffline(
      payload.sessionId,
      userEmail,
    );
    await this.redisService.publishSessionEvent(payload.sessionId, {
      type: 'session.presence',
      sessionId: payload.sessionId,
      userEmail,
      status: 'offline',
      at: new Date().toISOString(),
    });

    await client.leave(this.roomName(payload.sessionId));
    client.data.activeSessionId = undefined;

    const members = await this.redisService.getSessionMembers(
      payload.sessionId,
    );
    const colors = await this.redisService.getSessionColors(payload.sessionId);

    this.server.to(this.roomName(payload.sessionId)).emit('session.presence', {
      sessionId: payload.sessionId,
      userEmail,
      status: 'offline',
      members,
      participantsOnline: members.length,
      colors,
    });

    return {
      event: 'session.left',
      data: {
        sessionId: payload.sessionId,
        participantsOnline: members.length,
      },
    };
  }

  private roomName(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getUserEmail(client: SocketWithUser): string {
    const email = client.data.user?.email;

    if (!email) {
      throw new UnauthorizedException(
        'Authenticated websocket user email is required',
      );
    }

    return email;
  }
}
