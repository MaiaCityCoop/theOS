# TheGame

Maia City, the game: one endless procedural land, drawn at 60 fps in a browser, and a virtual film camera to
shoot it with. `bun run dev` in this folder, then http://localhost:5173.

- `/` walk the world (click, W A S D, Shift runs, F flies)
- `/timeline.html` a kept film of camera moves, played live in the world; `?story=<id>` plays an intent's story (`../Stories/<id>/timeline.json`) with its captions
- `/lenses.html` the lens bench: the live world through each lens of the kit
- `/callback` the way back from aven.id after signing in (`callback.html`; see Signing in, below)

Work on it is tracked as intents (`../Intents/`). `LENS-REVIEW.md` is what is still wrong in the
picture and the plan against it. `cine/README.md` is the virtual camera's manual.

## How the source is laid out

Each folder has one job. A new thing goes where its job is; nothing reaches across except through
the files named here.

| Folder | Its job | Extend it by |
| --- | --- | --- |
| `materials/`, `biomes/`, `assets/` | The recipes: every texture, every kind of land, every made thing, one file each, found by the registry (`src/core/registry.js`) by its `uid`. `assets/kinds.js`: what an asset gets from its kind. `assets/kit/tree.js`: what every tree file builds with. | a new file (see Plug-ins below) |
| `world/` | The world's data: where the named places are (`places.js`), the clock (`clock.js`: the date, the hour the game opens at, how fast a day runs; the one place the world's time is set), the sky's light (`sky.js`), each weather condition's numbers (`clouds.js`, `wind.js`, `snowfall.js`). | a number changed, a place added |
| `src/world/` | The land as functions of a place: height, river, what grows where. Once in JS (`land.js`, for feet and cameras) and once as node code (`land.nodes.js`, for the GPU), constant for constant. `light.js`: the shading contract every material reads (sun, sky light, the air, the weather, shadows, the hand-over between levels). `sky.js` the hour's light and the dome, its bodies in `sky/`; `weather/` the conditions; `shadow.js` the shadow map; `place.js` stands a made thing; `solids.js`, `trunks.js` what can't be walked through. | a new field of the land: a function in both land files |
| `src/core/` | What everything shares: the registry (`registry.js`), the uniforms (`uniforms.js`, node uniforms every material reads), the frustum (`frustum.js`), the governor (`governor.js`: 60 fps is the gate; late frames in, detail and pixels out), the readout (`hud.js`). | a new shared uniform |
| `src/materials/` | The world's textures, painted once at start by the GPU into texture arrays, a layer a material, and packed there into compressed blocks (`bake.js`), with the tiling noises the painters use (`paint.js`); the library's previews (`preview.js`). | a new material: a file in `materials/` |
| `src/terrain/` | The ground and the water: a quadtree of one shared tile (`terrain.js`), their materials (`material.js`, `water.js`). | a biome's own fields; a new ground layer in `material.js` |
| `src/scatter/` | What stands on the land: every asset placed `at: 'scatter'`, placed by its engine (`grass.js`, `rocks.js`, `trees.js`; `index.js` finds them). `tier.js` draws a tier as instanced calls over the patches the view touches, packed by a compute pass; `drawer.js` is the one drawer (the heap of every kind's meshes at every level, one shader): the rocks are drawn by it, an engine saying only where they lie; `view.js` drops what stands outside the view; `ground.js` is the map of the ground the tiers read. | a new plant, rock or tree: a file in `assets/`; a new sort of thing: an engine module here |
| `src/detail/` | Levels of detail by size on screen (`index.js`), and far cards (`impostor.js`). | an asset's own `detail` block |
| `src/camera/` | The one camera (`rig.js`), the walker (`walk.js`), touch (`touch.js`), and the lens (`post.js`: depth of field and the glass, two stages of the one way to the screen, `src/core/screen.js`). | a new stage of the lens |
| `src/city/` | The city's plots over the land, seen from above (intent 0009): the plan on the real land (`plan.js`, run in `plan.worker.js`), drawn and picked (`index.js`), a village's card (`card.js`). Its numbers in `world/city.js`. | a number in `world/city.js` |
| `src/account/` | Signing in with aven.id, and who is signed in (intent 0016): the numbers (`config.js`: the issuer, the client, the redirect, how long a session lasts), the protocol and the ID token's check (`oidc.js`, nothing of the page in it: `tools/account-check.js` runs it under bun), what is kept in the tab (`session.js`), the pill at the top right (`index.js`, loaded by its own script: it neither waits for the world nor holds it up), the way back (`callback.js`). Nothing else reads it but through `session()`. | a number in `config.js` |
| `cine/` | The virtual camera, outside the game: it needs only `window.__game.camera` and `src/world/land.js`. Lenses, timelines, the composer, the bench. | see `cine/README.md` |

Drawn by three's `WebGPURenderer` (WebGL 2 where WebGPU is missing; `?webgl` forces it). Every material is node
code (TSL, `three/tsl`): three writes WGSL for WebGPU and GLSL for the fallback from the same nodes. There is no
hand-written shader text in the game.

`src/main.js` only wires these and runs the frame: place the camera, let the governor name the
detail, choose what to draw (ground map, terrain nodes, scatter patches), draw.

## Signing in

The game signs people in with **aven.id** (OpenID Connect; the person signs in there with a passkey). It is a public
client, `maia-city`, using the authorization code with PKCE (S256), all of it in the browser, WebCrypto and fetch only:

1. A click on *Sign in with aven.id* (top right) reads aven.id's description (`/.well-known/openid-configuration`; its
   `issuer` must be exactly the one asked for), makes a state, a nonce and a PKCE verifier (32 random bytes each), keeps
   them and the path the person is on in `sessionStorage` for the round trip only, and sends the tab to aven.id's
   `authorization_endpoint` (`response_type=code`, `scope=openid profile email roles`, the S256 challenge). Inside the
   dashboard the whole tab goes, not the frame, and comes back to the dashboard.
2. aven.id sends the person back to the redirect URI, `<origin><base>callback` (`https://maia.city/callback`;
   `/game/callback` inside the dashboard), `callback.html`. It checks the state, takes an `error` as a refusal,
   exchanges the code at the `token_endpoint` (a form POST with the verifier, no secret), and clears the round trip.
3. The ID token is checked here before anything in it is believed (`oidc.js`, `verifyIdToken`): the header's `alg`
   must be `ES256` (anything else, `none` too, is refused); the key is the issuer's (`jwks_uri`) EC P-256 key named
   by `kid`; the signature (r and s side by side, 64 bytes, as JWS and WebCrypto both write it) must hold; then `iss`,
   `aud` (the game, and `azp` the game where there are several or `azp` is given), `exp` and `iat` within a minute
   (and issued in the last ten), the nonce, a `sub`, and `amr` must include `passkey`.
4. What is kept: `{ sub, email, name, roles, issuer, expiresAt }` in `sessionStorage` (`maia.account`), never the
   tokens; then back to where the person started (a path on this origin only; anything else goes to the game).

**The two roles.** Every aven.id account is a **traveler** (free). A paid aven.id subscription makes a **citizen**
(later, citizens reach an MCP server). aven.id says which in the ID token as `aven_roles` (`["traveler"]` or
`["traveler", "citizen"]`) when the scope `roles` is asked for; that claim is not there yet, and where it is missing
the person is a traveler. A traveler's card links to their aven.id account to become a citizen (`<issuer>/`).

**Browser-only.** The game runs in the person's own browser, so the role decides only what the game *shows*: anyone
can change what their browser believes. Nothing that must really hold may rest on it: the MCP server, and anything
else that matters, checks the person's own token on its own server.

**How long.** A session lasts 12 hours, or until the tab is closed, not the ID token's 5 minutes: the game keeps no
token to show anyone, only who signed in, and that decides only what it shows; a day's play should not ask for the
passkey again. A role changed at aven.id shows at the next sign-in. *Sign out* forgets the session in this tab
(aven.id has no end-session endpoint; the person's sign-in at aven.id itself stays as it is).

**Config** (`src/account/config.js`, the one place): the issuer is `https://aven.id`; another (next, or aven-dotnet
running here) by `VITE_AVEN_ISSUER` at build time, or by `?issuer=<url>` in the address, taken only when the game is
served from this machine (https, or http for an issuer on this machine). The client `maia-city` must be registered at
the issuer with each redirect URI it is used from (`https://maia.city/callback`; for development
`http://localhost:5173/callback` and `http://localhost:5180/game/callback`), and aven.id must answer the discovery,
the keys and the token endpoint to this origin (CORS). The host serving the built game must answer `/callback` with
`callback.html` (the dev server does).

**When it does not work** it says so plainly on the pill's card (couldn't reach aven.id, refused, could not be
checked) and the game plays on; when aven.id cannot be reached at all, the game is as it was without it.

`bun tools/account-check.js` checks the reckoning: PKCE (RFC 7636's own example), reading a token, ES256 against a key
made there and every way a token must be refused, the roles, the way back.

## Plug-ins: a new thing is a new file

Every moving piece is found by itself (a glob, never a list kept by hand) and speaks through one interface. Nothing
below needs an edit to an engine's code.

| A new… | Is | Its interface is written in |
| --- | --- | --- |
| material | a file in `materials/`: `{ uid, type: 'material', paint(uv) -> { h, col, rough }, … }`; a `role` (`'noise'`, `'billows'`, `'rock'`, `'moss'`) if it plays a part the engine asks for by name | `materials/README.md` |
| biome | a file in `biomes/`: where it lies (`where`, node code), its floor, its grass, its stones, its far canopy | `biomes/README.md` |
| made thing | a file in `assets/`: its size, its levels of detail, where it is placed; what it leaves out its kind gives (`assets/kinds.js`: `kindOf`, `kindRule`) | `assets/index.js` |
| tree | a file in `assets/` built with the tree kit: its growth by age (`growth: { years, form, height }`), `grow` (with the kit's `crown()` for limbs and foliage), `shade`, two materials (its bark, a sprig of its leaves), its `litter` (the ground under it where it leads); its two farthest levels the kit makes by itself; its `placement` says its biome, whose stand it joins (`trees` in the biome's file: cells, groves, ages), its share of that stand, its seed. The stone pine and the holm oak are the two to copy from | `assets/kit/tree.js` |
| sort of scattered thing | a module in `src/scatter/` exporting `engine = { id, row, create, thumb, stage, frame }` | `src/scatter/index.js` |
| shrub | a file in `assets/` of kind `shrub`, built with the tree kit's `mound()`: its shapes, two levels of its own (the kit makes its farthest), its sprig (its own material, or another plant's with a `foliage.tint`); `placement.stand: 'shrubs'` puts it in its biome's understory (`shrubs` in the biome's file) | `assets/mastic.js`, `assets/kit/tree.js` |
| weather condition | a file in `src/world/weather/`: its value on the panel, kept, filmed per shot; what it adds to the shared lanes (`wet`, `fog`, `dim`); what it does to a surface (`surface`), draws into the sky (`sky`), lays in the air between the eye and a point (`air`: the clouds, seen from above), draws before the frame (`before`) | `src/world/weather/index.js` |
| body in the sky | a file in `src/world/sky/`: `{ id, order, draw({ v, y, s, col, D }), update? }` | `src/world/sky.js` |
| named place | a line in `world/places.js`: an asset's uid, where it stands | `world/places.js` |

The light's contract (`src/world/light.js`) is the one door for materials: a material asks it for the sun, the sky's
light, the air, the shadows and the weather (`weathered`, `weatherOn`, and each condition's own nodes handed on:
`snowDepth`, `windAt`, `cloudShade`), and never reads a condition's uniform by name.

## The one law of detail

Every range of detail is written in metres as the walker's 68° lens sees them. A longer lens
shows a thing larger; the governor turns that into a factor (`detail ×` in the readout) and every
range is stretched by it: terrain levels, blade tiers, rock tiers, the ground map's reach. So a
thing is drawn at the detail its size in the picture asks for, whatever the lens. The factor is
capped by the frame's budget: the readout shows `×2.4 of ×9.1` when the lens asks for more than
the frame can pay.
