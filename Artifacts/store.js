// The artifact library (../Artifacts/items/<id>/): outside sources, one folder each, as they stand on disk.
// artifact.json is ours and is committed; source.md (the verbatim extract) and thumb.jpg (the source's image) are the
// authors' work and stay on this machine (.gitignore). Read by Server/repo.js; changed only by artifacts.js.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const HOME = import.meta.dirname, ITEMS = resolve(HOME, 'items');
export const SCHEMA = JSON.parse(readFileSync(resolve(HOME, 'schema.json'), 'utf8'));

const words = (s) => (s.trim().match(/\S+/g) || []).length;
const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);

/** The problems of `v` against `s` (the subset of JSON Schema the artifact schema uses), as 'path: problem' lines. */
export function validate(v, s = SCHEMA, at = '') {
  const out = [], here = at || '(root)';
  if (s.const !== undefined && v !== s.const) out.push(`${here}: must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) out.push(`${here}: must be one of ${s.enum.join(', ')}`);
  if (s.type && !(s.type === kind(v) || (s.type === 'number' && typeof v === 'number') || (s.type === 'integer' && Number.isInteger(v)))) return [...out, `${here}: must be ${s.type}`];
  if (typeof v === 'string') {
    if (s.minLength != null && v.length < s.minLength) out.push(`${here}: shorter than ${s.minLength} characters`);
    if (s.maxLength != null && v.length > s.maxLength) out.push(`${here}: longer than ${s.maxLength} characters (${v.length})`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${here}: does not match ${s.pattern}`);
    if (s['x-maxWords'] != null && words(v) > s['x-maxWords']) out.push(`${here}: more than ${s['x-maxWords']} words (${words(v)})`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) out.push(`${here}: fewer than ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) out.push(`${here}: more than ${s.maxItems} items`);
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) out.push(`${here}: items repeat`);
    if (s.items) v.forEach((x, i) => out.push(...validate(x, s.items, `${at}[${i}]`)));
  }
  if (kind(v) === 'object') {
    for (const k of s.required || []) if (v[k] === undefined) out.push(`${at ? at + '.' : ''}${k}: missing`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties?.[k]) out.push(...validate(x, s.properties[k], at ? `${at}.${k}` : k));
      else if (s.additionalProperties === false) out.push(`${at ? at + '.' : ''}${k}: not in the schema`);
    }
  }
  return out;
}

/** Every artifact, newest first, each with what this machine holds of it (`has.source`, `has.thumb`). */
export function readArtifacts() {
  let ids = []; try { ids = readdirSync(ITEMS).filter((d) => existsSync(resolve(ITEMS, d, 'artifact.json'))); } catch {}
  return ids.map((id) => {
    try { return { ...JSON.parse(readFileSync(resolve(ITEMS, id, 'artifact.json'), 'utf8')), has: { source: existsSync(resolve(ITEMS, id, 'source.md')), thumb: existsSync(resolve(ITEMS, id, 'thumb.jpg')) } }; }
    catch { return null; }
  }).filter(Boolean).sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.id.localeCompare(b.id));
}
