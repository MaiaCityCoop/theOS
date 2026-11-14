// The way back from aven.id (callback.html, the client's redirect URI): the code it sends is exchanged for an ID token
// here, the token is checked in this browser (src/account/oidc.js: verifyIdToken), and who signed in is kept for the
// game (src/account/session.js); then back to where the person was. Whatever goes wrong is said to the game, which
// shows it, and the person is sent back all the same: a sign-in that did not work leaves the game as it was.
import { ACCOUNT } from './config.js';
import { AccountError, discover, exchange, keys, verifyIdToken, rolesOf, returnPath } from './oidc.js';
import { endTrip, keep, say } from './session.js';

const line = document.getElementById('line');
const q = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);   // the code is used once: it leaves the address, and the history, at once
const trip = endTrip();   // read once, cleared now, whatever comes of it
const back = returnPath(trip?.back, location.origin, { fallback: ACCOUNT.home, callback: location.pathname });

async function finish() {
  if (!trip) throw new AccountError('invalid', 'That sign-in was not begun in this tab, or it was already used, or it took too long.');
  if (q.get('state') !== trip.state) throw new AccountError('invalid', 'The answer from aven.id is not for this sign-in (state).');
  if (q.has('iss') && q.get('iss') !== trip.issuer) throw new AccountError('invalid', 'The answer came from another issuer.');   // (RFC 9207, where the issuer says it)
  const error = q.get('error');
  if (error) throw new AccountError('refused', error === 'access_denied' ? 'The sign-in was cancelled at aven.id.' : `aven.id refused the sign-in: ${q.get('error_description') || error}.`);
  const code = q.get('code');
  if (!code) throw new AccountError('invalid', 'aven.id sent no code.');
  const meta = await discover(trip.issuer);
  line.textContent = 'Checking who you are';
  const idToken = await exchange(meta, { code, redirectUri: trip.redirectUri, clientId: ACCOUNT.clientId, verifier: trip.verifier, issuer: trip.issuer });
  const claims = await verifyIdToken(idToken, { jwks: await keys(meta, trip.issuer), issuer: trip.issuer, clientId: ACCOUNT.clientId, nonce: trip.nonce });
  keep(claims, rolesOf(claims), trip.issuer);   // the token itself goes no further than this function
}

finish()
  .catch((e) => {
    say(e instanceof AccountError ? e.message : `The sign-in did not work: ${e?.message || e}.`);
  })
  .finally(() => location.replace(back));
