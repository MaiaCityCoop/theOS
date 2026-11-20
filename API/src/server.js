// The game's API: who is signed in, and each person's avatar. Bun and Postgres only (Bun.sql, WebCrypto); no packages.
// Caddy sends it these paths of the game's own name (Deploy/Caddyfile), so the game calls it on its own origin:
//
//   POST   /api/session      { id_token }   the ID token aven.id just gave the game, checked (token.js) and taken once;
//                                          opens a session: an HttpOnly cookie for SESSION_HOURS. 200 { sub, name, citizen }
//   DELETE /api/session                    signs out of the API. 204
//   GET    /api/me                         200 { sub, name, citizen, avatar } (avatar: null until one is made), or 401
//   PUT    /api/me/avatar    { avatar }     keeps the avatar (avatar.js); only a citizen may. 200 { avatar }, 400, 401, 403
//   GET    /api/health                     200 { ok: true, commit } when Postgres answers (commit: version.json's, or null)
//
// Whether a person is a citizen is first what their ID token said when the session opened, then what aven.id's roles
// back channel says (roles.js), asked again whenever that answer is older than ROLES_MAX_AGE_SECONDS (30): a
// citizenship bought or ended at aven.id shows within moments, without signing in again.
// A request that changes something must come from the game's origin (ORIGINS) as JSON, so no other site's page can
// make a signed-in browser do it; the cookie is SameSite=Strict besides.
import { SQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { avatarOf } from './avatar.js';
import { TokenError, keysOf, verifyIdToken } from './token.js';
import { rolesReader } from './roles.js';

const enc = new TextEncoder();
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));

/** The migrations (../migrations/NNNN-*.sql) not yet applied, applied in order, one transaction each, one API at a time. */
export async function migrate(sql, dir = join(import.meta.dir, '../migrations')) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const files = (await readdir(dir)).filter((f) => /^\d{4}-[a-z0-9-]+\.sql$/.test(f)).sort();
  const applied = [];
  for (const name of files) {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(7024)`;
      if ((await tx`SELECT 1 FROM schema_migrations WHERE name = ${name}`).length) return;
      await tx.unsafe(await Bun.file(join(dir, name)).text());
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      applied.push(name);
    });
  }
  return applied;
}

/** The request handler. keyFor: the issuer's keys (token.js keysOf); origins: where the game is served from. */
export function api({ sql, keyFor, issuer, clientId, origins, commit = null, rolesOf = null, rolesMaxAge = 30e3, sessionHours = 12, cookieName = '__Host-maia-session', secure = true, now = () => Date.now() }) {
  const json = (status, body, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(body === null ? {} : { 'content-type': 'application/json' }), ...headers } });
  const fail = (status, error, headers) => json(status, { error }, headers);
  const cookie = (value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const tokenIn = (req) => {
    for (const part of (req.headers.get('cookie') || '').split(';')) {
      const [k, v] = part.trim().split('=');
      if (k === cookieName && /^[0-9a-f]{64}$/.test(v || '')) return v;
    }
    return null;
  };
  async function sessionOf(req) {
    const t = tokenIn(req);
    if (!t) return null;
    const [s] = await sql`SELECT sub, name, citizen, roles_checked_at FROM sessions WHERE token_hash = ${await sha256(t)} AND expires_at > now()`;
    if (!s) return null;
    const out = { sub: String(s.sub), name: s.name, citizen: s.citizen };
    // the citizenship as aven.id says it now, once the last answer is old; the same for all of this person's sessions
    if (rolesOf && now() - new Date(s.roles_checked_at).getTime() > rolesMaxAge) {
      const r = await rolesOf(out.sub);
      if (r?.gone) { await sql`DELETE FROM sessions WHERE sub = ${out.sub}`; return null; }
      if (r?.roles) {
        out.citizen = r.roles.includes('citizen');
        await sql`UPDATE sessions SET citizen = ${out.citizen}, roles_checked_at = ${new Date(now())} WHERE sub = ${out.sub}`;
      }
    }
    return out;
  }
  // a change: from the game's own page, as JSON (a form from another site can send neither)
  const fromGame = (req) => origins.includes(req.headers.get('origin') || '');
  const asJson = (req) => /^application\/json(;|$)/i.test(req.headers.get('content-type') || '');
  async function body(req) { try { return await req.json(); } catch { return undefined; } }

  const routes = {
    'GET /api/health': async () => { await sql`SELECT 1`; return json(200, { ok: true, commit }); },

    'POST /api/session': async (req) => {
      if (!fromGame(req)) return fail(403, 'origin');
      if (!asJson(req)) return fail(415, 'json_only');
      const b = await body(req);
      let claims;
      try { claims = await verifyIdToken(b?.id_token, { keyFor, issuer, clientId, now: now() / 1000 }); }
      catch (e) {
        if (e instanceof TokenError) return fail(401, 'invalid_token');
        console.warn('aven.id could not be read:', e?.message || e);
        return fail(503, 'issuer_unreachable', { 'retry-after': '5' });
      }
      const usedUntil = new Date((claims.exp + 60) * 1000);
      const [fresh] = await sql`INSERT INTO used_id_tokens (token_hash, expires_at) VALUES (${await sha256(b.id_token)}, ${usedUntil}) ON CONFLICT DO NOTHING RETURNING 1 AS ok`;
      if (!fresh) return fail(401, 'invalid_token');
      const citizen = Array.isArray(claims.aven_roles) && claims.aven_roles.includes('citizen');
      const name = typeof claims.name === 'string' ? claims.name.slice(0, 200) : '';
      const t = token(), until = new Date(now() + sessionHours * 3600e3), old = tokenIn(req);
      await sql.begin(async (tx) => {
        if (old) await tx`DELETE FROM sessions WHERE token_hash = ${await sha256(old)}`;
        await tx`INSERT INTO sessions (token_hash, sub, name, citizen, expires_at, roles_checked_at) VALUES (${await sha256(t)}, ${claims.sub}, ${name}, ${citizen}, ${until}, ${new Date(now())})`;
        await tx`DELETE FROM sessions WHERE expires_at < now()`;
        await tx`DELETE FROM used_id_tokens WHERE expires_at < now()`;
      });
      return json(200, { sub: claims.sub, name, citizen }, { 'set-cookie': cookie(t, sessionHours * 3600) });
    },

    'DELETE /api/session': async (req) => {
      if (!fromGame(req)) return fail(403, 'origin');
      const t = tokenIn(req);
      if (t) await sql`DELETE FROM sessions WHERE token_hash = ${await sha256(t)}`;
      return json(204, null, { 'set-cookie': cookie('', 0) });
    },

    'GET /api/me': async (req) => {
      const s = await sessionOf(req);
      if (!s) return fail(401, 'signed_out');
      const [a] = await sql`SELECT recipe FROM avatars WHERE sub = ${s.sub}`;
      return json(200, { ...s, avatar: a ? (typeof a.recipe === 'string' ? JSON.parse(a.recipe) : a.recipe) : null });
    },

    'PUT /api/me/avatar': async (req) => {
      if (!fromGame(req)) return fail(403, 'origin');
      if (!asJson(req)) return fail(415, 'json_only');
      const s = await sessionOf(req);
      if (!s) return fail(401, 'signed_out');
      if (!s.citizen) return fail(403, 'citizens_only');
      const avatar = avatarOf((await body(req))?.avatar);
      if (!avatar) return fail(400, 'not_an_avatar');
      await sql`INSERT INTO avatars (sub, recipe) VALUES (${s.sub}, ${JSON.stringify(avatar)}::jsonb)
        ON CONFLICT (sub) DO UPDATE SET recipe = EXCLUDED.recipe, updated_at = now()`;
      return json(200, { avatar });
    },
  };
  const paths = new Set(Object.keys(routes).map((k) => k.split(' ')[1]));

  return async function handle(req) {
    const path = new URL(req.url).pathname, route = routes[`${req.method} ${path}`];
    if (!route) return paths.has(path) ? fail(405, 'method') : fail(404, 'not_found');
    try { return await route(req); }
    catch (e) { console.error(`${req.method} ${path}:`, e); return fail(500, 'internal'); }
  };
}

// Run as the server (Dockerfile): the settings come from the environment (Deploy/compose.yml).
if (import.meta.main) {
  const need = (k) => process.env[k] || (console.error(`${k} is not set.`), process.exit(2));
  const issuer = need('ISSUER'), sql = new SQL(need('DATABASE_URL'));
  for (let i = 0; ; i++) {   // Postgres may still be starting
    try { const applied = await migrate(sql); if (applied.length) console.log('Applied', applied.join(', ')); break; }
    catch (e) { if (i >= 30) throw e; console.warn('Waiting for Postgres:', e?.message || e); await Bun.sleep(1000); }
  }
  // the release's commit (Deploy/bundle.sh writes version.json beside src/), so a deploy can tell this API from the last
  const commit = (await Bun.file(join(import.meta.dir, '../version.json')).json().catch(() => null))?.commit ?? null;
  const clientId = process.env.CLIENT_ID || 'maia-city';
  const rolesOf = rolesReader(issuer, clientId, process.env.AVEN_ROLES_SECRET || '');
  if (!rolesOf) console.warn('AVEN_ROLES_SECRET is not set: a citizenship shows only at the next sign-in.');
  const handle = api({ sql, issuer, keyFor: keysOf(issuer), clientId, commit, rolesOf, rolesMaxAge: +(process.env.ROLES_MAX_AGE_SECONDS || 30) * 1000,
    origins: need('ORIGINS').split(',').map((s) => s.trim()).filter(Boolean),
    sessionHours: +(process.env.SESSION_HOURS || 12), secure: process.env.INSECURE_COOKIE !== '1',
    cookieName: process.env.INSECURE_COOKIE === '1' ? 'maia-session' : '__Host-maia-session' });
  const server = Bun.serve({ port: +(process.env.PORT || 3000), hostname: '0.0.0.0', maxRequestBodySize: 16 * 1024, fetch: handle });
  console.log(`The API listens on ${server.port}, for ${issuer}`);
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { server.stop(); await sql.close(); process.exit(0); });
}
