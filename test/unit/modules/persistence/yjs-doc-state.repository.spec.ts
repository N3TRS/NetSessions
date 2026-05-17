import { YjsDocStateRepository } from 'src/modules/persistence/repositories/yjs-doc-state.repository';

const mockYjsState = {
  sessionId: 'session-id',
  state: [1, 2, 3],
};

const makePrisma = () => ({
  sessionYjsState: {
    upsert: jest.fn().mockResolvedValue(mockYjsState),
    findUnique: jest.fn().mockResolvedValue(mockYjsState),
  },
});

describe('YjsDocStateRepository', () => {
  let repo: YjsDocStateRepository;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new YjsDocStateRepository(prisma as any);
  });

  describe('upsert', () => {
    it('calls prisma.sessionYjsState.upsert with correct data', async () => {
      const state = new Uint8Array([1, 2, 3]);

      await repo.upsert('session-id', state);

      expect(prisma.sessionYjsState.upsert).toHaveBeenCalledWith({
        where: { sessionId: 'session-id' },
        update: { state: expect.any(Uint8Array) },
        create: { sessionId: 'session-id', state: expect.any(Uint8Array) },
      });
    });

    it('stores a copy of state (not original reference)', async () => {
      const state = new Uint8Array([4, 5, 6]);

      await repo.upsert('session-id', state);

      const call = prisma.sessionYjsState.upsert.mock.calls[0][0];
      const storedState = call.update.state;
      // Modify original to ensure it's a copy
      state[0] = 99;
      expect(storedState[0]).toBe(4);
    });
  });

  describe('findBySessionId', () => {
    it('calls findUnique with sessionId', async () => {
      const result = await repo.findBySessionId('session-id');

      expect(prisma.sessionYjsState.findUnique).toHaveBeenCalledWith({
        where: { sessionId: 'session-id' },
      });
      expect(result).toEqual(mockYjsState);
    });

    it('returns null when not found', async () => {
      prisma.sessionYjsState.findUnique.mockResolvedValue(null);

      const result = await repo.findBySessionId('missing-id');

      expect(result).toBeNull();
    });
  });
});
