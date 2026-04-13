export function sessionMembersKey(sessionId: string): string {
  return `session:${sessionId}:members`;
}

export function sessionStateKey(sessionId: string): string {
  return `session:${sessionId}:state`;
}

export function sessionEventsChannel(sessionId: string): string {
  return `channel:session:${sessionId}:events`;
}

export function sessionExecutionLockKey(sessionId: string): string {
  return `session:${sessionId}:run:lock`;
}
