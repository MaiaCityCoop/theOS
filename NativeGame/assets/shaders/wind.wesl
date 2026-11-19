// The wind, shared by the main pass and the prepass, so a blade, its shadow and its motion move as one.
// A blade bends by the square of its height above the ground: the root stays, the tip swings. Gusts roll across the
// field as long waves along the wind's direction; each blade adds its own small flutter.

struct Wind {
    // x: the time, y: the time a frame ago (for motion vectors), z: the strength, w: unused
    params: vec4<f32>,
};

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
    let flutter = sin(time * (5.0 + 3.0 * own) + own * 6.28) * 0.25;
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
