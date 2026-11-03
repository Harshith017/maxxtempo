// Web Push with only the platform's WebCrypto (RFC 8291 aes128gcm + RFC 8292 VAPID), so the function
// has no third-party push library to download when Supabase bundles it.

const enc = new TextEncoder();
export const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0; for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

export type Vapid = { publicKey: string; privateJwk: JsonWebKey };

export async function makeVapid(): Promise<Vapid> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  return { publicKey: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}

export async function vapidHeader(endpoint: string, v: Vapid, subject: string) {
  const key = await crypto.subtle.importKey("jwk", v.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)); // raw r||s
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${v.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

export async function encrypt(payload: string, p256dh: string, auth: string) {
  const uaPub = unb64u(p256dh);
  const ua = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, eph.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdf(unb64u(auth), secret, cat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const cek = await hkdf(salt, prk, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, body);
}

// Returns the push service's HTTP status: 201 sent; 404/410 the phone unsubscribed.
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: unknown, v: Vapid, subject: string) {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, v, subject),
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "3600", Urgency: "high",
    },
    body: await encrypt(JSON.stringify(payload), sub.p256dh, sub.auth),
  });
  await res.body?.cancel();
  return res.status;
}
