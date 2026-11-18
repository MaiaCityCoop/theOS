// The library's requirements (intent 0044): what its card is held to. tools/words.js checks them.

/** How long what the library's card says of a thing may be: a recipe's description (`about`), a biome's `laid`, a
    material's `usedBy`, and the words of a variant (a move, a layer, an expression). unit: letters. source: intent 0044
    (Samuel, 2026-11-18: the card's prose and labels "way more compact"): the card is 236 px wide (brand.css --side-w),
    a description two or three of its lines, the others one. */
export const WORDS = { about: 80, laid: 40, usedBy: 40, variant: 40 };
