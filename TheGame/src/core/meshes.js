// The meshes the kits build, kept between starts. A tree's meshes take a third of a second and more to grow from its
// recipe, on the page's one thread; grown once they are kept in the browser (IndexedDB), each under what it is: its
// recipe's uid and seed, at its recipe's version (registry.json: the hash of its file, its kit and what it uses). A
// start reads them back (20 MB in some 10 ms) and builds none; a recipe that has changed has another version: it is
// built anew, and what was kept of it dropped. Where nothing can be kept (a private window) every start builds, as before.
//
// The start never waits on the store: it is read without a lock (several tabs of the game read at once), and if it has
// not answered in WAIT ms the meshes are built instead.
import { manifest } from './registry.js';
import { MESHES } from '../../assets/kit/tree.js';

const DB = 'maia-meshes', STORE = 'made', FORMAT = 2, WAIT = 600;   // FORMAT: raise it when what a kit hands on changes its make: all that is kept is dropped
const open = () => new Promise((ok, no) => {
  const q = indexedDB.open(DB, FORMAT);
  q.onupgradeneeded = () => { const d = q.result; if (d.objectStoreNames.contains(STORE)) d.deleteObjectStore(STORE); d.createObjectStore(STORE); };
  q.onsuccess = () => { q.result.onversionchange = () => q.result.close(); ok(q.result); };   // (another tab with a newer make: let it through)
  q.onerror = () => no(q.error); q.onblocked = () => no(new Error('blocked'));
});
const asked = (q) => new Promise((ok, no) => { q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
const done = (tx) => new Promise((ok, no) => { tx.oncomplete = ok; tx.onerror = tx.onabort = () => no(tx.error); });
// what a mesh is kept under: what it is (uid:seed) at its recipe's version; null for what is no recipe's
const keyOf = (id) => { const v = manifest[id.split(':')[0]]?.version; return v ? `${id}@${v}` : null; };
const current = () => new Set(Object.keys(manifest).map((uid) => `@${manifest[uid].version}`));

/** Hand the kits what was kept of this version of each recipe (before the world asks for any mesh). Returns how many;
    none if the store does not answer in time: the meshes are then built. */
export function primeMeshes() {
  let late = false;
  const read = (async () => {
    const db = await open(), st = db.transaction(STORE, 'readonly').objectStore(STORE), now = current();
    const [keys, all] = await Promise.all([asked(st.getAllKeys()), asked(st.getAll())]);   // (both asked at once: nothing is asked of the store after an await)
    db.close();
    if (!late) keys.forEach((k, i) => { const id = k.slice(0, k.lastIndexOf('@')); if (now.has(k.slice(id.length)) && keyOf(id) === k) MESHES.kept.set(id, all[i]); });   // (too late: the world has built its own by now)
    return MESHES.kept.size;
  })().catch(() => 0);   // nothing kept, or nowhere to keep
  return Promise.race([read, new Promise((ok) => setTimeout(() => { late = true; ok(0); }, WAIT))]);
}

/** Keep what was built anew this time, and drop what is kept of versions that are no more (after the start: the copy
    takes a moment). Returns how many it kept. */
export async function keepMeshes() {
  const fresh = [...MESHES.made].map(([id, made]) => [keyOf(id), made]).filter(([k]) => k); MESHES.made.clear();
  try {
    const db = await open(), tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
    let n = 0;
    st.getAllKeys().onsuccess = (e) => {   // (in the request's own answer: the transaction is still open)
      const have = new Set(e.target.result);
      for (const [k, made] of fresh) if (!have.has(k)) { st.put(made, k); n++; }   // (another tab may have kept it already)
      for (const k of have) if (keyOf(k.slice(0, k.lastIndexOf('@'))) !== k) st.delete(k);   // another version of it now, or a recipe that is gone
    };
    await done(tx); db.close();
    return n;
  } catch { return 0; }
}
