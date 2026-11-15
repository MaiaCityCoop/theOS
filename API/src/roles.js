// A person's roles now, from aven.id's roles back channel (GET <issuer>/oauth2/roles?sub=), which the API calls with
// the client id and its roles secret (AVEN_ROLES_SECRET; aven.id holds only its SHA-256). It is how a citizenship
// bought or ended at aven.id reaches the game without the person signing in again: the ID token's roles are those of
// the moment of signing in.
//
//   rolesOf(sub) -> { roles: [...] }        what aven.id says now
//                   { gone: true }          aven.id has no such account (404 unknown_account): its sessions end
//                   null                    aven.id could not say (unreachable, 5xx, refused): keep what is known

export function rolesReader(issuer, clientId, secret, { fetch: get = fetch } = {}) {
  if (!secret) return null;
  const basic = 'Basic ' + btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`);
  const base = issuer.replace(/\/$/, '') + '/oauth2/roles?sub=';
  return async function rolesOf(sub) {
    let res;
    try { res = await get(base + encodeURIComponent(sub), { headers: { authorization: basic, accept: 'application/json' }, signal: AbortSignal.timeout(5000) }); }
    catch (e) { console.warn('aven.id roles could not be read:', e?.message || e); return null; }
    let body = null;
    try { body = await res.json(); } catch {}
    // only aven.id's own word ends the sessions: a 404 without it (an aven.id without the back channel) is not knowing
    if (res.status === 404 && body?.error === 'unknown_account') return { gone: true };
    if (!res.ok) { console.warn(`aven.id roles answered ${res.status}`); return null; }
    if (body?.sub !== sub || !Array.isArray(body.aven_roles)) { console.warn('aven.id roles answered something else'); return null; }
    return { roles: body.aven_roles.filter((r) => typeof r === 'string') };
  };
}
