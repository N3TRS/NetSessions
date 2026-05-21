import http from 'k6/http';
import { check, fail } from 'k6';

const DEFAULT_HEADERS = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  tags: { group: 'rest' },
});

export function createSession(baseUrl, token, name, language = 'javascript') {
  const res = http.post(
    `${baseUrl}/v1/sessions`,
    JSON.stringify({ name, language }),
    DEFAULT_HEADERS(token),
  );

  const ok = check(res, {
    'createSession 201': (r) => r.status === 201 || r.status === 200,
  });

  if (!ok) {
    fail(`createSession failed status=${res.status} body=${res.body}`);
  }

  const body = res.json();
  return {
    sessionId: body.session.id,
    inviteCode: body.session.inviteCode,
    ownerEmail: body.session.ownerEmail,
  };
}

export function joinSession(baseUrl, token, inviteCode) {
  const res = http.post(
    `${baseUrl}/v1/sessions/join`,
    JSON.stringify({ inviteCode }),
    DEFAULT_HEADERS(token),
  );

  const ok = check(res, {
    'joinSession 200/201': (r) => r.status === 200 || r.status === 201,
  });

  if (!ok) {
    return null;
  }

  return res.json();
}

export function deleteSession(baseUrl, token, sessionId) {
  return http.del(`${baseUrl}/v1/sessions/${sessionId}`, null, DEFAULT_HEADERS(token));
}

export function getSession(baseUrl, token, sessionId) {
  return http.get(`${baseUrl}/v1/sessions/${sessionId}`, DEFAULT_HEADERS(token));
}

export function getSessionCode(baseUrl, token, sessionId) {
  return http.get(`${baseUrl}/v1/sessions/${sessionId}/code`, DEFAULT_HEADERS(token));
}

export function runExecution(baseUrl, token, sessionId, code, language = 'javascript') {
  return http.post(
    `${baseUrl}/v1/executions/run`,
    JSON.stringify({ sessionId, code, language }),
    DEFAULT_HEADERS(token),
  );
}
