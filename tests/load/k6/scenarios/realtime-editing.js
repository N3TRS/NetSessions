import { WebSocket } from 'k6/websockets';
import { setTimeout, setInterval, clearInterval } from 'k6/timers';
import { Trend, Counter } from 'k6/metrics';
import { check, fail } from 'k6';
import {
  makeUserToken,
  emailForVu,
} from '../lib/auth.js';
import {
  createSession,
  joinSession,
  deleteSession,
  getSession,
} from '../lib/session-setup.js';
import {
  buildFrame,
  parseFrame,
  FRAME_SYNC_UPDATE,
  loadUpdateBatches,
} from '../lib/yjs-frames.js';
import { realtimeThresholds } from '../lib/thresholds.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const WS_BASE_URL =
  __ENV.WS_BASE_URL || BASE_URL.replace(/^http/, 'ws');
const JWT_SECRET = __ENV.JWT_SECRET;
const OWNER_EMAIL = __ENV.OWNER_EMAIL || 'load-owner@load.test';
const SESSIONS_COUNT = Number(__ENV.SESSIONS_COUNT || 10);
const STEADY_DURATION_SEC = Number(__ENV.STEADY_DURATION_SEC || 180);
const VU_LIFETIME_SEC = Number(__ENV.VU_LIFETIME_SEC || 30);
const UPDATE_INTERVAL_MS = Number(__ENV.UPDATE_INTERVAL_MS || 100);
const REST_POLL_INTERVAL_MS = Number(__ENV.REST_POLL_INTERVAL_MS || 1000);

const yjsRtt = new Trend('yjs_update_rtt', true);
const yjsUpdatesSent = new Counter('yjs_updates_sent');
const yjsUpdatesReceived = new Counter('yjs_updates_received');
const yjsUpdatesLost = new Counter('yjs_updates_lost');
const wsSessionErrors = new Counter('ws_session_errors');

const FIXTURE_BUFFER = open('../fixtures/yjs-updates.bin', 'b');
const BATCHES = loadUpdateBatches(FIXTURE_BUFFER);

if (BATCHES.length === 0) {
  throw new Error(
    'No Yjs batches loaded. Run `node fixtures/generate-yjs-updates.mjs` first.',
  );
}

export const options = {
  scenarios: {
    realtime_editing: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 10 },
        { duration: '30s', target: 50 },
        { duration: `${STEADY_DURATION_SEC}s`, target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: realtimeThresholds,
};

export function setup() {
  if (!JWT_SECRET) {
    fail('JWT_SECRET env var is required');
  }
  if (BATCHES.length === 0) {
    fail('Fixture yjs-updates.bin is empty or missing');
  }

  const ownerToken = makeUserToken(OWNER_EMAIL, JWT_SECRET);
  const sessions = [];

  for (let i = 0; i < SESSIONS_COUNT; i += 1) {
    const name = `load-${Date.now()}-${i}`;
    try {
      const created = createSession(BASE_URL, ownerToken, name);
      sessions.push(created);
    } catch (err) {
      console.error(`createSession ${i} failed: ${err.message || err}`);
    }
  }

  console.log(
    `setup() created ${sessions.length}/${SESSIONS_COUNT} sessions`,
  );
  return { sessions, ownerToken };
}

export default async function (data) {
  if (!data.sessions || data.sessions.length === 0) {
    fail('No sessions available from setup');
  }

  const session = data.sessions[__VU % data.sessions.length];
  const email = emailForVu(__VU);
  const token = makeUserToken(email, JWT_SECRET);

  const joined = joinSession(BASE_URL, token, session.inviteCode);
  if (!joined) {
    wsSessionErrors.add(1);
    return;
  }

  check(joined, {
    'joined response has session': (r) => !!(r && r.session),
  });

  const yjsUrl = `${WS_BASE_URL}/ws/yjs/${session.sessionId}?token=${encodeURIComponent(token)}`;

  await new Promise((resolve) => {
    const sockA = new WebSocket(yjsUrl);
    const sockB = new WebSocket(yjsUrl);
    sockA.binaryType = 'arraybuffer';
    sockB.binaryType = 'arraybuffer';

    const ITERS_RESERVED_PER_VU = 10;
    const batchIndex =
      ((__VU - 1) * ITERS_RESERVED_PER_VU + __ITER) % BATCHES.length;
    const batch = BATCHES[batchIndex];
    let updateIndex = 0;
    let lastSentAt = 0;
    let sockAReady = false;
    let sockBReady = false;
    let sendingStarted = false;
    let sendInterval = null;
    let restInterval = null;
    let lifetimeTimer = null;
    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      if (sendInterval) clearInterval(sendInterval);
      if (restInterval) clearInterval(restInterval);
      try { sockA.close(); } catch (_) {}
      try { sockB.close(); } catch (_) {}
      resolve();
    }

    function startSending() {
      sendInterval = setInterval(() => {
        if (sockA.readyState !== 1) return;
        if (updateIndex >= batch.length) return;
        const update = batch[updateIndex];
        updateIndex += 1;
        const frame = buildFrame(FRAME_SYNC_UPDATE, update);
        lastSentAt = Date.now();
        try {
          sockA.send(frame.buffer);
          yjsUpdatesSent.add(1);
        } catch (_) {
          wsSessionErrors.add(1);
        }
      }, UPDATE_INTERVAL_MS);

      restInterval = setInterval(() => {
        getSession(BASE_URL, token, session.sessionId);
      }, REST_POLL_INTERVAL_MS);

      lifetimeTimer = setTimeout(cleanup, VU_LIFETIME_SEC * 1000);
    }

    function maybeStart() {
      if (sendingStarted) return;
      if (sockAReady && sockBReady) {
        sendingStarted = true;
        startSending();
      }
    }

    sockA.onopen = () => {};
    sockB.onopen = () => {};

    sockA.onerror = () => {
      wsSessionErrors.add(1);
      cleanup();
    };
    sockB.onerror = () => {
      wsSessionErrors.add(1);
      cleanup();
    };

    sockA.onclose = cleanup;
    sockB.onclose = cleanup;

    sockA.onmessage = () => {
      if (!sockAReady) {
        sockAReady = true;
        maybeStart();
      }
    };

    sockB.onmessage = (evt) => {
      if (!sockBReady) {
        sockBReady = true;
        maybeStart();
        return;
      }
      const frame = parseFrame(evt.data);
      if (frame.type === FRAME_SYNC_UPDATE && lastSentAt > 0) {
        const rtt = Date.now() - lastSentAt;
        yjsRtt.add(rtt);
        yjsUpdatesReceived.add(1);
      }
    };

    setTimeout(() => {
      if (!sendingStarted) {
        wsSessionErrors.add(1);
        cleanup();
      }
    }, 10_000);
  });
}

export function teardown(data) {
  if (!data || !data.ownerToken) return;
  for (const s of data.sessions || []) {
    try {
      deleteSession(BASE_URL, data.ownerToken, s.sessionId);
    } catch (_) {
      /* ignore */
    }
  }
}

export function handleSummary(data) {
  const tag = __ENV.REPORT_TAG || `run-${Date.now()}`;
  return {
    [`results/report-${tag}.html`]: htmlReport(data),
    [`results/summary-${tag}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
