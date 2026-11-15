// The API against a real Postgres (DATABASE_URL; CI starts one) and an issuer of its own: a P-256 key made here signs
// the ID tokens, as aven.id's would. Run: DATABASE_URL=postgres://… bun test (from API/).
import { test, expect, beforeAll, afterAll, describe } from 'bun:test';
import { SQL } from 'bun';
import { api, migrate } from '../src/server.js';
import { verifyIdToken, keysOf, TokenError } from '../src/token.js';
import { avatarOf as apiAvatarOf, LIMITS as API_LIMITS } from '../src/avatar.js';
import { rolesReader } from '../src/roles.js';
import { avatarOf as gameAvatarOf, LIMITS as GAME_LIMITS, CHOICES, randomAvatar } from '../../TheGame/characters/kit/avatar.js';

const ISSUER = 'https://id.test', CLIENT = 'maia-city', GAME = 'https://play.test';
const enc = new TextEncoder();
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', use: 'sig', alg: 'ES256' };
const keyFor = async (kid) => { if (kid !== 'k1') throw new TokenError('no such key'); return jwk; };
let n = 0;
async function idToken(over = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: ISSUER, sub: '7b0c2f8e-0000-4000-8000-000000000001', aud: CLIENT, azp: CLIENT, iat: now, exp: now + 300, amr: ['passkey'],
    name: 'Ada', aven_roles: ['citizen'], n: n++, ...over };
  const head = b64(enc.encode(JSON.stringify({ alg: 'ES256', kid: 'k1', typ: 'JWT', ...header }))), body = b64(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, enc.encode(head + '.' + body));
  return `${head}.${body}.${b64(new Uint8Array(sig))}`;
}
const AVATAR = { body: 26, height: 1.74, skin: [0.5, 0.33, 0.24], hair: [0.85, 0.82, 0.8], shirt: [0.62, 0.78, 0.6], shoes: [0.16, 0.09, 0.055] };

describe('the ID token', () => {
  const check = (t) => verifyIdToken(t, { keyFor, issuer: ISSUER, clientId: CLIENT });
  test('holds when aven.id signed it for this game', async () => expect((await check(await idToken())).sub).toBe('7b0c2f8e-0000-4000-8000-000000000001'));
  for (const [why, over, header] of [
    ['another issuer', { iss: 'https://evil.test' }], ['another client', { aud: 'other' }], ['given to another client', { aud: [CLIENT, 'x'], azp: 'x' }],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 120 }], ['too old', { iat: Math.floor(Date.now() / 1000) - 3600 }], ['no passkey', { amr: ['pwd'] }],
    ['no one', { sub: '' }], ['not ES256', {}, { alg: 'HS256' }], ['an unknown key', {}, { kid: 'k2' }],
  ]) test(`is refused: ${why}`, async () => expect(check(await idToken(over, header))).rejects.toThrow(TokenError));
  test('is refused when its signature is changed', async () => {
    const t = await idToken(), last = t.at(-2) === 'A' ? 'B' : 'A';
    await expect(check(t.slice(0, -2) + last + t.at(-1))).rejects.toThrow(TokenError);
  });
  test('is refused when its claims are changed', async () => {
    const [h, , s] = (await idToken()).split('.'), body = b64(enc.encode(JSON.stringify({ iss: ISSUER, sub: '7b0c2f8e-0000-4000-8000-000000000002', aud: CLIENT, iat: Date.now() / 1000, exp: Date.now() / 1000 + 300, amr: ['passkey'] })));
    await expect(check(`${h}.${body}.${s}`)).rejects.toThrow(TokenError);
  });
  test("the issuer's keys are read from its description", async () => {
    const answers = { [`${ISSUER}/.well-known/openid-configuration`]: { issuer: ISSUER, jwks_uri: `${ISSUER}/jwks` }, [`${ISSUER}/jwks`]: { keys: [jwk] } };
    const keys = keysOf(ISSUER, { fetch: async (url) => new Response(JSON.stringify(answers[url]), { status: answers[url] ? 200 : 404 }) });
    expect((await keys('k1')).x).toBe(jwk.x);
  });
});

describe('the avatar', () => {
  test('the game and the API keep the same rules', () => {
    expect(GAME_LIMITS).toEqual(API_LIMITS);
    const samples = [AVATAR, { ...AVATAR, body: 1000 }, { ...AVATAR, body: 2.5 }, { ...AVATAR, height: 2.4 }, { ...AVATAR, hair: [3.1, 0, 0] }, { ...AVATAR, skin: [1, 1] },
      { ...AVATAR, extra: 1 }, { ...AVATAR, shoes: ['0', 0, 0] }, null, [], 'x', ...Array.from({ length: 50 }, (_, i) => randomAvatar(() => ((i * 7919) % 101) / 101))];
    for (const s of samples) expect(gameAvatarOf(s)).toEqual(apiAvatarOf(s));
  });
  test('every choice the page offers is one the API takes', () => {
    for (const [k, list] of Object.entries(CHOICES)) for (const c of list) expect(apiAvatarOf({ ...AVATAR, [k]: c.v })).not.toBeNull();
  });
});

describe("aven.id's roles back channel", () => {
  const answer = (status, body) => async (url, init) => { answer.seen = { url, auth: init.headers.authorization }; return new Response(JSON.stringify(body), { status }); };
  const SUB = '7b0c2f8e-0000-4000-8000-000000000001';
  test('asks with the client id and secret as Basic credentials', async () => {
    const read = rolesReader('https://id.test/', 'maia-city', 's3cret:+/', { fetch: answer(200, { sub: SUB, aven_roles: ['citizen'] }) });
    expect(await read(SUB)).toEqual({ roles: ['citizen'] });
    expect(answer.seen.url).toBe(`https://id.test/oauth2/roles?sub=${SUB}`);
    expect(atob(answer.seen.auth.replace('Basic ', ''))).toBe('maia-city:s3cret%3A%2B%2F');
  });
  test('an account aven.id does not have is gone; anything else is not known', async () => {
    expect(await rolesReader(ISSUER, CLIENT, 'x', { fetch: answer(404, { error: 'unknown_account' }) })(SUB)).toEqual({ gone: true });
    for (const [status, body] of [[503, { error: 'temporarily_unavailable' }], [401, { error: 'invalid_client' }], [200, { sub: 'someone-else', aven_roles: [] }], [200, { sub: SUB }]])
      expect(await rolesReader(ISSUER, CLIENT, 'x', { fetch: answer(status, body) })(SUB)).toBeNull();
    expect(await rolesReader(ISSUER, CLIENT, 'x', { fetch: async () => { throw new Error('down'); } })(SUB)).toBeNull();
  });
  test('without a secret there is no back channel', () => expect(rolesReader(ISSUER, CLIENT, '')).toBeNull());
});

const url = process.env.DATABASE_URL;
describe.skipIf(!url)('the API on Postgres', () => {
  let sql, handle;
  beforeAll(async () => {
    sql = new SQL(url);
    await sql.unsafe('DROP TABLE IF EXISTS sessions, used_id_tokens, avatars, schema_migrations');
    expect(await migrate(sql)).toEqual(['0001-sessions-and-avatars.sql', '0002-roles-checked-at.sql']);
    expect(await migrate(sql)).toEqual([]);   // once only
    handle = api({ sql, keyFor, issuer: ISSUER, clientId: CLIENT, origins: [GAME] });
  });
  afterAll(() => sql?.close());
  const call = (method, path, { body, cookie, origin = GAME, type = 'application/json' } = {}) => handle(new Request(`${GAME}${path}`, { method,
    headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': type } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
  async function signIn(over) {
    const res = await call('POST', '/api/session', { body: { id_token: await idToken(over) } });
    expect(res.status).toBe(200);
    const set = res.headers.get('set-cookie');
    expect(set).toMatch(/^__Host-maia-session=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
    return { cookie: set.split(';')[0], body: await res.json() };
  }

  test('health', async () => expect((await call('GET', '/api/health')).status).toBe(200));
  test('signed out, there is no one', async () => expect((await call('GET', '/api/me')).status).toBe(401));
  test('a sign-in opens a session; the citizen keeps an avatar', async () => {
    const { cookie, body } = await signIn();
    expect(body).toEqual({ sub: '7b0c2f8e-0000-4000-8000-000000000001', name: 'Ada', citizen: true });
    expect(await (await call('GET', '/api/me', { cookie })).json()).toEqual({ ...body, avatar: null });
    const put = await call('PUT', '/api/me/avatar', { cookie, body: { avatar: { ...AVATAR, height: 1.7412 } } });
    expect(put.status).toBe(200);
    expect((await put.json()).avatar.height).toBe(1.741);
    expect((await (await call('GET', '/api/me', { cookie })).json()).avatar).toEqual({ ...AVATAR, height: 1.741 });
    expect((await call('PUT', '/api/me/avatar', { cookie, body: { avatar: { ...AVATAR, body: 3 } } })).status).toBe(200);
    expect((await (await call('GET', '/api/me', { cookie })).json()).avatar.body).toBe(3);   // kept again, not twice
  });
  test('a traveler cannot make one', async () => {
    const { cookie, body } = await signIn({ sub: '7b0c2f8e-0000-4000-8000-000000000002', aven_roles: [] });
    expect(body.citizen).toBe(false);
    const res = await call('PUT', '/api/me/avatar', { cookie, body: { avatar: AVATAR } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'citizens_only' });
  });
  test('an ID token opens one session only', async () => {
    const t = await idToken();
    expect((await call('POST', '/api/session', { body: { id_token: t } })).status).toBe(200);
    expect((await call('POST', '/api/session', { body: { id_token: t } })).status).toBe(401);
  });
  test('a bad token opens nothing', async () => {
    expect((await call('POST', '/api/session', { body: { id_token: await idToken({ aud: 'other' }) } })).status).toBe(401);
    expect((await call('POST', '/api/session', { body: { id_token: 'x.y.z' } })).status).toBe(401);
    expect((await call('POST', '/api/session', { body: {} })).status).toBe(401);
  });
  test('only the game, and only as JSON, may change anything', async () => {
    const { cookie } = await signIn();
    expect((await call('POST', '/api/session', { origin: 'https://evil.test', body: { id_token: await idToken() } })).status).toBe(403);
    expect((await call('POST', '/api/session', { origin: null, body: { id_token: await idToken() } })).status).toBe(403);
    expect((await call('PUT', '/api/me/avatar', { cookie, origin: 'https://evil.test', body: { avatar: AVATAR } })).status).toBe(403);
    expect((await call('PUT', '/api/me/avatar', { cookie, type: 'text/plain', body: { avatar: AVATAR } })).status).toBe(415);
    expect((await call('DELETE', '/api/session', { cookie, origin: 'https://evil.test' })).status).toBe(403);
  });
  test('what is not an avatar is not kept', async () => {
    const { cookie } = await signIn();
    for (const avatar of [{ ...AVATAR, height: 3 }, { ...AVATAR, mesh: 'x' }, 'x', null]) expect((await call('PUT', '/api/me/avatar', { cookie, body: { avatar } })).status).toBe(400);
  });
  test('signing out ends the session', async () => {
    const { cookie } = await signIn();
    const out = await call('DELETE', '/api/session', { cookie });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await call('GET', '/api/me', { cookie })).status).toBe(401);
  });
  test('a made-up or expired session is no one', async () => {
    expect((await call('GET', '/api/me', { cookie: `__Host-maia-session=${'0'.repeat(64)}` })).status).toBe(401);
    const { cookie } = await signIn();
    await sql`UPDATE sessions SET expires_at = now() - interval '1 second'`;
    expect((await call('GET', '/api/me', { cookie })).status).toBe(401);
  });
  test("a citizenship bought or ended at aven.id shows without signing in again", async () => {
    let clock = Date.now(), said = { roles: [] }, asked = 0;
    const live = api({ sql, keyFor, issuer: ISSUER, clientId: CLIENT, origins: [GAME], now: () => clock, rolesOf: async () => { asked++; return said; } });
    const go = (method, path, opts = {}) => live(new Request(`${GAME}${path}`, { method, headers: { origin: GAME, cookie: opts.cookie, ...(opts.body ? { 'content-type': 'application/json' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }));
    const sub = '7b0c2f8e-0000-4000-8000-0000000000c1';
    const res = await go('POST', '/api/session', { body: { id_token: await idToken({ sub, aven_roles: [] }) } });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    expect((await (await go('GET', '/api/me', { cookie })).json()).citizen).toBe(false);
    expect(asked).toBe(0);   // the token's own answer is fresh
    said = { roles: ['citizen'] }; clock += 31e3;
    expect((await (await go('GET', '/api/me', { cookie })).json()).citizen).toBe(true);
    expect((await go('PUT', '/api/me/avatar', { cookie, body: { avatar: AVATAR } })).status).toBe(200);
    expect(asked).toBe(1);   // asked once, then the answer is fresh again
    said = null; clock += 31e3;   // aven.id cannot say: what is known stands
    expect((await (await go('GET', '/api/me', { cookie })).json()).citizen).toBe(true);
    said = { roles: [] }; clock += 31e3;   // ended
    expect((await go('PUT', '/api/me/avatar', { cookie, body: { avatar: AVATAR } })).status).toBe(403);
    said = { gone: true }; clock += 31e3;   // the account is no more
    expect((await go('GET', '/api/me', { cookie })).status).toBe(401);
    expect((await sql`SELECT count(*)::int AS n FROM sessions WHERE sub = ${sub}`)[0].n).toBe(0);
  });
  test('unknown paths and methods', async () => {
    expect((await call('GET', '/api/nothing')).status).toBe(404);
    expect((await call('GET', '/api/session')).status).toBe(405);
  });
});
