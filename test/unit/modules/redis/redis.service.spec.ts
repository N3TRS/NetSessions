import { RedisService } from 'src/modules/redis/redis.service';

const makeRedis = () => ({
  sadd: jest.fn().mockResolvedValue(1),
  srem: jest.fn().mockResolvedValue(1),
  scard: jest.fn().mockResolvedValue(0),
  smembers: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(1),
  hset: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
  hget: jest.fn().mockResolvedValue(null),
  hvals: jest.fn().mockResolvedValue([]),
  hsetnx: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  publish: jest.fn().mockResolvedValue(1),
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(0),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
});

describe('RedisService', () => {
  let service: RedisService;
  let publisher: ReturnType<typeof makeRedis>;
  let subscriber: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    publisher = makeRedis();
    subscriber = makeRedis();
    service = new RedisService(publisher as any, subscriber as any);
  });

  describe('addSessionMember', () => {
    it('adds member to set and sets TTL', async () => {
      await service.addSessionMember('s1', 'user@test.com');

      expect(publisher.sadd).toHaveBeenCalledWith('session:s1:members', 'user@test.com');
      expect(publisher.expire).toHaveBeenCalled();
    });
  });

  describe('removeSessionMember', () => {
    it('removes member and refreshes TTL', async () => {
      await service.removeSessionMember('s1', 'user@test.com');

      expect(publisher.srem).toHaveBeenCalledWith('session:s1:members', 'user@test.com');
      expect(publisher.expire).toHaveBeenCalled();
    });
  });

  describe('getSessionMembers', () => {
    it('returns smembers result', async () => {
      publisher.smembers.mockResolvedValue(['a@test.com', 'b@test.com']);

      const result = await service.getSessionMembers('s1');

      expect(result).toEqual(['a@test.com', 'b@test.com']);
    });
  });

  describe('getSessionMembersCount', () => {
    it('returns scard result', async () => {
      publisher.scard.mockResolvedValue(3);

      const result = await service.getSessionMembersCount('s1');

      expect(result).toBe(3);
    });
  });

  describe('setSessionState', () => {
    it('stores hash and sets TTL', async () => {
      await service.setSessionState('s1', { language: 'javascript' });

      expect(publisher.hset).toHaveBeenCalledWith('session:s1:state', { language: 'javascript' });
      expect(publisher.expire).toHaveBeenCalled();
    });
  });

  describe('getSessionState', () => {
    it('returns hgetall result', async () => {
      publisher.hgetall.mockResolvedValue({ language: 'python' });

      const result = await service.getSessionState('s1');

      expect(result).toEqual({ language: 'python' });
    });
  });

  describe('refreshSessionStateTtl', () => {
    it('calls expire on state key', async () => {
      await service.refreshSessionStateTtl('s1');

      expect(publisher.expire).toHaveBeenCalledWith('session:s1:state', expect.any(Number));
    });
  });

  describe('acquireExecutionLock', () => {
    it('returns true when SET NX succeeds', async () => {
      publisher.set.mockResolvedValue('OK');

      const result = await service.acquireExecutionLock('s1', 'owner:123');

      expect(result).toBe(true);
      expect(publisher.set).toHaveBeenCalledWith(
        'session:s1:run:lock', 'owner:123', 'PX', expect.any(Number), 'NX',
      );
    });

    it('returns false when lock already held', async () => {
      publisher.set.mockResolvedValue(null);

      const result = await service.acquireExecutionLock('s1', 'owner:123');

      expect(result).toBe(false);
    });
  });

  describe('releaseExecutionLock', () => {
    it('deletes key when owner matches', async () => {
      publisher.get.mockResolvedValue('owner:123');

      await service.releaseExecutionLock('s1', 'owner:123');

      expect(publisher.del).toHaveBeenCalledWith('session:s1:run:lock');
    });

    it('does not delete when owner mismatch', async () => {
      publisher.get.mockResolvedValue('other:456');

      await service.releaseExecutionLock('s1', 'owner:123');

      expect(publisher.del).not.toHaveBeenCalled();
    });
  });

  describe('setYjsDocState', () => {
    it('stores base64 encoded state', async () => {
      const state = new Uint8Array([1, 2, 3]);

      await service.setYjsDocState('s1', state);

      expect(publisher.set).toHaveBeenCalledWith(
        'yjs:doc:s1',
        Buffer.from(state).toString('base64'),
        'EX',
        expect.any(Number),
      );
    });
  });

  describe('getYjsDocState', () => {
    it('returns null when key does not exist', async () => {
      publisher.get.mockResolvedValue(null);

      const result = await service.getYjsDocState('s1');

      expect(result).toBeNull();
    });

    it('returns decoded Uint8Array', async () => {
      const original = new Uint8Array([10, 20, 30]);
      publisher.get.mockResolvedValue(Buffer.from(original).toString('base64'));

      const result = await service.getYjsDocState('s1');

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result!)).toEqual([10, 20, 30]);
    });
  });

  describe('publishSessionEvent', () => {
    it('publishes to correct channel', async () => {
      await service.publishSessionEvent('s1', { type: 'test' });

      expect(publisher.publish).toHaveBeenCalledWith(
        'channel:session:s1:events',
        JSON.stringify({ type: 'test' }),
      );
    });
  });

  describe('subscribeToSessionEvents', () => {
    it('subscribes to channel and registers handler', async () => {
      const handler = jest.fn();

      await service.subscribeToSessionEvents('s1', handler);

      expect(subscriber.subscribe).toHaveBeenCalledWith('channel:session:s1:events');
    });
  });

  describe('unsubscribeFromSessionEvents', () => {
    it('unsubscribes from channel', async () => {
      subscriber.unsubscribe.mockResolvedValue(0);

      await service.unsubscribeFromSessionEvents('s1');

      expect(subscriber.unsubscribe).toHaveBeenCalledWith('channel:session:s1:events');
    });
  });

  describe('assignSessionColor', () => {
    it('returns existing color if already assigned', async () => {
      publisher.hget.mockResolvedValue('#7C3AED');

      const color = await service.assignSessionColor('s1', 'user@test.com', ['#7C3AED', '#F97316']);

      expect(color).toBe('#7C3AED');
    });

    it('assigns first free color when none assigned', async () => {
      publisher.hget.mockResolvedValue(null);
      publisher.hvals.mockResolvedValue([]);
      publisher.hsetnx.mockResolvedValue(1);
      publisher.hget.mockResolvedValueOnce(null).mockResolvedValue('#7C3AED');

      const color = await service.assignSessionColor('s1', 'user@test.com', ['#7C3AED', '#F97316']);

      expect(publisher.hsetnx).toHaveBeenCalled();
    });

    it('falls back to hash-based color when all taken', async () => {
      publisher.hget.mockResolvedValue(null);
      publisher.hvals.mockResolvedValue(['#7C3AED', '#F97316']);
      publisher.hsetnx.mockResolvedValue(0);
      publisher.hget.mockResolvedValue(null);

      const color = await service.assignSessionColor('s1', 'user@test.com', ['#7C3AED', '#F97316']);

      expect(typeof color).toBe('string');
    });
  });

  describe('getSessionColors', () => {
    it('returns hgetall from colors key', async () => {
      publisher.hgetall.mockResolvedValue({ 'user@test.com': '#7C3AED' });

      const result = await service.getSessionColors('s1');

      expect(result).toEqual({ 'user@test.com': '#7C3AED' });
    });
  });

  describe('refreshSessionPresence', () => {
    it('calls expire on members key', async () => {
      await service.refreshSessionPresence('s1');

      expect(publisher.expire).toHaveBeenCalledWith('session:s1:members', expect.any(Number));
    });
  });

  describe('refreshYjsDocStateTtl', () => {
    it('calls expire on yjs doc state key', async () => {
      await service.refreshYjsDocStateTtl('s1');

      expect(publisher.expire).toHaveBeenCalledWith('yjs:doc:s1', expect.any(Number));
    });
  });

  describe('refreshSessionColorsTtl', () => {
    it('calls expire on colors key', async () => {
      await service.refreshSessionColorsTtl('s1');

      expect(publisher.expire).toHaveBeenCalledWith('session:s1:colors', expect.any(Number));
    });
  });

  describe('assignSessionColor — concurrent race scenario', () => {
    it('returns concurrent assignment when hsetnx returns 0 but hget has value', async () => {
      // First hget (check existing) returns null
      publisher.hget
        .mockResolvedValueOnce(null)   // initial check
        .mockResolvedValueOnce('#F97316'); // concurrent check after failed hsetnx

      publisher.hvals.mockResolvedValue([]);
      publisher.hsetnx.mockResolvedValue(0); // someone else won the race

      const color = await service.assignSessionColor('s1', 'user@test.com', ['#7C3AED', '#F97316']);

      expect(color).toBe('#F97316');
    });
  });

  describe('onModuleDestroy', () => {
    it('calls quit on both redis clients', async () => {
      await service.onModuleDestroy();

      expect(subscriber.quit).toHaveBeenCalled();
      expect(publisher.quit).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    it('calls registered handler when message arrives', async () => {
      const handler = jest.fn();
      await service.subscribeToSessionEvents('s1', handler);

      // Simulate the subscriber 'message' event
      const messageCallback = subscriber.on.mock.calls.find(([event]: [string]) => event === 'message')?.[1];
      messageCallback('channel:session:s1:events', JSON.stringify({ type: 'test' }));

      expect(handler).toHaveBeenCalledWith({ type: 'test' });
    });

    it('does not throw for unknown channel', async () => {
      const messageCallback = subscriber.on.mock.calls.find(([event]: [string]) => event === 'message')?.[1];

      expect(() => messageCallback('unknown:channel', '{}')).not.toThrow();
    });

    it('logs warning on invalid JSON payload', async () => {
      const handler = jest.fn();
      await service.subscribeToSessionEvents('s1', handler);

      const messageCallback = subscriber.on.mock.calls.find(([event]: [string]) => event === 'message')?.[1];
      expect(() => messageCallback('channel:session:s1:events', 'invalid json')).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
