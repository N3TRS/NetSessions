import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExecutionService } from 'src/modules/execution/execution.service';
import { PistonService } from 'src/modules/execution/piston.service';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { CollaborationGateway } from 'src/modules/collaboration/collaboration.gateway';

const mockSession = {
  id: 'session-id',
  name: 'Test',
  inviteCode: 'ABCD1234',
  ownerEmail: 'owner@test.com',
  language: 'javascript',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ownerParticipant = {
  id: 'p1',
  sessionId: 'session-id',
  userEmail: 'owner@test.com',
  role: 'OWNER' as any,
  isOnline: true,
  joinedAt: new Date(),
  leftAt: null,
};

describe('ExecutionService', () => {
  let service: ExecutionService;
  let pistonService: jest.Mocked<PistonService>;
  let sessionsService: jest.Mocked<SessionsService>;
  let redisService: jest.Mocked<RedisService>;
  let collaborationGateway: jest.Mocked<CollaborationGateway>;

  const dto = {
    sessionId: 'session-id',
    language: 'javascript',
    code: 'console.log("hello")',
    stdin: '',
    args: [],
  };

  beforeEach(() => {
    pistonService = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<PistonService>;

    sessionsService = {
      acquireRunLock: jest.fn(),
      releaseRunLock: jest.fn(),
      getSessionById: jest.fn(),
    } as unknown as jest.Mocked<SessionsService>;

    redisService = {
      setSessionState: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    collaborationGateway = {
      emitExecutionResult: jest.fn(),
    } as unknown as jest.Mocked<CollaborationGateway>;

    service = new ExecutionService(pistonService, sessionsService, redisService, collaborationGateway);
  });

  it('executes code and returns result', async () => {
    const pistonResult = { language: 'javascript', version: '18.15.0', run: { stdout: 'hello\n', stderr: '', code: 0, signal: null, output: 'hello\n' } };

    sessionsService.acquireRunLock.mockResolvedValue(true);
    sessionsService.getSessionById.mockResolvedValue({
      session: mockSession,
      participants: [ownerParticipant],
      participantsOnline: 1,
      state: {},
    });
    pistonService.execute.mockResolvedValue(pistonResult);
    redisService.setSessionState.mockResolvedValue(undefined);
    sessionsService.releaseRunLock.mockResolvedValue(undefined);

    const result = await service.runCode('owner@test.com', dto);

    expect(result).toMatchObject({ sessionId: 'session-id', runBy: 'owner@test.com' });
    expect(pistonService.execute).toHaveBeenCalledWith({
      language: dto.language,
      code: dto.code,
      stdin: dto.stdin,
      args: dto.args,
    });
    expect(collaborationGateway.emitExecutionResult).toHaveBeenCalledWith('session-id', expect.objectContaining({ sessionId: 'session-id' }));
    expect(sessionsService.releaseRunLock).toHaveBeenCalled();
  });

  it('throws ConflictException when lock not acquired', async () => {
    sessionsService.acquireRunLock.mockResolvedValue(false);

    await expect(service.runCode('owner@test.com', dto)).rejects.toThrow(ConflictException);
    expect(sessionsService.releaseRunLock).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when user not a participant', async () => {
    sessionsService.acquireRunLock.mockResolvedValue(true);
    sessionsService.getSessionById.mockResolvedValue({
      session: mockSession,
      participants: [],
      participantsOnline: 0,
      state: {},
    });
    sessionsService.releaseRunLock.mockResolvedValue(undefined);

    await expect(service.runCode('notmember@test.com', dto)).rejects.toThrow(UnauthorizedException);
    expect(sessionsService.releaseRunLock).toHaveBeenCalled();
  });

  it('throws ForbiddenException when participant lacks execute permission', async () => {
    sessionsService.acquireRunLock.mockResolvedValue(true);
    sessionsService.getSessionById.mockResolvedValue({
      session: mockSession,
      participants: [{ ...ownerParticipant, userEmail: 'viewer@test.com', role: 'VIEW' as any }],
      participantsOnline: 1,
      state: {},
    });
    sessionsService.releaseRunLock.mockResolvedValue(undefined);

    await expect(service.runCode('viewer@test.com', dto)).rejects.toThrow(ForbiddenException);
    expect(sessionsService.releaseRunLock).toHaveBeenCalled();
  });

  it('releases lock even when piston throws', async () => {
    sessionsService.acquireRunLock.mockResolvedValue(true);
    sessionsService.getSessionById.mockResolvedValue({
      session: mockSession,
      participants: [ownerParticipant],
      participantsOnline: 1,
      state: {},
    });
    pistonService.execute.mockRejectedValue(new Error('Piston down'));
    sessionsService.releaseRunLock.mockResolvedValue(undefined);

    await expect(service.runCode('owner@test.com', dto)).rejects.toThrow('Piston down');
    expect(sessionsService.releaseRunLock).toHaveBeenCalled();
  });
});
