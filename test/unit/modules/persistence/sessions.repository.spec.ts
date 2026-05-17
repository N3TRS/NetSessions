import { SessionsRepository } from 'src/modules/persistence/repositories/sessions.repository';

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

const makePrisma = () => ({
  session: {
    create: jest.fn().mockResolvedValue(mockSession),
    findUnique: jest.fn().mockResolvedValue(mockSession),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([mockSession]),
    update: jest.fn().mockResolvedValue(mockSession),
  },
});

describe('SessionsRepository', () => {
  let repo: SessionsRepository;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new SessionsRepository(prisma as any);
  });

  it('create calls prisma.session.create', async () => {
    const input = { name: 'Test', inviteCode: 'ABCD1234', ownerEmail: 'owner@test.com', language: 'javascript' };
    const result = await repo.create(input);

    expect(prisma.session.create).toHaveBeenCalledWith({ data: input });
    expect(result).toEqual(mockSession);
  });

  it('findById calls findUnique with id', async () => {
    const result = await repo.findById('session-id');

    expect(prisma.session.findUnique).toHaveBeenCalledWith({ where: { id: 'session-id' } });
    expect(result).toEqual(mockSession);
  });

  it('findByInviteCode calls findUnique with inviteCode', async () => {
    const result = await repo.findByInviteCode('ABCD1234');

    expect(prisma.session.findUnique).toHaveBeenCalledWith({ where: { inviteCode: 'ABCD1234' } });
    expect(result).toEqual(mockSession);
  });

  it('listForUser returns active sessions for user', async () => {
    const result = await repo.listForUser('owner@test.com');

    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result).toEqual([mockSession]);
  });

  it('findActiveByOwnerAndName calls findFirst', async () => {
    prisma.session.findFirst.mockResolvedValue(mockSession);

    const result = await repo.findActiveByOwnerAndName('owner@test.com', 'Test');

    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: { ownerEmail: 'owner@test.com', name: 'Test', isActive: true },
    });
    expect(result).toEqual(mockSession);
  });

  it('findActiveByOwnerAndName returns null when not found', async () => {
    prisma.session.findFirst.mockResolvedValue(null);

    const result = await repo.findActiveByOwnerAndName('owner@test.com', 'Missing');

    expect(result).toBeNull();
  });

  it('updateName calls prisma.session.update', async () => {
    const updated = { ...mockSession, name: 'New Name' };
    prisma.session.update.mockResolvedValue(updated);

    const result = await repo.updateName('session-id', 'New Name');

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-id' },
      data: { name: 'New Name' },
    });
    expect(result).toEqual(updated);
  });

  it('softDelete sets isActive to false', async () => {
    const deleted = { ...mockSession, isActive: false };
    prisma.session.update.mockResolvedValue(deleted);

    const result = await repo.softDelete('session-id');

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-id' },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });
});
