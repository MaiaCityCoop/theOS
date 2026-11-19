// The wind, shared by the main pass and the prepass, so a blade, its shadow and its motion move as one.
// A blade bends by the square of its height above the ground: the root stays, the tip swings. Gusts roll across the
// field as long waves along the wind's direction; each blade adds its own small flutter.

struct Wind {
    // x: the time, y: the time a frame ago (for motion vectors), z: the strength, w: unused
    params: vec4<f32>,
    // xyz: the eye; w: 1 for the close layer of fine blades, which sinks into the ground away from the eye
    eye: vec4<f32>,
    deep: vec4<f32>,
    light: vec4<f32>,
};

// The close layer: fine blades drawn only around the eye. From 4 to 9 m away they sink smoothly into the ground (each
// point by its height above it and 5 cm more), so the layer has no edge.
fn sink(world: vec3<f32>, w: Wind) -> vec3<f32> {
    if (w.eye.w < 0.5) {
        return world;
    }
    let d = distance(world.xz, w.eye.xz);
    let f = smoothstep(4.0, 9.0, d);
    let s = max(world.y - ground(world.xz), 0.0);
    return world - vec3<f32>(0.0, f * (s + 0.05), 0.0);
}

// The large shape of the land, as `terrain::big` in Rust: keep the two the same.
fn ground(p: vec2<f32>) -> f32 {
    return 22.0 * sin(0.0011 * p.x + 0.3) * cos(0.0013 * p.y + 1.7)
        + 9.0 * sin(0.0031 * p.x - 0.0024 * p.y + 0.9)
        + 4.0 * sin(0.0110 * p.x + 0.7) * cos(0.0093 * p.y - 1.1)
        + 2.5 * sin(0.0057 * p.x + 0.0043 * p.y + 2.0)
        + 0.45 * sin(0.071 * p.x - 0.052 * p.y + 0.3) * sin(0.048 * p.x + 0.083 * p.y + 1.9)
        + 0.25 * sin(0.15 * p.x + 0.11 * p.y + 4.0);
}

fn sway(world: vec3<f32>, time: f32, strength: f32) -> vec3<f32> {
    let dir = normalize(vec2<f32>(0.8, 0.6));
    let along = dot(world.xz, dir);
    // long gusts, then shorter ripples riding on them
    let gust = 0.5 + 0.5 * sin(along * 0.11 - time * 1.3) * sin(along * 0.037 - time * 0.45 + 1.7);
    let ripple = 0.5 + 0.5 * sin(along * 0.9 - time * 3.1 + world.x * 0.3);
    // a blade's own character, smooth across the few centimetres of one blade or one spikelet, so all its corners move
    // together
    let own = 0.5 + 0.5 * sin(world.x * 3.1 + world.z * 2.3) * cos(world.x * 1.7 - world.z * 2.9);
    // one frequency for all: a frequency that varies across the field, multiplied by the running clock, decorrelates
    // neighbouring points ever more as the app runs, and tore blades into triangles in strong wind
    let flutter = sin(time * 6.0 + own * 6.28) * 0.25;
    // the blade bends as an arc of constant curvature from its root, so it keeps its length: a point s up the blade
    // moves out by (1 - cos ks) / k and down to sin(ks) / k. The curvature, in radians per metre, grows with the wind.
    let k = max((0.15 + 1.1 * gust + 0.35 * ripple + flutter * own) * strength * (0.8 + 0.4 * own), 0.0) + 1e-4;
    let s = max(world.y - ground(world.xz), 0.0); // how far up the blade, above the land under it
    let a = min(k * s, 1.4); // never past lying flat
    let out = (1.0 - cos(a)) / k;
    let up = sin(a) / k - s;
    let side = vec2<f32>(-dir.y, dir.x) * flutter * 0.04 * strength * s;
    return vec3<f32>(dir.x * out + side.x, up, dir.y * out + side.y);
}

// ---- The GPU grass: every blade made here, each frame, from its cell on a grid fixed to the world ----
//
// A tile of the mesh holds 64 × 64 blade slots; each vertex carries its slot (the local x and z, in cells) and, in
// its UV, which side of the blade (−1, 0, +1) and how far up it (0 root, 1 tip). Tiles are laid in nested levels
// around the eye, each twice as coarse as the one inside it (their scale is the cell size). Here a slot becomes a
// blade: its place, its height, its lean, its colour, all from a hash of its cell, so it is the same blade every
// frame. Levels cross-fade blade by blade where they meet; past the last the grass thins away. Nothing is stored.

// The hash and value noise of `terrain.rs`, bit for bit, so the blades stand exactly on the land the CPU built.
fn thash(x: i32, z: i32, seed: u32) -> f32 {
    var h = (bitcast<u32>(x) * 0x8da6b343u) ^ (bitcast<u32>(z) * 0xd8163841u) ^ (seed * 0x9E3779B1u);
    h = h ^ (h >> 13u);
    h = h * 0x85ebca6bu;
    h = h ^ (h >> 16u);
    return f32(h >> 8u) / 16777216.0;
}

fn tnoise(p: vec2<f32>, cell: f32, seed: u32) -> f32 {
    let q = p / cell;
    let i = floor(q);
    let f = q - i;
    let s = f * f * (3.0 - 2.0 * f);
    let ix = i32(i.x);
    let iz = i32(i.y);
    let a = thash(ix, iz, seed) + (thash(ix + 1, iz, seed) - thash(ix, iz, seed)) * s.x;
    let b = thash(ix, iz + 1, seed) + (thash(ix + 1, iz + 1, seed) - thash(ix, iz + 1, seed)) * s.x;
    return a + (b - a) * s.y;
}

// `terrain::height`: the large shape and the small one.
fn land(p: vec2<f32>) -> f32 {
    let small = 0.10 * tnoise(p, 1.6, 1u) + 0.06 * tnoise(p, 0.55, 2u) + 0.025 * tnoise(p, 0.16, 3u);
    return ground(p) + small;
}

// `terrain::bare`: where the ground is bare, no grass grows.
fn bare(p: vec2<f32>) -> f32 {
    let n = tnoise(p, 16.0, 20u) * 0.65 + tnoise(p, 5.0, 21u) * 0.25 + tnoise(p, 1.5, 22u) * 0.10;
    return smoothstep(0.0, 1.0, clamp((n - 0.80) / 0.05, 0.0, 1.0));
}

// The finest level's cell, in metres (625 blades a square metre), and how far a level reaches, in its cells.
const FINE: f32 = 0.04;
const REACH: f32 = 110.0;

struct Blade {
    position: vec3<f32>,
    // where the same point was a frame ago (the wind of a frame ago), for the motion vectors
    previous: vec3<f32>,
    normal: vec3<f32>,
    colour: vec4<f32>,
};

fn blade(slot: vec3<f32>, side: f32, t: f32, w: Wind, time: f32, before: f32) -> Blade {
    var out: Blade;
    out.normal = vec3<f32>(0.0, 1.0, 0.0);
    out.colour = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    let s = max(slot.y, FINE); // the cell size, carried in the tile's scale (see `meadow.rs`)
    let level = u32(round(log2(s / FINE)));
    let ci = i32(floor(slot.x / s));
    let cj = i32(floor(slot.z / s));
    let seed = level * 64u;
    let p = vec2<f32>((f32(ci) + thash(ci, cj, seed + 1u)) * s, (f32(cj) + thash(ci, cj, seed + 2u)) * s);
    // which level shows the blade here: each fades out over the outer part of its reach while the next fades in,
    // blade by blade; the last thins away. Decided first and cheaply: most slots of a tile are not shown.
    let d = distance(p, w.eye.xz);
    let reach = REACH * s;
    var keep = 1.0 - smoothstep(0.7 * reach, reach, d);
    if (level == 4u) {
        keep = 1.0 - smoothstep(0.45 * reach, reach, d);
    }
    if (level > 0u) {
        keep = min(keep, smoothstep(0.35 * reach, 0.5 * reach, d));
    }
    if (thash(ci, cj, seed + 3u) >= keep) {
        out.position = vec3<f32>(p.x, -10000.0, p.y); // no area, nothing drawn
        out.previous = out.position;
        return out;
    }
    if (thash(ci, cj, seed + 4u) < bare(p)) {
        out.position = vec3<f32>(p.x, -10000.0, p.y);
        out.previous = out.position;
        return out;
    }
    let root = vec3<f32>(p.x, land(p), p.y);
    let lush = tnoise(p, 7.0, 40u);
    // a grazed meadow: 12 to 45 cm. Width: 3 to 8 mm, wider on coarser levels, and never under about a pixel at its
    // distance, or a far blade would flicker away between the pixels
    let height = w.deep.w + w.light.w * (0.67 * lush * lush + 0.33 * thash(ci, cj, seed + 5u));
    // coarser levels have a quarter of the blades each: twice as wide, and never under about a pixel and a half
    let width = max((0.0018 + 0.0022 * thash(ci, cj, seed + 6u)) * pow(2.0, f32(level)), 0.0011 * d);
    let yaw = thash(ci, cj, seed + 7u) * 6.2831853;
    let r8 = thash(ci, cj, seed + 8u);
    let lean = 0.12 + 0.55 * r8 * r8;
    let dir = vec3<f32>(cos(yaw), 0.0, sin(yaw));
    let across = vec3<f32>(-sin(yaw), 0.0, cos(yaw));
    var pos = root + dir * (lean * height * t * t) + vec3<f32>(0.0, height * (t - 0.35 * lean * t * t), 0.0);
    let wt = width * pow(1.0 - clamp((t - 0.45) / 0.55, 0.0, 1.0), 1.2);
    // a blade is a shallow V: its two halves meet at the midrib, which stands a little forward
    pos = pos + across * wt * side + dir * wt * 0.35 * (1.0 - abs(side));
    out.position = pos + sway(pos, time, w.params.z);
    out.previous = pos + sway(pos, before, w.params.z);
    // from about 8 m on, a blade melts into the sward: its colour toward the sward's green and its normal toward
    // the sky, so the field far off reads as one carpet and not as pale specks catching the light
    let far = smoothstep(8.0, 45.0, d);
    // the face's normal: the blade spans `across` and its length, so it faces along `dir`, tilted back as the blade
    // leans; each half of the V turned a little outward. (It had been `across`, a direction in the blade's own
    // plane: lit wrongly, and at grazing angles it mirrored the sky as white streaks.)
    var face = normalize(dir * (1.0 - lean * t) + vec3<f32>(0.0, 0.45 + lean * t, 0.0) + across * side * 0.45);
    // the side that is seen faces the eye (the material is not double-sided: Bevy would turn the back's normal down,
    // and a downward normal mirrors the sky as white streaks)
    let toward = w.eye.xyz - pos;
    if (dot(vec3<f32>(dir.x, 0.0, dir.z), toward) < 0.0) {
        face = normalize(vec3<f32>(-face.x, face.y, -face.z));
    }
    // and never nearly edge-on to the eye: at a grazing angle even a rough blade mirrors the bright sky, and that
    // flickered as white stipples along one half of the blades
    let v = normalize(toward);
    let facing = dot(face, v);
    if (facing < 0.4) {
        face = normalize(face + v * (0.4 - facing) * 1.5);
    }
    out.normal = normalize(mix(face, vec3<f32>(0.0, 1.0, 0.0), far));
    // each blade its own green, from deep to light yellow-green; a little straw where the field is dry
    let green = mix(w.deep.rgb, w.light.rgb, thash(ci, cj, seed + 9u));
    let dry = lush * 0.6; // one noise for both: drier where the sward is thinner
    let tip = mix(green, vec3<f32>(0.30, 0.24, 0.10), min(dry * dry * 0.35 * thash(ci, cj, seed + 10u), 0.2))
        * (0.95 + 0.3 * thash(ci, cj, seed + 11u));
    let light = tip * vec3<f32>(1.15, 1.12, 0.95);
    let rootc = tip * 0.28;
    var c = mix(tip, light, (t - 0.5) / 0.5);
    if (t < 0.5) {
        c = mix(rootc, tip, pow(t / 0.5, 0.8));
    }
    c = mix(c, vec3<f32>(0.20, 0.17, 0.08), smoothstep(0.85, 1.0, t) * 0.35 * thash(ci, cj, seed + 13u));
    c = c * (1.0 + 0.12 * (1.0 - abs(side)));
    c = mix(c, vec3<f32>(0.060, 0.140, 0.024) * (0.75 + 0.35 * t), far);
    out.colour = vec4<f32>(c, 1.0);
    return out;
}

// A GPU grass vertex's slot, side and height up its blade, from its world position (see `grass::tile`).
fn slot_of(world: vec3<f32>, s: f32) -> vec4<f32> {
    let side = round((fract(world.x / s) - 0.5) * 4.0);
    return vec4<f32>(world.x, s, world.z, side);
}
