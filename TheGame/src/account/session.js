// What the game keeps of a sign-in, in this tab's sessionStorage only (never localStorage: it goes when the tab
// does, and no other tab or later visit finds it). Three things, each under its own key:
//
//   maia.account        the session: { sub, email, name, roles, issuer, expiresAt }; never the tokens themselves
//   maia.account.trip   the round trip to aven.id and back: state, nonce, PKCE verifier, issuer, where to go back to;
//                       written before the redirect, read once and cleared by the callback
//   maia.account.said   a message for the game to show once (why a sign-in did not work)
//
// A frame of the same origin in the same tab (the game inside the dashboard) reads the same storage as the tab.
import { ACCOUNT } from './config.js';

const KEY = 'maia.account', TRIP = KEY + '.trip', SAID = KEY + '.said';
const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

/** The person signed in in this tab, or null (none, or its time is up). */
export function session() {
  const s = read(KEY);
  if (!s || typeof s.sub !== 'string' || !(s.expiresAt > Date.now())) { if (s) write(KEY, null); return null; }
  return s;
}
export function keep(claims, roles, issuer) {
  const s = { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : '', name: typeof claims.name === 'string' ? claims.name : '',
    roles, issuer, expiresAt: Date.now() + ACCOUNT.sessionHours * 3600e3 };
  write(KEY, s);
  return s;
}
/** Signing out is forgetting: aven.id has no end-session endpoint, and its own sign-in stays its own. */
export const forget = () => write(KEY, null);

export const startTrip = (trip) => write(TRIP, { ...trip, at: Date.now() });
/** The round trip, read once: it is cleared as it is read, whatever comes of it. */
export function endTrip() {
  const t = read(TRIP); write(TRIP, null);
  return t && Date.now() - t.at < ACCOUNT.roundTripMinutes * 60e3 ? t : null;
}

export const say = (text) => write(SAID, text);
export function heard() { const t = read(SAID); write(SAID, null); return typeof t === 'string' ? t : ''; }
