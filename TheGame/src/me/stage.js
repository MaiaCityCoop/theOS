// Your person on the library's stage (me.html, intent 0024; src/stage/studio.js): the person the card chooses (card.js,
// the event `me:person`) built by the human kit (characters/kit/human.js) a moment after the last change, and the
// camera circling them under the studio's light.
// The world (src/boot.js, the stage's) is started from here, not by the page: the card (card.js) must never wait for it.
import * as THREE from 'three/webgpu';
import { recipes } from '../core/registry.js';
import { STAGE } from '../../world/places.js';
import { heightAt } from '../world/land.js';
import { humanOf } from '../../characters/kit/human.js';
import { personOf } from '../../characters/kit/avatar.js';
import { createStudio } from '../stage/studio.js';

const SETTLER = recipes('character').find((c) => c.uid === '944dc52a-5094-480c-9396-5ceedbbf03b1');   // characters/settler.js: the cloth and the moves a person wears

const game = await (await import('../boot.js')).boot({ profile: 'stage' });
const studio = createStudio(game, { near: 2.2, far: 40 });
studio.H = 2.2; studio.dist = 4.2; studio.pitch = 0.2;

let person = null, staged = null, built = null, timer = 0;
function stage({ avatar, name, move }) {
  const key = JSON.stringify([avatar, name]);
  if (key !== built) {
    const P = humanOf(game.tex, personOf(avatar, SETTLER, name));
    if (staged) { game.hide(staged); person.mesh.geometry.dispose(); person.material?.dispose?.(); }
    staged = new THREE.Group(); staged.position.set(STAGE.x, heightAt(STAGE.x, STAGE.z), STAGE.z); staged.add(P.object);
    P.setMove(person?.move ?? 'idle'); P.step(0); person = P; built = key;
    game.show(staged);
    studio.person = P; studio.H = P.height * 1.25;
  }
  person.setMove(move);
}
const want = (w) => { clearTimeout(timer); timer = setTimeout(() => stage(w), 90); };
document.addEventListener('me:person', (e) => want(e.detail));
if (window.__mePerson) want(window.__mePerson);
