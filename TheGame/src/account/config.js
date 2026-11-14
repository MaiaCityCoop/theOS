// Signing in with aven.id: the one place its numbers are set (TheGame/README.md, "Signing in").
//
//   issuer     https://aven.id; another (next, or aven-dotnet on this machine) by VITE_AVEN_ISSUER at build time, or by
//              ?issuer=<url> in the address, taken only when the game itself is served from this machine
//   client     maia-city, a public client: no secret, PKCE instead
//   redirect   <this origin><the game's base>callback: https://maia.city/callback; /game/callback inside the dashboard
//   session    how long the game keeps a sign-in in this tab
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** An issuer's address as given, if it is one: https, or http for an issuer on this machine. */
const issuerOk = (s) => { try { const u = new URL(s); return (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL.test(u.hostname))) && !u.search && !u.hash; } catch { return false; } };
const asked = LOCAL.test(location.hostname) ? new URLSearchParams(location.search).get('issuer') : null;
const built = import.meta.env.VITE_AVEN_ISSUER;

export const ACCOUNT = {
  issuer: [asked, built].find((s) => s && issuerOk(s)) || 'https://aven.id',
  clientId: 'maia-city',
  scope: 'openid profile email roles',
  redirectUri: `${location.origin}${import.meta.env.BASE_URL}callback`,
  home: import.meta.env.BASE_URL,   // where a sign-in goes back to when where it started cannot be known
  // 12 hours, not the ID token's 5 minutes: the game keeps no token to show anyone, only who signed in and their roles,
  // and those decide only what it shows; a whole day's play should not ask for the passkey again. A role changed at
  // aven.id (a traveler who becomes a citizen) shows at the next sign-in. The tab's closing ends it in any case.
  sessionHours: 12,
  roundTripMinutes: 10,   // a sign-in begun and not finished by then is forgotten
};
