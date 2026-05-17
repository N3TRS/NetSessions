import { SessionParticipantsRepository } from 'src/modules/persistence/repositories/session-participants.repository';

const mockParticipant = {
  id: 'p-id',
  sessionId: 'session-id',
  userEmail: 'user@test.com',
  isOnline: true,
  role: 'VIEW' as const,
  joinedAt: new Date(),
  leftAt: null,
};

const makePrisma = () => ({
  sessionParticipant: {
    create: jest.fn().mockResolvedValue(mockParticipant),
    update: jest.fn().mockResolvedValue(mockParticipant),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([mockParticipant]),
    count: jest.fn().mockResolvedValue(0),
  },
});

describe('SessionParticipantsRepository', () => {
  let repo: SessionParticipantsRepository;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new SessionParticipantsRepository(prisma as any);
  });

  describe('upsertOnlineParticipant', () => {
    it('creates new participant when not existing', async () => {
      prisma.sessionParticipant.findUnique.mockResolvedValue(null);

      const result = await repo.upsertOnlineParticipant('session-id', 'user@test.com', 'owner@test.com');

      expect(prisma.sessionParticipant.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-id',
          userEmail: 'user@test.com',
          isOnline: true,
          role: 'VIEW',
        },
      });
      expect(result).toEqual(mockParticipant);
    });

    it('assigns OWNER role when userEmail equals ownerEmail', async () => {
      prisma.sessionParticipant.findUnique.mockResolvedValue(null);
      prisma.sessionParticipant.create.mockResolvedValue({ ...mockParticipant, role: 'OWNER' });

      const result = await repo.upsertOnlineParticipant('session-id', 'owner@test.com', 'owner@test.com');

      expect(prisma.sessionParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'OWNER' }),
      });
    });

    it('updates existing participant to online', async () => {
      prisma.sessionParticipant.findUnique.mockResolvedValue(mockParticipant);

      const result = await repo.upsertOnlineParticipant('session-id', 'user@test.com');

      expect(prisma.sessionParticipant.update).toHaveBeenCalledWith({
        where: { id: mockParticipant.id },
        data: { isOnline: true, leftAt: null },
      });
    });
  });

  describe('updateRole', () => {
    it('calls update with new role', async () => {
      const updated = { ...mockParticipant, role: 'VIEW_EDIT' as any };
      prisma.sessionParticipant.update.mockResolvedValue(updated);

      const result = await repo.updateRole('session-id', 'user@test.com', 'VIEW_EDIT');

      expect(prisma.sessionParticipant.update).toHaveBeenCalledWith({
        where: { sessionId_userEmail: { sessionId: 'session-id', userEmail: 'user@test.com' } },
        data: { role: 'VIEW_EDIT' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('setOffline', () => {
    it('sets isOnline false and leftAt', async () => {
      const offline = { ...mockParticipant, isOnline: false, leftAt: new Date() };
      prisma.sessionParticipant.update.mockResolvedValue(offline);

      const result = await repo.setOffline('session-id', 'user@test.com');

      expect(prisma.sessionParticipant.update).toHaveBeenCalledWith({
        where: { sessionId_userEmail: { sessionId: 'session-id', userEmail: 'user@test.com' } },
        data: { isOnline: false, leftAt: expect.any(Date) },
      });
      expect(result.isOnline).toBe(false);
    });
  });

  describe('countOnlineBySessionId', () => {
    it('calls count with isOnline filter', async () => {
      prisma.sessionParticipant.count.mockResolvedValue(3);

      const result = await repo.countOnlineBySessionId('session-id');

      expect(prisma.sessionParticipant.count).toHaveBeenCalledWith({
        where: { sessionId: 'session-id', isOnline: true },
      });
      expect(result).toBe(3);
    });
  });

  describe('findBySessionIdAndUserEmail', () => {
    it('calls findUnique with composite key', async () => {
      prisma.sessionParticipant.findUnique.mockResolvedValue(mockParticipant);

      const result = await repo.findBySessionIdAndUserEmail('session-id', 'user@test.com');

      expect(prisma.sessionParticipant.findUnique).toHaveBeenCalledWith({
        where: { sessionId_userEmail: { sessionId: 'session-id', userEmail: 'user@test.com' } },
      });
      expect(result).toEqual(mockParticipant);
    });

    it('returns null when not found', async () => {
      prisma.sessionParticipant.findUnique.mockResolvedValue(null);

      const result = await repo.findBySessionIdAndUserEmail('session-id', 'missing@test.com');

      expect(result).toBeNull();
    });
  });

  describe('listBySessionId', () => {
    it('returns participants ordered by joinedAt', async () => {
      const result = await repo.listBySessionId('session-id');

      expect(prisma.sessionParticipant.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-id' },
        orderBy: { joinedAt: 'asc' },
      });
      expect(result).toEqual([mockParticipant]);
    });
  });
});
