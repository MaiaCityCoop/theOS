// The game's API (API/, intent 0024), on the game's own origin: Caddy hands it /api/session and /api/me
// (deploy/Caddyfile); on this machine the dev server does (vite.config.js, MAIA_API). The game shows the API the ID
// token once, right after signing in (callback.js); from then on the API knows the person by its own cookie, which this
// page never sees (HttpOnly). Each call says what came of it and never throws: without its API the game plays on.
//
//   openSession(idToken)  -> { ok, status, body }   body: { sub, name, citizen }
//   closeSession()                                   signing out of the API too (session.js forget)
//   whoAmI()              -> { ok, status, body }   body: { sub, name, citizen, avatar }; status 401: no API session
//   keepAvatar(avatar)    -> { ok, status, body }   body: { avatar } or { error }: 'citizens_only', 'not_an_avatar', …
//   status 0: the API could not be reached.

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'api/';

async function call(method, path, body) {
  try {
    const res = await fetch(BASE + path, { method, credentials: 'same-origin', cache: 'no-store', keepalive: method === 'DELETE',
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
    let data = null;
    try { data = res.status === 204 ? null : await res.json(); } catch {}
    return { ok: res.ok, status: res.status, body: data };
  } catch { return { ok: false, status: 0, body: null }; }
}

export const openSession = (idToken) => call('POST', 'session', { id_token: idToken });
export const closeSession = () => call('DELETE', 'session');
export const whoAmI = () => call('GET', 'me');
export const keepAvatar = (avatar) => call('PUT', 'me/avatar', { avatar });
