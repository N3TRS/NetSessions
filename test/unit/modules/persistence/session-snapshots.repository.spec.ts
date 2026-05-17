import { SessionSnapshotsRepository } from 'src/modules/persistence/repositories/session-snapshots.repository';

const mockSnapshot = {
  id: 'snap-id',
  sessionId: 'session-id',
  savedByEmail: 'user@test.com',
  language: 'javascript',
  code: 'console.log()',
  createdAt: new Date(),
};

const makePrisma = () => ({
  sessionSnapshot: {
    create: jest.fn().mockResolvedValue(mockSnapshot),
    findMany: jest.fn().mockResolvedValue([mockSnapshot]),
  },
});

describe('SessionSnapshotsRepository', () => {
  let repo: SessionSnapshotsRepository;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new SessionSnapshotsRepository(prisma as any);
  });

  it('create calls prisma.sessionSnapshot.create', async () => {
    const input = { sessionId: 'session-id', savedByEmail: 'user@test.com', language: 'javascript', code: 'code' };
    const result = await repo.create(input);

    expect(prisma.sessionSnapshot.create).toHaveBeenCalledWith({ data: input });
    expect(result).toEqual(mockSnapshot);
  });

  it('listBySessionId returns snapshots ordered by createdAt desc', async () => {
    const result = await repo.listBySessionId('session-id');

    expect(prisma.sessionSnapshot.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-id' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([mockSnapshot]);
  });
});
