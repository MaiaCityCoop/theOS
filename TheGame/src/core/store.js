// What a viewer's settings keep between visits (the clock's hour, the wind): one key each in this browser's storage,
// read back as it was written. Nothing that must be shared lives here.
export const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem('maia.' + key)); return v ?? fallback; } catch { return fallback; } };
export const save = (key, value) => { try { localStorage.setItem('maia.' + key, JSON.stringify(value)); } catch {} };
