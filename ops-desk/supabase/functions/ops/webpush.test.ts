// node --experimental-strip-types --test supabase/functions/ops/webpush.test.ts
import test from 'node:test';
import assert from 'node:assert';
import nodeCrypto from 'node:crypto';
import { encrypt, makeVapid, vapidHeader } from './webpush.ts';

test('payload decrypts for the subscriber (RFC 8291) and the VAPID token verifies', async () => {
  const ua = nodeCrypto.createECDH('prime256v1'); const uaPub = ua.generateKeys(); const auth = nodeCrypto.randomBytes(16);
  const body = Buffer.from(await encrypt('{"hello":"world"}', uaPub.toString('base64url'), auth.toString('base64url')));
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  assert.equal(body.readUInt32BE(16), 4096);
  const secret = ua.computeSecret(asPub);
  const hk = (ikm, s, info, n) => Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, s, info, n));
  const prk = hk(secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const d = nodeCrypto.createDecipheriv('aes-128-gcm', hk(prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  d.setAuthTag(ct.subarray(-16));
  const plain = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), '{"hello":"world"}');
  assert.equal(plain.at(-1), 2);

  const v = await makeVapid();
  const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', v, 'mailto:a@b.c');
  const [t, k] = h.replace('vapid t=', '').split(', k=');
  assert.equal(k, v.publicKey);
  const [head, claims, sig] = t.split('.');
  assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).aud, 'https://fcm.googleapis.com');
  const pub = Buffer.from(v.publicKey, 'base64url');
  const key = nodeCrypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(nodeCrypto.verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});
