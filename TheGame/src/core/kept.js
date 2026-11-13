// What recipes made, kept in the browser between starts (IndexedDB), each under a key and the word of what made it (its
// version: the zoo's fingerprint, assets/kit/zoo.js). A recipe makes the same on every machine at every start, so what
// it made once need not be made again: the stress stand's eleven thousand kinds' coarse meshes are read back in one
// piece (14 MB) where they took three workers some seconds. A recipe changed is another word: what was kept is not
// read, and is replaced when the new is made.
//
// Never in the way: no browser store, or another tab holding it, and the answer is `null` (then it is built, as at a
// first start).
const DB = 'maia-heap', STORE = 'kept';
let opening = null;
const open = () => (opening ||= new Promise((res) => {
  try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = r.onblocked = () => res(null); } catch { res(null); }
}));
/** What was kept under `key` by `version`, or null (nothing, or another version's). The answer may be late (a page
    that is starting holds the browser's answers back): who asks decides how long to wait for it. */
export const keptGet = (version, key) => open().then((db) => (db ? new Promise((res) => {
  try { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result?.version === version ? r.result.value : null); r.onerror = () => res(null); } catch { res(null); }
}) : null));
/** Keep `value` (what a structured clone carries: typed arrays, plain objects) under `key`, as made by `version`. */
export const keptPut = (version, key, value) => open().then((db) => (db ? new Promise((res) => {
  try { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put({ version, value }, key); t.oncomplete = () => res(true); t.onerror = t.onabort = () => res(false); } catch { res(false); }
}) : false));
