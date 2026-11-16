// How a strand of muscle is laid in the texture the shader reads (intent 0036; ./build.js writes it, ./flesh.js reads
// it): a row a strand, its points first (a ghost before them, two after), then the way each faces out in the same
// places, then its own numbers (the belly's swell). At most MAXK points a strand.
export const MAXK = 8, SLOTS = MAXK + 3, COLS = 2 * SLOTS + 1;
