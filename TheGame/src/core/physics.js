// The machine's physical constants (intent 0038): what a size in bytes is said in. The one place they live (tools/health.js:
// a module named physics.js), each with its unit and its source.

/** A mebibyte. unit: bytes. source: IEC 80000-13 (2^20 bytes) */
export const MiB = 2 ** 20;
