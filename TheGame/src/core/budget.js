// The intent's requirements (Intents/0038-one-clean-architecture.md): what the game must meet, each with its unit and
// its source, the one place they live (every reader imports them from here). Not settings and not physics. B's #95 keeps
// the whole of them (the hard gates, the output, the memory by class) and these with them.

/** The 12 ms a frame shared out by the frame's classes: what a class's passes may take, the gate's ceilings start from
    it (tools/gate/ceilings.js). The upscale's is its floor: its bytes alone at a 4K output took about 1.9 ms (#86).
    'other', a pass no class names, is the slack. unit: ms. source: Intents/0038, Build (the bench pass by pass; the
    budget's parts as a merge rule) */
export const FRAME_MS_BY_CLASS = { geometry: 5, light: 3, ground: 1.5, 'upscale/post': 2, other: 0.5 };
