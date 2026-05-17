import {
  sessionColorsKey,
  sessionEventsChannel,
  sessionExecutionLockKey,
  sessionMembersKey,
  sessionStateKey,
  yjsDocStateKey,
} from 'src/modules/redis/redis.utils';

describe('redis.utils', () => {
  const sessionId = 'abc123';

  it('sessionMembersKey', () => {
    expect(sessionMembersKey(sessionId)).toBe(`session:${sessionId}:members`);
  });

  it('sessionStateKey', () => {
    expect(sessionStateKey(sessionId)).toBe(`session:${sessionId}:state`);
  });

  it('sessionEventsChannel', () => {
    expect(sessionEventsChannel(sessionId)).toBe(`channel:session:${sessionId}:events`);
  });

  it('sessionExecutionLockKey', () => {
    expect(sessionExecutionLockKey(sessionId)).toBe(`session:${sessionId}:run:lock`);
  });

  it('yjsDocStateKey', () => {
    expect(yjsDocStateKey(sessionId)).toBe(`yjs:doc:${sessionId}`);
  });

  it('sessionColorsKey', () => {
    expect(sessionColorsKey(sessionId)).toBe(`session:${sessionId}:colors`);
  });
});
