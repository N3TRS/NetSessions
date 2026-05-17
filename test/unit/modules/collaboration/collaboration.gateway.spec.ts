import { UnauthorizedException } from '@nestjs/common';
import { CollaborationGateway } from 'src/modules/collaboration/collaboration.gateway';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { RedisService } from 'src/modules/redis/redis.service';

const mockSession = {
  id: 'session-id',
  name: 'Test',
  inviteCode: 'ABCD',
  ownerEmail: 'owner@test.com',
  language: 'javascript',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeClient = (email?: string, sessionId?: string) => ({
  id: 'socket-id',
  data: {
    user: email ? { email } : undefined,
    activeSessionId: sessionId,
  },
  join: jest.fn().mockResolvedValue(undefined),
  leave: jest.fn().mockResolvedValue(undefined),
});

const makeServer = () => ({
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
});

describe('CollaborationGateway', () => {
  let gateway: CollaborationGateway;
  let sessionsService: jest.Mocked<SessionsService>;
  let redisService: jest.Mocked<RedisService>;
  let server: ReturnType<typeof makeServer>;

  beforeEach(() => {
    sessionsService = {
      joinSessionById: jest.fn(),
      markParticipantOffline: jest.fn(),
      getRolesMap: jest.fn(),
    } as unknown as jest.Mocked<SessionsService>;

    redisService = {
      assignSessionColor: jest.fn(),
      getSessionMembers: jest.fn(),
      getSessionState: jest.fn(),
      getSessionColors: jest.fn(),
      publishSessionEvent: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    gateway = new CollaborationGateway(sessionsService, redisService);

    server = makeServer();
    (gateway as any).server = server;
  });

  describe('handleConnection', () => {
    it('logs connection without throwing', () => {
      const client = makeClient('user@test.com');
      expect(() => gateway.handleConnection(client as any)).not.toThrow();
    });

    it('handles connection with no user email', () => {
      const client = makeClient();
      expect(() => gateway.handleConnection(client as any)).not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('does nothing when no activeSessionId', async () => {
      const client = makeClient('user@test.com');

      await gateway.handleDisconnect(client as any);

      expect(sessionsService.markParticipantOffline).not.toHaveBeenCalled();
    });

    it('does nothing when no user email', async () => {
      const client = makeClient(undefined, 'session-id');

      await gateway.handleDisconnect(client as any);

      expect(sessionsService.markParticipantOffline).not.toHaveBeenCalled();
    });

    it('marks participant offline and emits presence on disconnect', async () => {
      const client = makeClient('user@test.com', 'session-id');
      sessionsService.markParticipantOffline.mockResolvedValue(undefined);
      redisService.publishSessionEvent.mockResolvedValue(1);
      redisService.getSessionColors.mockResolvedValue({ 'user@test.com': '#7C3AED' });
      sessionsService.getRolesMap.mockResolvedValue({ 'user@test.com': 'VIEW' });

      await gateway.handleDisconnect(client as any);

      expect(sessionsService.markParticipantOffline).toHaveBeenCalledWith('session-id', 'user@test.com');
      expect(redisService.publishSessionEvent).toHaveBeenCalled();
      expect(server.to).toHaveBeenCalledWith('session:session-id');
      expect(server.emit).toHaveBeenCalledWith('session.presence', expect.objectContaining({ status: 'offline' }));
    });
  });

  describe('onSessionJoin', () => {
    it('joins session and emits presence', async () => {
      const client = makeClient('user@test.com');
      sessionsService.joinSessionById.mockResolvedValue({
        session: mockSession,
        participantsOnline: 1,
        canJoin: true,
      });
      redisService.assignSessionColor.mockResolvedValue('#7C3AED');
      redisService.getSessionMembers.mockResolvedValue(['user@test.com']);
      redisService.getSessionState.mockResolvedValue({ language: 'javascript' });
      redisService.getSessionColors.mockResolvedValue({ 'user@test.com': '#7C3AED' });
      sessionsService.getRolesMap.mockResolvedValue({ 'user@test.com': 'VIEW' });
      redisService.publishSessionEvent.mockResolvedValue(1);

      const result = await gateway.onSessionJoin(client as any, { sessionId: 'session-id' });

      expect(client.join).toHaveBeenCalledWith('session:session-id');
      expect(client.data.activeSessionId).toBe('session-id');
      expect(result.event).toBe('session.joined');
      expect(result.data.session).toEqual(mockSession);
      expect(server.emit).toHaveBeenCalledWith('session.presence', expect.objectContaining({ status: 'online' }));
    });

    it('throws UnauthorizedException when no email on client', async () => {
      const client = makeClient();

      await expect(gateway.onSessionJoin(client as any, { sessionId: 'session-id' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('onSessionLeave', () => {
    it('leaves session and emits presence', async () => {
      const client = makeClient('user@test.com', 'session-id');
      sessionsService.markParticipantOffline.mockResolvedValue(undefined);
      redisService.publishSessionEvent.mockResolvedValue(1);
      redisService.getSessionMembers.mockResolvedValue([]);
      redisService.getSessionColors.mockResolvedValue({});
      sessionsService.getRolesMap.mockResolvedValue({});

      const result = await gateway.onSessionLeave(client as any, { sessionId: 'session-id' });

      expect(client.leave).toHaveBeenCalledWith('session:session-id');
      expect(client.data.activeSessionId).toBeUndefined();
      expect(result.event).toBe('session.left');
      expect(result.data.sessionId).toBe('session-id');
    });
  });

  describe('emitExecutionResult', () => {
    it('emits to correct room', () => {
      const payload = { sessionId: 'session-id', runBy: 'user@test.com', run: {} };

      gateway.emitExecutionResult('session-id', payload);

      expect(server.to).toHaveBeenCalledWith('session:session-id');
      expect(server.emit).toHaveBeenCalledWith('execution.result', payload);
    });
  });

  describe('emitRoleUpdated', () => {
    it('emits to correct room', () => {
      const payload = { sessionId: 'session-id', userEmail: 'user@test.com', role: 'VIEW_EDIT' };

      gateway.emitRoleUpdated('session-id', payload);

      expect(server.to).toHaveBeenCalledWith('session:session-id');
      expect(server.emit).toHaveBeenCalledWith('session.roleUpdated', payload);
    });
  });
});
