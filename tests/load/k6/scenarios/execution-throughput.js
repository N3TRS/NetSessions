import { Counter, Trend } from 'k6/metrics';
import { check, fail, sleep } from 'k6';
import {
  makeUserToken,
  emailForVu,
} from '../lib/auth.js';
import {
  createSession,
  joinSession,
  deleteSession,
  runExecution,
} from '../lib/session-setup.js';
import { executionThresholds } from '../lib/thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const JWT_SECRET = __ENV.JWT_SECRET;
const OWNER_EMAIL = __ENV.OWNER_EMAIL || 'exec-owner@load.test';
const VUS = Number(__ENV.VUS || 20);
const DURATION_SEC = Number(__ENV.DURATION_SEC || 120);
const SLEEP_BETWEEN_RUNS_SEC = Number(__ENV.SLEEP_BETWEEN_RUNS_SEC || 1);

const executionSuccess = new Counter('execution_success_total');
const executionLockRejected = new Counter('execution_lock_rejected_total');
const executionOtherErrors = new Counter('execution_other_errors_total');
const executionLatency = new Trend('execution_latency_ms', true);

export const options = {
  scenarios: {
    execution_lock_pressure: {
      executor: 'constant-vus',
      vus: VUS,
      duration: `${DURATION_SEC}s`,
    },
  },
  thresholds: executionThresholds,
};

const SAMPLE_CODE = `console.log("hello from k6 vu " + ${__VU || 0});`;

export function setup() {
  if (!JWT_SECRET) fail('JWT_SECRET env var is required');

  const ownerToken = makeUserToken(OWNER_EMAIL, JWT_SECRET);
  const session = createSession(BASE_URL, ownerToken, `exec-load-${Date.now()}`);

  // Pre-add all VU emails as participants so they can run code.
  const participants = [];
  for (let i = 0; i < VUS; i += 1) {
    const email = emailForVu(i + 1, 'execvu');
    const token = makeUserToken(email, JWT_SECRET);
    const joined = joinSession(BASE_URL, token, session.inviteCode);
    if (joined) participants.push(email);
  }

  console.log(`setup(): session ${session.sessionId} with ${participants.length} participants`);
  return { session, ownerToken };
}

export default function (data) {
  const email = emailForVu(__VU, 'execvu');
  const token = makeUserToken(email, JWT_SECRET);

  const start = Date.now();
  const res = runExecution(
    BASE_URL,
    token,
    data.session.sessionId,
    SAMPLE_CODE,
    'javascript',
  );
  const elapsed = Date.now() - start;
  executionLatency.add(elapsed, { endpoint: 'run' });

  // Tag the request for thresholds visibility
  if (res.status === 200 || res.status === 201) {
    executionSuccess.add(1);
    check(res, { 'execution body has output': (r) => !!r.json('output') });
  } else if (res.status === 409 || res.status === 423 || res.status === 429) {
    // Lock contention or rate limit — expected under saturation.
    executionLockRejected.add(1);
  } else {
    executionOtherErrors.add(1);
    console.warn(`unexpected status=${res.status} body=${res.body}`);
  }

  sleep(SLEEP_BETWEEN_RUNS_SEC);
}

export function teardown(data) {
  if (!data || !data.ownerToken || !data.session) return;
  try {
    deleteSession(BASE_URL, data.ownerToken, data.session.sessionId);
  } catch (_) {
    /* ignore */
  }
}
