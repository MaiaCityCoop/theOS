// The aven.id ID token the game hands over once, right after signing in (TheGame/src/account/callback.js), checked here
// on the server before anything of it is believed: signed ES256 by the issuer's key, by that issuer, for this client,
// still fresh, signed in with a passkey. It is the same check as the game's own (TheGame/src/account/oidc.js), less the
// nonce, which only the tab that signed in knows. Taking each token once (see server.js) stands in for it.
//
// aven.id's access tokens are opaque and live five minutes, with no refresh token, so the API does not keep using
// them: the checked ID token opens the API's own session (a cookie), and that is what every later request shows.

const enc = new TextEncoder(), dec = new TextDecoder();

export class TokenError extends Error {}
const no = (why) => new TokenError(why);

function unb64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw no('not base64url');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), (c) => c.charCodeAt(0));
}

/** The issuer's signing keys, read from its description and kept for a while; read again, at most every 30 seconds,
 * when a token names a key that is not among them (aven.id turned its key). */
export function keysOf(issuer, { fetch: get = fetch, keepFor = 600e3, retryAfter = 30e3, now = Date.now } = {}) {
  let held = null, at = 0, tried = 0;
  async function read() {
    const ask = async (url) => {
      const res = await get(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return res.json();
    };
    const meta = await ask(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration');
    if (meta.issuer !== issuer) throw new Error(`the issuer calls itself ${JSON.stringify(meta.issuer)}`);
    const jwks = await ask(meta.jwks_uri);
    held = (Array.isArray(jwks?.keys) ? jwks.keys : []).filter((k) => k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string'
      && (k.use === undefined || k.use === 'sig') && (k.alg === undefined || k.alg === 'ES256'));
    at = tried = now();
    return held;
  }
  return async function keyFor(kid) {
    if (!held || now() - at > keepFor) await read();
    const find = () => (kid !== undefined ? held.find((k) => k.kid === kid) : held.length === 1 ? held[0] : null);
    let key = find();
    if (!key && now() - tried > retryAfter) { tried = now(); await read(); key = find(); }
    if (!key) throw no(kid !== undefined ? `the issuer has no signing key "${kid}"` : 'the token names no key');
    return key;
  };
}

/** The token's claims once it holds, or a TokenError saying why not. `now` in seconds. */
export async function verifyIdToken(jwt, { keyFor, issuer, clientId, now = Date.now() / 1000, skew = 60, maxAge = 600 }) {
  if (typeof jwt !== 'string' || jwt.length > 8192) throw no('no token');
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw no('not a signed token');
  let header, claims;
  try { header = JSON.parse(dec.decode(unb64url(parts[0]))); claims = JSON.parse(dec.decode(unb64url(parts[1]))); } catch { throw no('its parts are not JSON'); }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object' || Array.isArray(claims)) throw no('its parts are not objects');
  if (header.alg !== 'ES256') throw no('it is not signed ES256');
  if (header.crit !== undefined) throw no('it asks for extensions');
  const signature = unb64url(parts[2]);
  if (signature.length !== 64) throw no('its signature is not 64 bytes');
  const jwk = await keyFor(header.kid);
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, enc.encode(parts[0] + '.' + parts[1]));
  } catch { throw no('its key could not be read'); }
  if (!ok) throw no('its signature does not hold');
  const c = claims, aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== issuer) throw no('another issuer');
  if (!aud.includes(clientId)) throw no('it is not for this game');
  if ((aud.length > 1 || c.azp !== undefined) && c.azp !== clientId) throw no('it was given to another client');
  if (typeof c.exp !== 'number' || now > c.exp + skew) throw no('it has expired');
  if (typeof c.iat !== 'number' || c.iat > now + skew) throw no('it is dated in the future');
  if (now - c.iat > maxAge + skew) throw no('it was issued too long ago');
  if (typeof c.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(c.sub)) throw no('it names no one');
  if (!Array.isArray(c.amr) || !c.amr.includes('passkey')) throw no('it was not signed in with a passkey');
  return c;
}
