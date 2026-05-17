import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { SessionsRepository } from 'src/modules/persistence/repositories/sessions.repository';
import { SessionParticipantsRepository } from 'src/modules/persistence/repositories/session-participants.repository';
import { SessionSnapshotsRepository } from 'src/modules/persistence/repositories/session-snapshots.repository';
import { YjsDocStateRepository } from 'src/modules/persistence/repositories/yjs-doc-state.repository';
import { RedisService } from 'src/modules/redis/redis.service';

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

const mockParticipant = {
  id: 'participant-id',
  sessionId: 'session-id',
  userEmail: 'owner@test.com',
  isOnline: true,
  role: 'OWNER' as const,
  joinedAt: new Date(),
  leftAt: null,
};

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionsRepo: jest.Mocked<SessionsRepository>;
  let participantsRepo: jest.Mocked<SessionParticipantsRepository>;
  let snapshotsRepo: jest.Mocked<SessionSnapshotsRepository>;
  let yjsRepo: jest.Mocked<YjsDocStateRepository>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    sessionsRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByInviteCode: jest.fn(),
      listForUser: jest.fn(),
      findActiveByOwnerAndName: jest.fn(),
      updateName: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;

    participantsRepo = {
      upsertOnlineParticipant: jest.fn(),
      updateRole: jest.fn(),
      setOffline: jest.fn(),
      countOnlineBySessionId: jest.fn(),
      findBySessionIdAndUserEmail: jest.fn(),
      listBySessionId: jest.fn(),
    } as unknown as jest.Mocked<SessionParticipantsRepository>;

    snapshotsRepo = {
      create: jest.fn(),
      listBySessionId: jest.fn(),
    } as unknown as jest.Mocked<SessionSnapshotsRepository>;

    yjsRepo = {
      upsert: jest.fn(),
      findBySessionId: jest.fn(),
    } as unknown as jest.Mocked<YjsDocStateRepository>;

    redisService = {
      addSessionMember: jest.fn(),
      removeSessionMember: jest.fn(),
      getSessionMembers: jest.fn(),
      getSessionMembersCount: jest.fn(),
      setSessionState: jest.fn(),
      getSessionState: jest.fn(),
      refreshSessionStateTtl: jest.fn(),
      getYjsDocState: jest.fn(),
      acquireExecutionLock: jest.fn(),
      releaseExecutionLock: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    service = new SessionsService(
      sessionsRepo,
      participantsRepo,
      snapshotsRepo,
      yjsRepo,
      redisService,
    );
  });

  describe('createSession', () => {
    it('creates session and returns result', async () => {
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(null);
      sessionsRepo.findByInviteCode.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue(mockSession);
      participantsRepo.upsertOnlineParticipant.mockResolvedValue(mockParticipant);
      redisService.addSessionMember.mockResolvedValue(1);
      redisService.setSessionState.mockResolvedValue(undefined);

      const result = await service.createSession('owner@test.com', {
        name: 'Test Session',
        language: 'javascript',
      });

      expect(result).toEqual({ session: mockSession, participantsOnline: 1, canJoin: true });
      expect(sessionsRepo.create).toHaveBeenCalled();
      expect(participantsRepo.upsertOnlineParticipant).toHaveBeenCalled();
    });

    it('throws ConflictException when name already taken', async () => {
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(mockSession);

      await expect(
        service.createSession('owner@test.com', { name: 'Test Session' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when unique invite code cannot be generated', async () => {
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(null);
      sessionsRepo.findByInviteCode.mockResolvedValue(mockSession);

      await expect(
        service.createSession('owner@test.com', { name: 'New Session' }),
      ).rejects.toThrow(ConflictException);
    });

    it('uses javascript as default language', async () => {
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(null);
      sessionsRepo.findByInviteCode.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue(mockSession);
      participantsRepo.upsertOnlineParticipant.mockResolvedValue(mockParticipant);
      redisService.addSessionMember.mockResolvedValue(1);
      redisService.setSessionState.mockResolvedValue(undefined);

      await service.createSession('owner@test.com', { name: 'Session' });

      expect(sessionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'javascript' }),
      );
    });
  });

  describe('joinSession', () => {
    it('joins session by invite code', async () => {
      sessionsRepo.findByInviteCode.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(mockParticipant);
      redisService.addSessionMember.mockResolvedValue(1);
      redisService.refreshSessionStateTtl.mockResolvedValue(undefined);
      redisService.getSessionMembersCount.mockResolvedValue(2);

      const result = await service.joinSession('user@test.com', { inviteCode: 'abcd1234' });

      expect(result).toEqual({ session: mockSession, participantsOnline: 2, canJoin: true });
      expect(sessionsRepo.findByInviteCode).toHaveBeenCalledWith('ABCD1234');
    });

    it('throws NotFoundException for unknown invite code', async () => {
      sessionsRepo.findByInviteCode.mockResolvedValue(null);

      await expect(
        service.joinSession('user@test.com', { inviteCode: 'NOPE0000' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for inactive session', async () => {
      sessionsRepo.findByInviteCode.mockResolvedValue({ ...mockSession, isActive: false });

      await expect(
        service.joinSession('user@test.com', { inviteCode: 'ABCD1234' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when session is full', async () => {
      sessionsRepo.findByInviteCode.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(null);
      participantsRepo.countOnlineBySessionId.mockResolvedValue(5);

      await expect(
        service.joinSession('newuser@test.com', { inviteCode: 'ABCD1234' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('joinSessionById', () => {
    it('joins session by id', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(mockParticipant);
      redisService.addSessionMember.mockResolvedValue(1);
      redisService.refreshSessionStateTtl.mockResolvedValue(undefined);
      redisService.getSessionMembersCount.mockResolvedValue(1);

      const result = await service.joinSessionById('session-id', 'owner@test.com');

      expect(result).toEqual({ session: mockSession, participantsOnline: 1, canJoin: true });
    });

    it('throws NotFoundException for inactive session', async () => {
      sessionsRepo.findById.mockResolvedValue({ ...mockSession, isActive: false });

      await expect(
        service.joinSessionById('session-id', 'user@test.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSessionsForUser', () => {
    it('returns sessions list', async () => {
      sessionsRepo.listForUser.mockResolvedValue([mockSession]);

      const result = await service.listSessionsForUser('owner@test.com');

      expect(result).toEqual({ sessions: [mockSession] });
    });
  });

  describe('renameSession', () => {
    it('renames session when owner and new name available', async () => {
      const renamed = { ...mockSession, name: 'New Name' };
      sessionsRepo.findById.mockResolvedValue(mockSession);
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(null);
      sessionsRepo.updateName.mockResolvedValue(renamed);

      const result = await service.renameSession('session-id', 'owner@test.com', { name: 'New Name' });

      expect(result).toEqual({ session: renamed });
    });

    it('returns same session when name unchanged', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      const result = await service.renameSession('session-id', 'owner@test.com', { name: 'Test Session' });

      expect(result).toEqual({ session: mockSession });
      expect(sessionsRepo.updateName).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when not owner', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      await expect(
        service.renameSession('session-id', 'other@test.com', { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when new name already taken', async () => {
      const otherSession = { ...mockSession, id: 'other-id', name: 'New Name' };
      sessionsRepo.findById.mockResolvedValue(mockSession);
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(otherSession);

      await expect(
        service.renameSession('session-id', 'owner@test.com', { name: 'New Name' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteSession', () => {
    it('soft deletes session for owner', async () => {
      const deleted = { ...mockSession, isActive: false };
      sessionsRepo.findById.mockResolvedValue(mockSession);
      sessionsRepo.softDelete.mockResolvedValue(deleted);

      const result = await service.deleteSession('session-id', 'owner@test.com');

      expect(result).toEqual({ session: deleted });
      expect(sessionsRepo.softDelete).toHaveBeenCalledWith('session-id');
    });

    it('throws ForbiddenException for non-owner', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      await expect(
        service.deleteSession('session-id', 'other@test.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getSessionById', () => {
    it('returns session with participants and state from redis', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.listBySessionId.mockResolvedValue([mockParticipant]);
      redisService.getSessionState.mockResolvedValue({ language: 'javascript' });
      redisService.getSessionMembers.mockResolvedValue(['owner@test.com']);

      const result = await service.getSessionById('session-id');

      expect(result.session).toEqual(mockSession);
      expect(result.participants).toEqual([mockParticipant]);
      expect(result.participantsOnline).toBe(1);
      expect(result.state).toEqual({ language: 'javascript' });
    });

    it('initializes redis state when no members online', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.listBySessionId.mockResolvedValue([mockParticipant]);
      redisService.getSessionState.mockResolvedValue({});
      redisService.getSessionMembers.mockResolvedValue([]);
      redisService.setSessionState.mockResolvedValue(undefined);

      const result = await service.getSessionById('session-id');

      expect(redisService.setSessionState).toHaveBeenCalled();
      expect(result.participantsOnline).toBe(1); // from isOnline participants
    });

    it('throws NotFoundException for missing session', async () => {
      sessionsRepo.findById.mockResolvedValue(null);

      await expect(service.getSessionById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSessionCode', () => {
    it('throws NotFoundException when no yjs state', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      redisService.getYjsDocState.mockResolvedValue(null);
      yjsRepo.findBySessionId.mockResolvedValue(null);

      await expect(service.getSessionCode('session-id')).rejects.toThrow(NotFoundException);
    });

    it('reads code from redis yjs state', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      // Build a real Y.Doc state with content
      const Y = await import('yjs');
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'console.log("hello")');
      const state = Y.encodeStateAsUpdate(doc);
      doc.destroy();

      redisService.getYjsDocState.mockResolvedValue(state);

      const result = await service.getSessionCode('session-id');

      expect(result).toEqual({ code: 'console.log("hello")' });
    });

    it('falls back to mongodb yjs state when redis is null', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      redisService.getYjsDocState.mockResolvedValue(null);

      const Y = await import('yjs');
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'from mongo');
      const state = Array.from(Y.encodeStateAsUpdate(doc));
      doc.destroy();

      yjsRepo.findBySessionId.mockResolvedValue({ sessionId: 'session-id', state } as any);

      const result = await service.getSessionCode('session-id');

      expect(result).toEqual({ code: 'from mongo' });
    });
  });

  describe('createSnapshot', () => {
    const snapshotData = {
      id: 'snap-id',
      sessionId: 'session-id',
      savedByEmail: 'owner@test.com',
      language: 'javascript',
      code: 'console.log("snap")',
      createdAt: new Date(),
    };

    it('creates snapshot for owner', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(null);
      snapshotsRepo.create.mockResolvedValue(snapshotData);
      redisService.setSessionState.mockResolvedValue(undefined);

      const result = await service.createSnapshot('session-id', 'owner@test.com', {
        language: 'javascript',
        code: 'console.log("snap")',
      });

      expect(result).toEqual({ snapshot: snapshotData });
    });

    it('throws ForbiddenException for user without save permission', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue({
        ...mockParticipant,
        userEmail: 'user@test.com',
        role: 'VIEW',
      });

      await expect(
        service.createSnapshot('session-id', 'user@test.com', {
          language: 'javascript',
          code: 'code',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows user with VIEW_EDIT_EXECUTE_SAVE to create snapshot', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue({
        ...mockParticipant,
        userEmail: 'user@test.com',
        role: 'VIEW_EDIT_EXECUTE_SAVE',
      });
      snapshotsRepo.create.mockResolvedValue(snapshotData);
      redisService.setSessionState.mockResolvedValue(undefined);

      const result = await service.createSnapshot('session-id', 'user@test.com', {
        language: 'javascript',
        code: 'code',
      });

      expect(result.snapshot).toBeDefined();
    });
  });

  describe('markParticipantOffline', () => {
    it('sets participant offline and removes from redis', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.setOffline.mockResolvedValue({ ...mockParticipant, isOnline: false });
      redisService.removeSessionMember.mockResolvedValue(1);
      redisService.refreshSessionStateTtl.mockResolvedValue(undefined);

      await service.markParticipantOffline('session-id', 'owner@test.com');

      expect(participantsRepo.setOffline).toHaveBeenCalledWith('session-id', 'owner@test.com');
      expect(redisService.removeSessionMember).toHaveBeenCalledWith('session-id', 'owner@test.com');
    });

    it('throws NotFoundException for missing session', async () => {
      sessionsRepo.findById.mockResolvedValue(null);

      await expect(
        service.markParticipantOffline('bad-id', 'user@test.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('acquireRunLock / releaseRunLock', () => {
    it('acquires run lock', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      redisService.acquireExecutionLock.mockResolvedValue(true);

      const result = await service.acquireRunLock('session-id', 'owner');

      expect(result).toBe(true);
    });

    it('releases run lock', async () => {
      redisService.releaseExecutionLock.mockResolvedValue(undefined);

      await service.releaseRunLock('session-id', 'owner');

      expect(redisService.releaseExecutionLock).toHaveBeenCalledWith('session-id', 'owner');
    });
  });

  describe('getRolesMap', () => {
    it('returns roles map with owner marked as OWNER', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.listBySessionId.mockResolvedValue([
        { ...mockParticipant, userEmail: 'owner@test.com', role: 'VIEW' as any },
        { ...mockParticipant, userEmail: 'user@test.com', role: 'VIEW_EDIT' as any },
      ]);

      const result = await service.getRolesMap('session-id');

      expect(result['owner@test.com']).toBe('OWNER');
      expect(result['user@test.com']).toBe('VIEW_EDIT');
    });
  });

  describe('updateParticipantRole', () => {
    it('updates role for participant', async () => {
      const participant = { ...mockParticipant, userEmail: 'user@test.com', role: 'VIEW' as any };
      const updated = { ...participant, role: 'VIEW_EDIT' as any };

      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(participant);
      participantsRepo.updateRole.mockResolvedValue(updated);

      const result = await service.updateParticipantRole(
        'session-id', 'owner@test.com', 'user@test.com', 'VIEW_EDIT',
      );

      expect(result.participant).toEqual(updated);
    });

    it('throws ForbiddenException when non-owner tries to change roles', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      await expect(
        service.updateParticipantRole('session-id', 'user@test.com', 'other@test.com', 'VIEW_EDIT'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when targeting owner', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      await expect(
        service.updateParticipantRole('session-id', 'owner@test.com', 'owner@test.com', 'VIEW'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when assigning OWNER role', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);

      await expect(
        service.updateParticipantRole('session-id', 'owner@test.com', 'user@test.com', 'OWNER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant not found', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(null);

      await expect(
        service.updateParticipantRole('session-id', 'owner@test.com', 'notfound@test.com', 'VIEW'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markParticipantOnline — branch coverage', () => {
    it('skips count check when participant already online', async () => {
      // Participant exists AND isOnline=true → skip countOnlineBySessionId entirely
      sessionsRepo.findByInviteCode.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue({
        ...mockParticipant,
        userEmail: 'owner@test.com',
        isOnline: true,
      });
      participantsRepo.upsertOnlineParticipant.mockResolvedValue(mockParticipant);
      redisService.addSessionMember.mockResolvedValue(1);
      redisService.refreshSessionStateTtl.mockResolvedValue(undefined);
      redisService.getSessionMembersCount.mockResolvedValue(1);

      const result = await service.joinSession('owner@test.com', { inviteCode: 'ABCD1234' });

      expect(participantsRepo.countOnlineBySessionId).not.toHaveBeenCalled();
      expect(result.canJoin).toBe(true);
    });

    it('runs count check when participant exists but is offline', async () => {
      sessionsRepo.findByInviteCode.mockResolvedValue(mockSession);
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue({
        ...mockParticipant,
        isOnline: false,
      });
      participantsRepo.countOnlineBySessionId.mockResolvedValue(2);
      participantsRepo.upsertOnlineParticipant.mockResolvedValue(mockParticipant);
      redisService.addSessionMember.mockResolvedValue(1);
      redisService.refreshSessionStateTtl.mockResolvedValue(undefined);
      redisService.getSessionMembersCount.mockResolvedValue(3);

      const result = await service.joinSession('owner@test.com', { inviteCode: 'ABCD1234' });

      expect(participantsRepo.countOnlineBySessionId).toHaveBeenCalled();
      expect(result.canJoin).toBe(true);
    });
  });

  describe('loadYjsState — branch coverage', () => {
    it('falls back to mongo when redis state has zero byteLength', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      // Non-null but empty Uint8Array → byteLength === 0 → should fall through to mongo
      redisService.getYjsDocState.mockResolvedValue(new Uint8Array(0));
      yjsRepo.findBySessionId.mockResolvedValue(null);

      await expect(service.getSessionCode('session-id')).rejects.toThrow(NotFoundException);
      expect(yjsRepo.findBySessionId).toHaveBeenCalled();
    });

    it('returns null when mongo state array is empty', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      redisService.getYjsDocState.mockResolvedValue(null);
      yjsRepo.findBySessionId.mockResolvedValue({ sessionId: 'session-id', state: [] } as any);

      await expect(service.getSessionCode('session-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertNameAvailableForOwner — branch coverage', () => {
    it('does not throw when existing session has same id as excluded', async () => {
      // Same session being renamed to same name — exclude own id
      sessionsRepo.findById.mockResolvedValue(mockSession);
      // findActiveByOwnerAndName returns THIS session (same id) → no conflict
      sessionsRepo.findActiveByOwnerAndName.mockResolvedValue(mockSession);
      sessionsRepo.updateName.mockResolvedValue({ ...mockSession, name: 'Different' });

      // renameSession passes excludeSessionId = 'session-id' which matches mockSession.id
      const result = await service.renameSession('session-id', 'owner@test.com', { name: 'Different' });

      expect(result.session).toBeDefined();
    });
  });

  describe('getSessionById — branch coverage', () => {
    it('counts offline participants as 0 when redisMembers empty and all offline', async () => {
      sessionsRepo.findById.mockResolvedValue(mockSession);
      participantsRepo.listBySessionId.mockResolvedValue([
        { ...mockParticipant, isOnline: false },
      ]);
      redisService.getSessionState.mockResolvedValue({});
      redisService.getSessionMembers.mockResolvedValue([]);
      redisService.setSessionState.mockResolvedValue(undefined);

      const result = await service.getSessionById('session-id');

      expect(result.participantsOnline).toBe(0);
    });
  });
});
