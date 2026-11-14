// The sign-in's reckoning checked, without a browser and without aven.id: `bun tools/account-check.js` in TheGame.
// PKCE against RFC 7636's own example, reading a token, ES256 signatures with a key made here (and every way a token
// must be refused), the roles, and the way back after the sign-in. Exits 1 if anything is wrong.
import { b64url, unb64url, random, challengeOf, parseJwt, verifyIdToken, rolesOf, returnPath, AccountError } from '../src/account/oidc.js';

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log('  FAILED', what); } };
async function refuses(what, p, why) {
  try { await p; failed++; console.log('  FAILED (taken)', what); }
  catch (e) { const good = e instanceof AccountError && e.kind === 'invalid' && (!why || why.test(e.message)); if (good) passed++; else { failed++; console.log('  FAILED (refused, but)', what, '->', e.message); } }
}
const enc = new TextEncoder(), json = (o) => b64url(enc.encode(JSON.stringify(o)));

// ---- PKCE: RFC 7636, appendix B ----
ok(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'PKCE S256: the RFC 7636 example');
const v = random();
ok(v.length === 43 && /^[A-Za-z0-9_-]+$/.test(v), 'a verifier of 32 random bytes is 43 characters');
ok(random() !== random(), 'random values differ');
await challengeOf('short').then(() => ok(false, 'a short verifier is refused'), () => ok(true, ''));
ok([...unb64url(b64url(new Uint8Array([0, 255, 254, 1, 2])))].join() === '0,255,254,1,2', 'base64url there and back');

// ---- a key of aven.id's, made here; and another ----
const ES = { name: 'ECDSA', namedCurve: 'P-256' };
const pair = await crypto.subtle.generateKey(ES, true, ['sign', 'verify']), other = await crypto.subtle.generateKey(ES, true, ['sign', 'verify']);
const pub = async (k, kid) => { const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', k.publicKey); return { kty, crv, x, y, kid, use: 'sig', alg: 'ES256' }; };
const jwks = { keys: [{ kty: 'RSA', kid: 'r1', n: 'AQAB', e: 'AQAB' }, await pub(pair, 'k1')] };
const ISS = 'https://aven.id', CLIENT = 'maia-city', NONCE = 'n-0S6_WzA2Mj', NOW = 1_800_000_000;
const claims = (over = {}) => ({ iss: ISS, aud: CLIENT, sub: 'u-1', iat: NOW - 5, exp: NOW + 295, nonce: NONCE, amr: ['passkey'], email: 'a@b.c', name: 'Ada', ...over });
async function sign(c, { header = {}, key = pair } = {}) {
  const head = json({ alg: 'ES256', kid: 'k1', typ: 'JWT', ...header }), body = json(c);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, enc.encode(head + '.' + body)));
  return { jwt: `${head}.${body}.${b64url(sig)}`, sig, head, body };
}
const opts = { jwks, issuer: ISS, clientId: CLIENT, nonce: NONCE, now: NOW };
const check = (jwt, o = {}) => verifyIdToken(jwt, { ...opts, ...o });

// ---- reading ----
const good = await sign(claims());
const read = parseJwt(good.jwt);
ok(read.header.alg === 'ES256' && read.claims.sub === 'u-1' && read.signature.length === 64, 'a token is read into its header, claims and 64-byte signature');
for (const bad of ['', 'a.b', 'a.b.c.d', '!!.e30.', `${good.head}.@@.x`]) await refuses(`unreadable: ${JSON.stringify(bad)}`, (async () => parseJwt(bad))());

// ---- taken ----
ok((await check(good.jwt)).sub === 'u-1', 'a good token is taken');
ok((await check((await sign(claims({ aud: [CLIENT, 'other'], azp: CLIENT }))).jwt)).sub === 'u-1', 'several audiences, azp the game: taken');
ok((await check((await sign(claims({ amr: ['passkey', 'hwk'] }))).jwt)).sub === 'u-1', 'amr with passkey among others: taken');
ok((await check((await sign(claims(), { header: { kid: undefined } })).jwt, { jwks: { keys: [await pub(pair, 'k1')] } })).sub === 'u-1', 'no kid, the issuer has one key: taken');
ok((await check(good.jwt, { now: NOW + 295 + 30 })).sub === 'u-1', 'just past exp, within the skew: taken');

// ---- refused: the signature and its algorithm ----
await refuses('signed by another key', check((await sign(claims(), { key: other })).jwt), /signature does not hold/);
await refuses('the right key under another kid', check((await sign(claims(), { header: { kid: 'k2' } })).jwt), /no signing key/);
await refuses('kid of a key that is not EC P-256', check((await sign(claims(), { header: { kid: 'r1' } })).jwt), /no signing key/);
await refuses('no kid among several keys', check((await sign(claims(), { header: { kid: undefined } })).jwt, { jwks: { keys: [await pub(pair, 'k1'), await pub(other, 'k2')] } }), /names no key/);
await refuses('claims changed after signing', check(`${good.head}.${json(claims({ sub: 'u-2' }))}.${good.jwt.split('.')[2]}`), /signature does not hold/);
const der = (raw) => { const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); return b[0] & 0x80 ? [0, ...b] : [...b]; };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32)); return new Uint8Array([0x30, r.length + s.length + 4, 0x02, r.length, ...r, 0x02, s.length, ...s]); };
await refuses('a DER signature', check(`${good.head}.${good.body}.${b64url(der(good.sig))}`), /64 bytes/);
await refuses('alg none, no signature', check(`${json({ alg: 'none', typ: 'JWT' })}.${good.body}.`), /not ES256/);
await refuses('alg none, the ES256 signature kept', check(`${json({ alg: 'none', kid: 'k1' })}.${good.body}.${good.jwt.split('.')[2]}`), /not ES256/);
await refuses('HS256', check(`${json({ alg: 'HS256', kid: 'k1' })}.${good.body}.${b64url(new Uint8Array(32))}`), /not ES256/);
await refuses('EdDSA', check(`${json({ alg: 'EdDSA', kid: 'k1' })}.${good.body}.${b64url(new Uint8Array(64))}`), /not ES256/);
await refuses('no alg', check(`${json({ kid: 'k1' })}.${good.body}.${good.jwt.split('.')[2]}`), /not ES256/);
await refuses('crit', check((await sign(claims(), { header: { crit: ['exp'] } })).jwt), /extensions/);

// ---- refused: what it says ----
const says = async (what, c, why, o) => refuses(what, check((await sign(c)).jwt, o), why);
await says('wrong issuer', claims({ iss: 'https://evil.example' }), /issued by/);
await says('issuer with a trailing slash', claims({ iss: ISS + '/' }), /issued by/);
await says('wrong audience', claims({ aud: 'other' }), /not for this game/);
await says('several audiences, no azp', claims({ aud: [CLIENT, 'other'] }), /another client/);
await says('several audiences, azp another', claims({ aud: [CLIENT, 'other'], azp: 'other' }), /another client/);
await says('azp another, one audience', claims({ azp: 'other' }), /another client/);
await says('expired', claims({ exp: NOW - 120 }), /expired/);
await says('no exp', claims({ exp: undefined }), /expired/);
await says('iat in the future', claims({ iat: NOW + 600 }), /future/);
await says('issued long ago', claims({ iat: NOW - 3600, exp: NOW + 60 }), /too long ago/);
await says('wrong nonce', claims({ nonce: 'other' }), /nonce/);
await says('no nonce', claims({ nonce: undefined }), /nonce/);
await says('nonce asked for empty', claims({ nonce: '' }), /nonce/, { nonce: '' });
await says('no sub', claims({ sub: '' }), /names no one/);
await says('no amr', claims({ amr: undefined }), /passkey/);
await says('amr without passkey', claims({ amr: ['pwd'] }), /passkey/);
await says('amr not a list', claims({ amr: 'passkey' }), /passkey/);

// ---- the roles ----
ok(rolesOf({}).join() === 'traveler', 'no aven_roles: a traveler');
ok(rolesOf({ aven_roles: ['traveler'] }).join() === 'traveler', 'traveler');
ok(rolesOf({ aven_roles: ['traveler', 'citizen'] }).join() === 'traveler,citizen', 'citizen');
ok(rolesOf({ aven_roles: 'citizen' }).join() === 'traveler', 'aven_roles not a list: a traveler');

// ---- the way back ----
const O = 'https://maia.city', back = (p) => returnPath(p, O, { fallback: '/', callback: '/callback' });
ok(back('/') === '/', 'the root');
ok(back('/game/?in=os#city') === '/game/?in=os#city', 'a path with its query and hash');
for (const bad of ['https://evil.example/', '//evil.example/x', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', 'evil', '', null, undefined, 42, '/callback', '/callback?code=x', '/\tx', ' /x', 'https://maia.city/x'])
  ok(back(bad) === '/', `the way back refuses ${JSON.stringify(bad)}`);
ok(returnPath('/game/callback', O, { fallback: '/game/', callback: '/game/callback' }) === '/game/', 'inside the dashboard: not the callback');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
