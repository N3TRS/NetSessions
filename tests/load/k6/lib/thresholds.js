const isSmoke = (__ENV.SMOKE || '').toLowerCase() === '1' ||
                (__ENV.SMOKE || '').toLowerCase() === 'true';

export const realtimeThresholds = {
  'http_req_duration{group:rest}': isSmoke
    ? ['p(95)<2000', 'p(99)<3500']
    : ['p(95)<300', 'p(99)<500'],
  'http_req_failed': ['rate<0.01'],
  'ws_connecting': ['p(95)<500'],
  'ws_session_errors': ['count<5'],
  'yjs_update_rtt': ['p(95)<200', 'p(99)<400'],
  'yjs_updates_lost': ['count==0'],
  'yjs_updates_sent': isSmoke ? ['count>50'] : ['count>10000'],
};

export const executionThresholds = {
  'http_req_duration{endpoint:run}': ['p(95)<3500', 'p(99)<5000'],
  'execution_success_total': ['count>0'],
  'execution_lock_rejected_total': ['count>0'],
};
