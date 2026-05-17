import { UnauthorizedException } from '@nestjs/common';
import { SessionsController } from 'src/modules/sessions/sessions.controller';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { CollaborationGateway } from 'src/modules/collaboration/collaboration.gateway';

const makeRequest = (email?: string) => ({
  user: email ? { email } : undefined,
} as any);

const mockSession = {
  id: 'session-id',
  name: 'Test Session',
  inviteCode: 'ABCD1234',
  ownerEmail: 'owner@test.com',
  language: 'javascript',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SessionsController', () => {
  let controller: SessionsController;
  let sessionsService: jest.Mocked<SessionsService>;
  let collaborationGateway: jest.Mocked<CollaborationGateway>;

  beforeEach(() => {
    sessionsService = {
      createSession: jest.fn(),
      joinSession: jest.fn(),
      listSessionsForUser: jest.fn(),
      getSessionById: jest.fn(),
      getSessionCode: jest.fn(),
      renameSession: jest.fn(),
      deleteSession: jest.fn(),
      createSnapshot: jest.fn(),
      updateParticipantRole: jest.fn(),
    } as unknown as jest.Mocked<SessionsService>;

    collaborationGateway = {
      emitRoleUpdated: jest.fn(),
    } as unknown as jest.Mocked<CollaborationGateway>;

    controller = new SessionsController(sessionsService, collaborationGateway);
  });

  describe('createSession', () => {
    it('calls service with user email', async () => {
      const dto = { name: 'Test Session', language: 'javascript' };
      const expected = { session: mockSession, participantsOnline: 1, canJoin: true };
      sessionsService.createSession.mockResolvedValue(expected);

      const result = await controller.createSession(makeRequest('owner@test.com'), dto);

      expect(sessionsService.createSession).toHaveBeenCalledWith('owner@test.com', dto);
      expect(result).toEqual(expected);
    });

    it('throws UnauthorizedException when no user email', () => {
      expect(() => controller.createSession(makeRequest(), { name: 'Test' }))
        .toThrow(UnauthorizedException);
    });
  });

  describe('joinSession', () => {
    it('calls service with user email and dto', async () => {
      const dto = { inviteCode: 'ABCD1234' };
      const expected = { session: mockSession, participantsOnline: 1, canJoin: true };
      sessionsService.joinSession.mockResolvedValue(expected);

      const result = await controller.joinSession(makeRequest('user@test.com'), dto);

      expect(sessionsService.joinSession).toHaveBeenCalledWith('user@test.com', dto);
      expect(result).toEqual(expected);
    });

    it('throws UnauthorizedException when no user email', () => {
      expect(() => controller.joinSession(makeRequest(), { inviteCode: 'ABCD' }))
        .toThrow(UnauthorizedException);
    });
  });

  describe('listMySessions', () => {
    it('calls service with user email', async () => {
      sessionsService.listSessionsForUser.mockResolvedValue({ sessions: [mockSession] });

      const result = await controller.listMySessions(makeRequest('user@test.com'));

      expect(sessionsService.listSessionsForUser).toHaveBeenCalledWith('user@test.com');
      expect(result).toEqual({ sessions: [mockSession] });
    });
  });

  describe('getSession', () => {
    it('calls service with id', async () => {
      sessionsService.getSessionById.mockResolvedValue({
        session: mockSession,
        participants: [],
        participantsOnline: 1,
        state: {},
      });

      const result = await controller.getSession('session-id');

      expect(sessionsService.getSessionById).toHaveBeenCalledWith('session-id');
      expect(result.session).toEqual(mockSession);
    });
  });

  describe('getCode', () => {
    it('calls service with id', async () => {
      sessionsService.getSessionCode.mockResolvedValue({ code: 'console.log()' });

      const result = await controller.getCode('session-id');

      expect(sessionsService.getSessionCode).toHaveBeenCalledWith('session-id');
      expect(result).toEqual({ code: 'console.log()' });
    });
  });

  describe('renameSession', () => {
    it('calls service with id, email, and dto', async () => {
      const dto = { name: 'New Name' };
      sessionsService.renameSession.mockResolvedValue({ session: { ...mockSession, name: 'New Name' } });

      const result = await controller.renameSession('session-id', makeRequest('owner@test.com'), dto);

      expect(sessionsService.renameSession).toHaveBeenCalledWith('session-id', 'owner@test.com', dto);
      expect(result.session.name).toBe('New Name');
    });
  });

  describe('deleteSession', () => {
    it('calls service with id and email', async () => {
      sessionsService.deleteSession.mockResolvedValue({ session: { ...mockSession, isActive: false } });

      const result = await controller.deleteSession('session-id', makeRequest('owner@test.com'));

      expect(sessionsService.deleteSession).toHaveBeenCalledWith('session-id', 'owner@test.com');
    });
  });

  describe('createSnapshot', () => {
    it('calls service with id, email, and dto', async () => {
      const dto = { language: 'javascript', code: 'code' };
      const snap = { id: 'snap-id', sessionId: 'session-id', savedByEmail: 'owner@test.com', language: 'javascript', code: 'code', createdAt: new Date() };
      sessionsService.createSnapshot.mockResolvedValue({ snapshot: snap });

      const result = await controller.createSnapshot('session-id', makeRequest('owner@test.com'), dto);

      expect(sessionsService.createSnapshot).toHaveBeenCalledWith('session-id', 'owner@test.com', dto);
    });
  });

  describe('updateParticipantRole', () => {
    it('calls service and emits role update via gateway', async () => {
      const dto = { role: 'VIEW_EDIT' as const };
      const participant = { id: 'p-id', sessionId: 'session-id', userEmail: 'user@test.com', role: 'VIEW_EDIT' as any, isOnline: true, joinedAt: new Date(), leftAt: null };
      sessionsService.updateParticipantRole.mockResolvedValue({
        participant,
        changedBy: 'owner@test.com',
        session: mockSession,
      });

      const result = await controller.updateParticipantRole(
        'session-id',
        encodeURIComponent('user@test.com'),
        makeRequest('owner@test.com'),
        dto,
      );

      expect(sessionsService.updateParticipantRole).toHaveBeenCalledWith(
        'session-id', 'owner@test.com', 'user@test.com', 'VIEW_EDIT',
      );
      expect(collaborationGateway.emitRoleUpdated).toHaveBeenCalled();
      expect(result).toEqual({ participant });
    });
  });
});
