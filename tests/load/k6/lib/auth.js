import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

function base64UrlFromBase64(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeJson(obj) {
  const json = JSON.stringify(obj);
  const b64 = encoding.b64encode(json);
  return base64UrlFromBase64(b64);
}

export function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerSegment = base64UrlEncodeJson(header);
  const payloadSegment = base64UrlEncodeJson(payload);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const sigB64 = crypto.hmac('sha256', secret, signingInput, 'base64');
  return `${signingInput}.${base64UrlFromBase64(sigB64)}`;
}

export function makeUserToken(email, secret, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: email,
      email,
      iat: now,
      exp: now + ttlSeconds,
    },
    secret,
  );
}

export function emailForVu(vuIndex, prefix = 'vu') {
  return `${prefix}${vuIndex}@load.test`;
}
