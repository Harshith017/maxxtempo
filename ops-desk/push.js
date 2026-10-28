'use strict';
// Web Push (RFC 8030 + VAPID RFC 8292 + aes128gcm RFC 8291) with only node:crypto,
// so reminders reach phones/PCs even when the app isn't open.
const crypto = require('node:crypto');

const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');

function vapidKeys(db) {
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
  let pub = get('vapid_public'), priv = get('vapid_private');
  if (!pub || !priv) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const j = publicKey.export({ format: 'jwk' });
    pub = b64u(Buffer.concat([Buffer.from([4]), unb64u(j.x), unb64u(j.y)]));
    priv = privateKey.export({ format: 'pem', type: 'pkcs8' });
    const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    set.run('vapid_public', pub); set.run('vapid_private', priv);
  }
  return { pub, priv };
}

function vapidHeader(endpoint, keys, subject) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: keys.priv, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.pub}`;
}

function encrypt(payload, p256dh, auth) {
  const uaPub = unb64u(p256dh);
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const secret = ecdh.computeSecret(uaPub);
  const salt = crypto.randomBytes(16);
  const prk = Buffer.from(crypto.hkdfSync('sha256', secret, unb64u(auth), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}

async function sendPush(sub, payload, keys, subject, fetchImpl = fetch) {
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: '3600', Urgency: 'high',
    },
    body: encrypt(JSON.stringify(payload), sub.p256dh, sub.auth),
  });
  return res.status; // 404/410 mean the subscription is gone
}

module.exports = { vapidKeys, encrypt, sendPush, vapidHeader };
