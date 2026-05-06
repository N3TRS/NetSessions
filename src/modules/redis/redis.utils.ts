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

export function yjsDocStateKey(sessionId: string): string {
  return `yjs:doc:${sessionId}`;
}

export function sessionColorsKey(sessionId: string): string {
  return `session:${sessionId}:colors`;
}

export function whiteboardStateKey(sessionId: string): string {
  return `whiteboard:${sessionId}:elements`;
}
