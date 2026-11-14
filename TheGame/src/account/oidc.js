// Signing in with aven.id, the parts that are only reckoning: OpenID Connect's authorization code with PKCE (S256)
// for a public client in the browser, and the ID token checked here before anything of it is believed. Nothing in
// this file reads the page, the address or the storage: it runs as well under bun (tools/account-check.js) as in
// the browser. WebCrypto and fetch only.
//
// What a check here proves is who signed in, to this page. The game is browser-only: whatever it is told, a person
// can change in their own browser, so a role read here decides only what the game shows. Anything that must really
// hold (the citizens' MCP server, later) checks the person's token on its own server.

const enc = new TextEncoder(), dec = new TextDecoder();

/** Something that went wrong, said plainly: `unreachable` (aven.id did not answer), `refused` (it answered no),
 * `invalid` (what came back could not be checked, so it was not used). */
export class AccountError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
const invalid = (why) => new AccountError('invalid', `The sign-in could not be checked, so it was not used: ${why}.`);

// ---- bytes ----
export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw invalid('not base64url');
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
/** n random bytes as base64url: 32 of them (256 bits) for the state, the nonce and the PKCE verifier (43 characters). */
export const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

// ---- PKCE (RFC 7636): the verifier stays here, its S256 challenge goes to aven.id ----
export async function challengeOf(verifier) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error('a PKCE verifier is 43 to 128 unreserved characters');
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

// ---- the ID token ----
/** A compact JWS read, not believed: { header, claims, signed (the bytes the signature covers), signature }. */
export function parseJwt(jwt) {
  if (typeof jwt !== 'string') throw invalid('no ID token');
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw invalid('not a signed token');
  let header, claims;
  try { header = JSON.parse(dec.decode(unb64url(parts[0]))); claims = JSON.parse(dec.decode(unb64url(parts[1]))); } catch { throw invalid('its parts are not JSON'); }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object' || Array.isArray(claims)) throw invalid('its parts are not objects');
  return { header, claims, signed: enc.encode(parts[0] + '.' + parts[1]), signature: unb64url(parts[2]) };
}

/** The key the token names, among the issuer's (`jwks_uri`): an EC P-256 key for signing, by its `kid` (a token
 * without one only where the issuer has a single such key). */
export function keyFor(header, jwks) {
  const keys = (Array.isArray(jwks?.keys) ? jwks.keys : []).filter((k) => k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string'
    && (k.use === undefined || k.use === 'sig') && (k.alg === undefined || k.alg === 'ES256') && (!Array.isArray(k.key_ops) || k.key_ops.includes('verify')));
  const key = header.kid !== undefined ? keys.find((k) => k.kid === header.kid) : keys.length === 1 ? keys[0] : null;
  if (!key) throw invalid(header.kid !== undefined ? `aven.id has no signing key "${header.kid}"` : 'the token names no key');
  return key;
}

/** Checks an ID token and gives its claims, or throws: signed ES256 by the issuer's key (nothing else, not `none`),
 * for this client, this sign-in (the nonce), now, signed in with a passkey. `now` in seconds. */
export async function verifyIdToken(jwt, { jwks, issuer, clientId, nonce, now = Date.now() / 1000, skew = 60, maxAge = 600 }) {
  const { header, claims, signed, signature } = parseJwt(jwt);
  if (header.alg !== 'ES256') throw invalid(`signed with ${JSON.stringify(header.alg ?? 'nothing')}, not ES256`);
  if (header.crit !== undefined) throw invalid('it asks for extensions this page does not know');
  if (signature.length !== 64) throw invalid('its signature is not r and s side by side (64 bytes)');   // JWS's form, and WebCrypto's; a DER signature is refused here
  const jwk = keyFor(header, jwks);
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signed);
  } catch { throw invalid('its key could not be read'); }
  if (!ok) throw invalid('its signature does not hold');
  // what it says, now that it is known who said it
  const c = claims, aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== issuer) throw invalid(`issued by ${JSON.stringify(c.iss)}, not ${issuer}`);
  if (!aud.includes(clientId)) throw invalid('it is not for this game');
  if ((aud.length > 1 || c.azp !== undefined) && c.azp !== clientId) throw invalid('it was given to another client');
  if (typeof c.exp !== 'number' || now > c.exp + skew) throw invalid('it has expired');
  if (typeof c.iat !== 'number' || c.iat > now + skew) throw invalid('it is dated in the future');
  if (now - c.iat > maxAge + skew) throw invalid('it was issued too long ago');
  if (typeof nonce !== 'string' || !nonce || c.nonce !== nonce) throw invalid('it is not the answer to this sign-in (nonce)');
  if (typeof c.sub !== 'string' || !c.sub) throw invalid('it names no one');
  if (!Array.isArray(c.amr) || !c.amr.includes('passkey')) throw invalid('it was not signed in with a passkey');
  return c;
}

/** The person's roles: every account is a traveler; a paid subscription makes a citizen too. aven.id sends them as
 * `aven_roles` when the scope `roles` is asked for; where it does not (yet), a traveler. */
export function rolesOf(claims) {
  const said = Array.isArray(claims?.aven_roles) ? claims.aven_roles : [];
  return said.includes('citizen') ? ['traveler', 'citizen'] : ['traveler'];
}

/** Where to go back to after the sign-in: a path on this origin only (never another site, never `//host`), or
 * `fallback`; not the callback itself. */
export function returnPath(path, origin, { fallback = '/', callback } = {}) {
  if (typeof path !== 'string' || !/^\/(?![/\\])/.test(path) || /[\u0000-\u001f\\]/.test(path)) return fallback;
  let url;
  try { url = new URL(path, origin); } catch { return fallback; }
  if (url.origin !== new URL(origin).origin) return fallback;
  if (callback && url.pathname === new URL(callback, origin).pathname) return fallback;
  return url.pathname + url.search + url.hash;
}

// ---- talking to aven.id ----
const host = (issuer) => { try { return new URL(issuer).host; } catch { return issuer; } };
async function ask(url, init, issuer) {
  let res;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); } catch { throw new AccountError('unreachable', `Couldn't reach ${host(issuer)}.`); }
  let body = null;
  try { body = await res.json(); } catch {}
  return { res, body };
}

/** The issuer's own description (`/.well-known/openid-configuration`), checked: it must name itself exactly as asked,
 * and its endpoints must be on https (http only for an issuer on this machine). */
export async function discover(issuer) {
  const { res, body } = await ask(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration', { headers: { accept: 'application/json' } }, issuer);
  if (!res.ok || !body) throw new AccountError('unreachable', `${host(issuer)} did not describe its sign-in (${res.status}).`);
  if (body.issuer !== issuer) throw invalid(`${host(issuer)} calls itself ${JSON.stringify(body.issuer)}`);
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(new URL(issuer).origin);
  for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    let u; try { u = new URL(body[k]); } catch { throw invalid(`its ${k} is missing`); }
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw invalid(`its ${k} is not on https`);
  }
  if (Array.isArray(body.code_challenge_methods_supported) && !body.code_challenge_methods_supported.includes('S256')) throw invalid('it does not take PKCE S256');
  return body;
}

/** The code exchanged for tokens at the token endpoint (a form POST; a public client: no secret, the PKCE verifier
 * instead). Only the ID token is kept from the answer. */
export async function exchange(meta, { code, redirectUri, clientId, verifier, issuer }) {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier });
  const { res, body } = await ask(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form }, issuer);
  if (!res.ok) throw new AccountError('refused', `${host(issuer)} refused the sign-in${body?.error ? `: ${body.error_description || body.error}` : ` (${res.status})`}.`);
  if (typeof body?.id_token !== 'string') throw invalid('no ID token came back');
  return body.id_token;
}

/** The issuer's public keys (`jwks_uri`). */
export async function keys(meta, issuer) {
  const { res, body } = await ask(meta.jwks_uri, { headers: { accept: 'application/json' } }, issuer);
  if (!res.ok || !Array.isArray(body?.keys)) throw new AccountError('unreachable', `${host(issuer)} did not give its keys (${res.status}).`);
  return body;
}
