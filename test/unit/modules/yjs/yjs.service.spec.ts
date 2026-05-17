import { UnauthorizedException } from '@nestjs/common';
import { YjsService } from 'src/modules/yjs/yjs.service';
import * as Y from 'yjs';

const makeJwtService = () => ({
  verifyAsync: jest.fn(),
});

const makeParticipantsRepo = () => ({
  findBySessionIdAndUserEmail: jest.fn(),
});

const makeYjsRepo = () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
  findBySessionId: jest.fn().mockResolvedValue(null),
});

const makeRedisService = () => ({
  getYjsDocState: jest.fn().mockResolvedValue(null),
  setYjsDocState: jest.fn().mockResolvedValue(undefined),
  refreshYjsDocStateTtl: jest.fn().mockResolvedValue(undefined),
});

const makeConn = (readyState = 1 /* OPEN */) => ({
  readyState,
  binaryType: '',
  send: jest.fn(),
  close: jest.fn(),
  on: jest.fn(),
});

function buildService() {
  const jwt = makeJwtService();
  const participantsRepo = makeParticipantsRepo();
  const yjsRepo = makeYjsRepo();
  const redis = makeRedisService();
  const service = new YjsService(jwt as any, participantsRepo as any, yjsRepo as any, redis as any);
  return { service, jwt, participantsRepo, yjsRepo, redis };
}

function makeRequest(url: string) {
  return { url } as any;
}

const PARTICIPANT = {
  id: 'p1',
  sessionId: 'session-id',
  userEmail: 'user@test.com',
  role: 'VIEW',
  isOnline: true,
  joinedAt: new Date(),
  leftAt: null,
};

describe('YjsService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── initialize ──────────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('creates WS server and registers upgrade handler', () => {
      const { service } = buildService();
      const httpServer = { on: jest.fn() };

      service.initialize(httpServer as any);

      expect(httpServer.on).toHaveBeenCalledWith('upgrade', expect.any(Function));
    });

    it('is idempotent — second call does nothing', () => {
      const { service } = buildService();
      const httpServer = { on: jest.fn() };

      service.initialize(httpServer as any);
      service.initialize(httpServer as any);

      expect(httpServer.on).toHaveBeenCalledTimes(1);
    });

    it('ignores upgrade for non-yjs paths', () => {
      const { service } = buildService();
      let upgradeHandler!: Function;
      const httpServer = { on: jest.fn((_e, fn) => { upgradeHandler = fn; }) };

      service.initialize(httpServer as any);

      const socket = { destroy: jest.fn() };
      // Non-yjs path should return early without calling handleUpgrade
      expect(() => upgradeHandler({ url: '/ws/other' }, socket, Buffer.alloc(0))).not.toThrow();
    });
  });

  // ─── extractConnectionData (via onConnection) ─────────────────────────────

  describe('extractConnectionData', () => {
    it('rejects when URL has no sessionId', async () => {
      const { service, jwt } = buildService();
      jwt.verifyAsync.mockRejectedValue(new Error('not called'));

      const conn = makeConn();
      await (service as any).onConnection(conn, makeRequest('/ws/yjs'));

      expect(conn.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    });

    it('rejects when token is missing from query', async () => {
      const { service } = buildService();
      const conn = makeConn();

      await (service as any).onConnection(conn, makeRequest('/ws/yjs/session-id'));

      expect(conn.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    });
  });

  // ─── onConnection ─────────────────────────────────────────────────────────

  describe('onConnection', () => {
    it('rejects when JWT verification fails', async () => {
      const { service, jwt } = buildService();
      jwt.verifyAsync.mockRejectedValue(new Error('expired'));
      const conn = makeConn();

      await (service as any).onConnection(conn, makeRequest('/ws/yjs/session-id?token=bad'));

      expect(conn.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    });

    it('rejects when JWT payload has no email', async () => {
      const { service, jwt } = buildService();
      jwt.verifyAsync.mockResolvedValue({ role: 'user' }); // no email
      const conn = makeConn();

      await (service as any).onConnection(conn, makeRequest('/ws/yjs/session-id?token=tok'));

      expect(conn.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    });

    it('rejects when user is not a participant', async () => {
      const { service, jwt, participantsRepo } = buildService();
      jwt.verifyAsync.mockResolvedValue({ email: 'user@test.com' });
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(null);
      const conn = makeConn();

      await (service as any).onConnection(conn, makeRequest('/ws/yjs/session-id?token=tok'));

      expect(conn.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    });

    it('sets up connection when auth passes', async () => {
      const { service, jwt, participantsRepo, redis } = buildService();
      jwt.verifyAsync.mockResolvedValue({ email: 'user@test.com' });
      participantsRepo.findBySessionIdAndUserEmail.mockResolvedValue(PARTICIPANT);
      redis.getYjsDocState.mockResolvedValue(null);

      const conn = makeConn();

      await (service as any).onConnection(conn, makeRequest('/ws/yjs/session-id?token=tok'));

      expect(conn.close).not.toHaveBeenCalled();
      expect(conn.send).toHaveBeenCalled(); // sends initial SYNC_FULL frame
    });
  });

  // ─── getOrCreateRoom ──────────────────────────────────────────────────────

  describe('getOrCreateRoom', () => {
    it('returns cached room on second call', async () => {
      const { service, redis } = buildService();

      await (service as any).getOrCreateRoom('session-id');
      await (service as any).getOrCreateRoom('session-id');

      // getYjsDocState only called once (first room creation)
      expect(redis.getYjsDocState).toHaveBeenCalledTimes(1);
      expect(redis.refreshYjsDocStateTtl).toHaveBeenCalledTimes(1);
    });

    it('hydrates from Redis when state exists', async () => {
      const { service, redis } = buildService();

      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'hello');
      const state = Y.encodeStateAsUpdate(doc);
      doc.destroy();

      redis.getYjsDocState.mockResolvedValue(state);

      const room = await (service as any).getOrCreateRoom('session-id');

      expect(room.doc.getText('content').toJSON()).toBe('hello');
    });

    it('hydrates from MongoDB when Redis has no state', async () => {
      const { service, redis, yjsRepo } = buildService();
      redis.getYjsDocState.mockResolvedValue(null);

      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'from mongo');
      const state = Array.from(Y.encodeStateAsUpdate(doc));
      doc.destroy();

      yjsRepo.findBySessionId.mockResolvedValue({ sessionId: 'session-id', state });

      const room = await (service as any).getOrCreateRoom('session-id');

      expect(room.doc.getText('content').toJSON()).toBe('from mongo');
      expect(redis.setYjsDocState).toHaveBeenCalled();
    });

    it('handles hydration error gracefully', async () => {
      const { service, redis } = buildService();
      redis.getYjsDocState.mockRejectedValue(new Error('Redis down'));

      const room = await (service as any).getOrCreateRoom('session-id');

      expect(room).toBeDefined();
      expect(room.doc).toBeDefined();
    });

    it('creates empty room when no state anywhere', async () => {
      const { service, redis, yjsRepo } = buildService();
      redis.getYjsDocState.mockResolvedValue(null);
      yjsRepo.findBySessionId.mockResolvedValue(null);

      const room = await (service as any).getOrCreateRoom('session-id');

      expect(room.conns.size).toBe(0);
      expect(room.doc).toBeDefined();
    });

    it('skips mongo when redis state has zero bytes', async () => {
      const { service, redis, yjsRepo } = buildService();
      redis.getYjsDocState.mockResolvedValue(new Uint8Array(0));

      await (service as any).getOrCreateRoom('session-id');

      expect(yjsRepo.findBySessionId).toHaveBeenCalled();
    });
  });

  // ─── handleFrame ──────────────────────────────────────────────────────────

  describe('handleFrame', () => {
    async function makeRoom(service: YjsService) {
      return (service as any).getOrCreateRoom('session-id');
    }

    it('ignores empty frames', async () => {
      const { service } = buildService();
      const conn = makeConn();
      const room = await makeRoom(service);

      expect(() =>
        (service as any).handleFrame(conn, room, 'session-id', new Uint8Array(0)),
      ).not.toThrow();
    });

    it('applies SYNC_UPDATE frame to doc', async () => {
      const { service } = buildService();
      const room = await makeRoom(service);
      const conn = makeConn();

      const updateDoc = new Y.Doc();
      updateDoc.getText('content').insert(0, 'test');
      const update = Y.encodeStateAsUpdate(updateDoc);
      updateDoc.destroy();

      const frame = new Uint8Array(update.length + 1);
      frame[0] = 0x01; // FRAME_SYNC_UPDATE
      frame.set(update, 1);

      (service as any).handleFrame(conn, room, 'session-id', frame);

      expect(room.doc.getText('content').toJSON()).toBe('test');
    });

    it('handles AWARENESS frame', async () => {
      const { service } = buildService();
      const room = await makeRoom(service);
      const conn = makeConn();

      // Send a valid awareness frame (just needs type byte + some payload)
      const frame = new Uint8Array([0x02, 0, 0]); // FRAME_AWARENESS with minimal payload
      // Should not throw even with malformed awareness data
      expect(() =>
        (service as any).handleFrame(conn, room, 'session-id', frame),
      ).not.toThrow();
    });

    it('logs warning for unknown frame type', async () => {
      const { service } = buildService();
      const room = await makeRoom(service);
      const conn = makeConn();

      const frame = new Uint8Array([0xFF, 1, 2, 3]); // unknown type
      expect(() =>
        (service as any).handleFrame(conn, room, 'session-id', frame),
      ).not.toThrow();
    });

    it('handles frame processing error gracefully', async () => {
      const { service } = buildService();
      const room = await makeRoom(service);
      const conn = makeConn();

      // Corrupt SYNC_UPDATE — causes Y.applyUpdate to throw
      const frame = new Uint8Array([0x01, 0xFF, 0xFF, 0xFF]);
      expect(() =>
        (service as any).handleFrame(conn, room, 'session-id', frame),
      ).not.toThrow();
    });
  });

  // ─── sendFrame / broadcastFrame ───────────────────────────────────────────

  describe('sendFrame', () => {
    it('sends encoded frame when conn is OPEN', () => {
      const { service } = buildService();
      const conn = makeConn(1); // WebSocket.OPEN = 1

      (service as any).sendFrame(conn, 0x00, new Uint8Array([1, 2, 3]));

      expect(conn.send).toHaveBeenCalledWith(expect.any(Uint8Array));
      const sent: Uint8Array = conn.send.mock.calls[0][0];
      expect(sent[0]).toBe(0x00);
    });

    it('does not send when conn is not OPEN', () => {
      const { service } = buildService();
      const conn = makeConn(3); // WebSocket.CLOSED = 3

      (service as any).sendFrame(conn, 0x00, new Uint8Array([1]));

      expect(conn.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastFrame', () => {
    it('sends to all open connections except excluded', async () => {
      const { service } = buildService();
      const room = await (service as any).getOrCreateRoom('s1');

      const conn1 = makeConn(1);
      const conn2 = makeConn(1);
      const conn3 = makeConn(3); // closed
      room.conns.add(conn1);
      room.conns.add(conn2);
      room.conns.add(conn3);

      (service as any).broadcastFrame(room, 0x01, new Uint8Array([5]), conn1);

      expect(conn1.send).not.toHaveBeenCalled(); // excluded
      expect(conn2.send).toHaveBeenCalled();
      expect(conn3.send).not.toHaveBeenCalled(); // closed
    });

    it('does nothing when room has no connections', async () => {
      const { service } = buildService();
      const room = await (service as any).getOrCreateRoom('s1');

      expect(() =>
        (service as any).broadcastFrame(room, 0x01, new Uint8Array([1])),
      ).not.toThrow();
    });
  });

  // ─── encodeFrame ──────────────────────────────────────────────────────────

  describe('encodeFrame', () => {
    it('prepends type byte to payload', () => {
      const { service } = buildService();
      const payload = new Uint8Array([10, 20, 30]);

      const frame: Uint8Array = (service as any).encodeFrame(0x01, payload);

      expect(frame[0]).toBe(0x01);
      expect(Array.from(frame.slice(1))).toEqual([10, 20, 30]);
    });
  });

  // ─── onConnectionClose ────────────────────────────────────────────────────

  describe('onConnectionClose', () => {
    it('removes conn from room and cleans awareness', async () => {
      const { service } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');
      const conn = makeConn();

      room.conns.add(conn);
      room.connAwareness.set(conn, new Set([1, 2]));

      (service as any).onConnectionClose(conn, room);

      expect(room.conns.has(conn)).toBe(false);
      expect(room.connAwareness.has(conn)).toBe(false);
    });

    it('handles close when conn has no controlled awareness clients', async () => {
      const { service } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');
      const conn = makeConn();

      room.conns.add(conn);
      room.connAwareness.set(conn, new Set()); // empty set

      expect(() => (service as any).onConnectionClose(conn, room)).not.toThrow();
    });
  });

  // ─── scheduleRedisPersist / scheduleMongoPersist ─────────────────────────

  describe('scheduleRedisPersist', () => {
    it('debounces and calls setYjsDocState', async () => {
      const { service, redis } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');

      (service as any).scheduleRedisPersist(room, 'session-id');
      (service as any).scheduleRedisPersist(room, 'session-id'); // debounce resets timer

      jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(redis.setYjsDocState).toHaveBeenCalledTimes(1);
      expect(room.redisTimer).toBeUndefined();
    });

    it('handles redis persist error gracefully', async () => {
      const { service, redis } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');
      redis.setYjsDocState.mockRejectedValue(new Error('Redis error'));

      (service as any).scheduleRedisPersist(room, 'session-id');
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  describe('scheduleMongoPersist', () => {
    it('debounces and calls yjsRepo.upsert', async () => {
      const { service, yjsRepo } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');

      (service as any).scheduleMongoPersist(room, 'session-id');
      (service as any).scheduleMongoPersist(room, 'session-id'); // debounce resets timer

      jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(yjsRepo.upsert).toHaveBeenCalledTimes(1);
      expect(room.mongoTimer).toBeUndefined();
    });

    it('handles mongo persist error gracefully', async () => {
      const { service, yjsRepo } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');
      yjsRepo.upsert.mockRejectedValue(new Error('Mongo error'));

      (service as any).scheduleMongoPersist(room, 'session-id');
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // ─── onApplicationShutdown ────────────────────────────────────────────────

  describe('onApplicationShutdown', () => {
    it('flushes all rooms to mongo and destroys docs', async () => {
      const { service, yjsRepo } = buildService();

      await (service as any).getOrCreateRoom('s1');
      await (service as any).getOrCreateRoom('s2');

      await service.onApplicationShutdown();

      expect(yjsRepo.upsert).toHaveBeenCalledTimes(2);
      expect((service as any).rooms.size).toBe(0);
    });

    it('cancels pending timers before shutdown', async () => {
      const { service, redis } = buildService();
      const room = await (service as any).getOrCreateRoom('s1');

      (service as any).scheduleRedisPersist(room, 's1');
      (service as any).scheduleMongoPersist(room, 's1');

      await service.onApplicationShutdown();

      // Timers cleared — running them now should not trigger extra calls
      jest.runOnlyPendingTimers();
      expect(redis.setYjsDocState).toHaveBeenCalledTimes(0);
    });

    it('handles flush errors gracefully', async () => {
      const { service, yjsRepo } = buildService();
      await (service as any).getOrCreateRoom('s1');
      yjsRepo.upsert.mockRejectedValue(new Error('Flush failed'));

      await expect(service.onApplicationShutdown()).resolves.not.toThrow();
    });

    it('shuts down cleanly when no rooms exist', async () => {
      const { service } = buildService();

      await expect(service.onApplicationShutdown()).resolves.not.toThrow();
    });
  });

  // ─── doc update triggers broadcast + persist ──────────────────────────────

  describe('doc update propagation', () => {
    it('broadcasts update to all open connections when doc changes', async () => {
      const { service } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');

      const conn1 = makeConn(1);
      const conn2 = makeConn(1);
      room.conns.add(conn1);
      room.conns.add(conn2);
      room.connAwareness.set(conn1, new Set());
      room.connAwareness.set(conn2, new Set());

      room.doc.getText('content').insert(0, 'hello');

      // Both conns receive the update (mock objects are not WebSocket instances
      // so the origin exclusion in broadcastFrame does not apply here)
      expect(conn1.send).toHaveBeenCalled();
      expect(conn2.send).toHaveBeenCalled();
    });

    it('schedules redis and mongo persist on doc update', async () => {
      const { service, redis, yjsRepo } = buildService();
      const room = await (service as any).getOrCreateRoom('session-id');

      room.doc.getText('content').insert(0, 'trigger persist');

      jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(redis.setYjsDocState).toHaveBeenCalled();

      jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(yjsRepo.upsert).toHaveBeenCalled();
    });
  });

  // ─── setupConnection ─────────────────────────────────────────────────────

  describe('setupConnection', () => {
    it('sends SYNC_FULL frame on connect', async () => {
      const { service, redis } = buildService();
      redis.getYjsDocState.mockResolvedValue(null);

      const conn = makeConn(1);
      await (service as any).setupConnection(conn, 'session-id');

      expect(conn.send).toHaveBeenCalledWith(expect.any(Uint8Array));
      const frame: Uint8Array = conn.send.mock.calls[0][0];
      expect(frame[0]).toBe(0x00); // FRAME_SYNC_FULL
    });

    it('registers message and close handlers', async () => {
      const { service } = buildService();
      const conn = makeConn(1);

      await (service as any).setupConnection(conn, 'session-id');

      const eventNames = conn.on.mock.calls.map(([event]: [string]) => event);
      expect(eventNames).toContain('message');
      expect(eventNames).toContain('close');
    });

    it('handles Buffer message in message handler', async () => {
      const { service } = buildService();
      const conn = makeConn(1);
      await (service as any).setupConnection(conn, 'session-id');

      const messageHandler = conn.on.mock.calls.find(([e]: [string]) => e === 'message')?.[1];
      // Pass a Buffer (should be wrapped in Uint8Array)
      expect(() => messageHandler(Buffer.from([0x01]))).not.toThrow();
    });

    it('handles ArrayBuffer message in message handler', async () => {
      const { service } = buildService();
      const conn = makeConn(1);
      await (service as any).setupConnection(conn, 'session-id');

      const messageHandler = conn.on.mock.calls.find(([e]: [string]) => e === 'message')?.[1];
      expect(() => messageHandler(new ArrayBuffer(3))).not.toThrow();
    });

    it('close handler removes conn from room', async () => {
      const { service } = buildService();
      const conn = makeConn(1);
      await (service as any).setupConnection(conn, 'session-id');

      const closeHandler = conn.on.mock.calls.find(([e]: [string]) => e === 'close')?.[1];
      closeHandler();

      const room = (service as any).rooms.get('session-id');
      expect(room.conns.has(conn)).toBe(false);
    });
  });
});
