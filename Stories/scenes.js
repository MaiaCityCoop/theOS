// Scenes (Stories/scenes/<scene>/scene.json) and their media (Stories/objects/<hash>). Every change is a call of this
// tool (how: .claude/skills/story-arc/SKILL.md).
//
// A scene is a short: one timeline that stands alone and that other timelines contain. A story is composed of scenes
// (its arc names one per section: Stories/arc.js), and one scene may play in many stories: the trailer is a scene.
//
//   bun Stories/scenes.js put <scene> < scene.json    the scene made or replaced whole
//   bun Stories/scenes.js list                        every scene: its length, its tracks, its media here or missing
//   bun Stories/scenes.js show <scene>                its shots and its words, in order
//   bun Stories/scenes.js transcript <scene>          what is said, with its times
//   bun Stories/scenes.js objects <scene>             its media, each checked against its hash
//   bun Stories/scenes.js fetch <scene>               its missing media brought from where the scene came from (source.files,
//                                                     a URL the hash is added to; MAIA_PLAY_AUTH: the Authorization it asks for)
//   bun Stories/scenes.js add <file>                  a file taken in as an object: prints its hash
//
// scene.json: { schema: 'scene/1', id, title, format, fps, duration, source?, tracks: [{ id, kind, clips }] } with the
// tracks of play's story/1 (shots: frame, video, video_in, transition, camera, description · voice: who, line, cues,
// audio · notes: section, emotion, pace, mood, sound · music, sfx: audio, gain, keys, fades), times in seconds.
// Media is named by its BLAKE3 hash and lies flat in Stories/objects/, which git does not keep: the scene's file says
// which objects it needs, and objects.json (kept) what each is.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blake3 } from '../TheGame/node_modules/@noble/hashes/blake3.js';
import { bytesToHex } from '../TheGame/node_modules/@noble/hashes/utils.js';

const HERE = dirname(fileURLToPath(import.meta.url)), SCENES = resolve(HERE, 'scenes'), OBJECTS = resolve(HERE, 'objects'), INDEX = resolve(HERE, 'objects.json');
const HASH = /^[0-9a-f]{64}$/, FIELDS = ['frame', 'video', 'audio', 'composition'];
const fail = (m) => { console.error('scenes: ' + m); process.exit(1); };
const hashOf = (bytes) => bytesToHex(blake3(bytes));
const index = () => { try { return JSON.parse(readFileSync(INDEX, 'utf8')); } catch { return {}; } };
const keep = (ix) => writeFileSync(INDEX, JSON.stringify(Object.fromEntries(Object.entries(ix).sort()), null, 1) + '\n');
const typeOf = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.subarray(4, 8).toString() === 'ftyp' ? 'video/mp4' : b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ? 'audio/mpeg' : b.subarray(0, 4).toString() === 'RIFF' ? (b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : 'audio/wav') : b.subarray(0, 4).toString() === 'OggS' ? 'audio/ogg' : 'application/octet-stream');

export const sceneFile = (id) => resolve(SCENES, id, 'scene.json');
export const readScene = (id) => JSON.parse(readFileSync(sceneFile(id), 'utf8'));
/** Every scene, shortly: { id, title, duration, format, tracks, shots, cover } (what the studio lists). */
export function listScenes() {
  if (!existsSync(SCENES)) return [];
  return readdirSync(SCENES).filter((d) => existsSync(sceneFile(d))).sort().map((d) => { const s = readScene(d), shots = s.tracks.find((t) => t.kind === 'shots')?.clips ?? []; return { id: s.id, title: s.title, duration: s.duration, format: s.format, tracks: s.tracks.length, shots: shots.length, cover: shots[0]?.frame ?? null }; });
}
/** A scene's media: [{ hash, as: 'frame' | 'video' | 'audio', clip }], each hash once. */
export function mediaOf(s) {
  const out = new Map();
  for (const t of s.tracks) for (const c of t.clips) for (const f of FIELDS) if (c[f] && !out.has(c[f])) out.set(c[f], { hash: c[f], as: f, clip: `${t.id}/${c.id}` });
  return [...out.values()];
}
export const objectPath = (hash) => (HASH.test(hash) ? resolve(OBJECTS, hash) : null);
export const objectType = (hash) => index()[hash]?.type ?? 'application/octet-stream';

function check(s) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id || '')) fail('a scene\'s id is lower-case words joined by hyphens');
  if (s.schema !== 'scene/1' || !s.title || !Array.isArray(s.tracks)) fail('a scene is { schema: \'scene/1\', id, title, tracks }');
  for (const t of s.tracks) { if (!t.id || !t.kind || !Array.isArray(t.clips)) fail(`a track is { id, kind, clips }: ${t.id}`); for (const c of t.clips) { if (!(c.at >= 0)) fail(`${t.id}/${c.id}: at, in seconds`); for (const f of FIELDS) if (c[f] && !HASH.test(c[f])) fail(`${t.id}/${c.id}: ${f} is a BLAKE3 hash`); } }
  s.duration = +Math.max(0, ...s.tracks.flatMap((t) => t.clips.map((c) => c.at + (c.duration || 0)))).toFixed(2);
  return s;
}
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
/** What is said in a scene, in order: [{ at, who, text, em? }] (a voice clip's cues, or its one line). */
export function transcript(s) {
  const out = [];
  for (const t of s.tracks.filter((x) => x.kind === 'voice')) for (const c of t.clips) { if (c.cues?.length) for (const q of c.cues) out.push({ at: +(c.at + q.at).toFixed(2), who: c.who, text: q.text, ...(q.em ? { em: true } : {}) }); else out.push({ at: c.at, who: c.who, text: c.line }); }
  return out.sort((a, b) => a.at - b.at);
}

if (import.meta.main) {
  const [cmd, a] = process.argv.slice(2);
  if (cmd === 'put') { const s = check(JSON.parse(readFileSync(0, 'utf8'))); if (s.id !== a) fail(`the scene's id is ${s.id}, not ${a}`); mkdirSync(resolve(SCENES, a), { recursive: true }); writeFileSync(sceneFile(a), JSON.stringify(s, null, 1) + '\n'); console.log(`scene ${a} put: ${clock(s.duration)}, ${mediaOf(s).length} objects`); }
  else if (cmd === 'list') for (const s of listScenes()) { const m = mediaOf(readScene(s.id)); console.log(`${s.id.padEnd(16)} ${clock(s.duration)}  ${s.format}  ${s.shots} shots, ${s.tracks} tracks, media ${m.filter((x) => existsSync(objectPath(x.hash))).length}/${m.length} here  ${s.title}`); }
  else if (cmd === 'show') { const s = readScene(a); console.log(`${s.title}\n${clock(s.duration)} · ${s.format} · ${s.fps} fps\n`); for (const c of s.tracks.find((t) => t.kind === 'shots')?.clips ?? []) console.log(`${clock(c.at)}  ${c.id.padEnd(14)} ${c.transition}\n         ${c.camera}`); console.log(''); for (const l of transcript(s)) console.log(`${clock(l.at)}  ${l.who}: ${l.text}${l.em ? '   (alone, large)' : ''}`); }
  else if (cmd === 'transcript') for (const l of transcript(readScene(a))) console.log(`${clock(l.at)}  ${l.who}: ${l.text}`);
  else if (cmd === 'objects') { const ix = index(); for (const m of mediaOf(readScene(a))) { const p = objectPath(m.hash), here = existsSync(p), ok = here && hashOf(readFileSync(p)) === m.hash; console.log(`${m.hash.slice(0, 12)}… ${m.as.padEnd(6)} ${String(ix[m.hash]?.type ?? '?').padEnd(11)} ${here ? (ok ? 'here, hash holds' : 'HERE BUT ITS HASH DOES NOT HOLD') : 'missing'}  ${ix[m.hash]?.bytes ?? ''}  ${m.clip}`); } }
  else if (cmd === 'fetch') {
    const s = readScene(a), from = s.source?.files; if (!from) fail('the scene names no source.files to fetch from');
    mkdirSync(OBJECTS, { recursive: true }); const ix = index(); let got = 0;
    for (const m of mediaOf(s)) {
      const p = objectPath(m.hash); if (existsSync(p)) continue;
      const r = await fetch(from + m.hash, { headers: process.env.MAIA_PLAY_AUTH ? { Authorization: process.env.MAIA_PLAY_AUTH } : {} });
      if (!r.ok) { console.log(`${m.hash.slice(0, 12)}… ${r.status}: not fetched`); continue; }
      const b = Buffer.from(await r.arrayBuffer()); if (hashOf(b) !== m.hash) { console.log(`${m.hash.slice(0, 12)}… its bytes do not hash to its name: not kept`); continue; }
      writeFileSync(p, b); ix[m.hash] = { type: typeOf(b), bytes: b.length, as: m.as, from: s.source.files }; got++; console.log(`${m.hash.slice(0, 12)}… ${ix[m.hash].type} ${b.length}`);
    }
    keep(ix); console.log(`${got} fetched`);
  } else if (cmd === 'add') { const b = readFileSync(a), h = hashOf(b), ix = index(); mkdirSync(OBJECTS, { recursive: true }); writeFileSync(objectPath(h), b); ix[h] = { type: typeOf(b), bytes: b.length }; keep(ix); console.log(h); }
  else fail('put | list | show | transcript | objects | fetch | add (see the head of Stories/scenes.js)');
}
