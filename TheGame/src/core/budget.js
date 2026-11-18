// The intent's requirements (Intents/0038-one-clean-architecture.md): what the game must meet, each with its unit and
// its source, the one place each lives (every reader imports it from here: the game and its tools).

/** The output: the most pixels the game's canvas has, for a player and for the gate alike (src/core/output.js): 1920 ×
    1080, or as many in a window of another shape (its shape kept; the browser lays the canvas on the screen). unit:
    pixels. source: Samuel, 2026-11-18 22:15, intent 0038's gate lowered from 4K ("we are happy to go down our 4K gate to
    just normal 1920, if that helps overall") */
export const OUTPUT = { width: 1920, height: 1080 };
