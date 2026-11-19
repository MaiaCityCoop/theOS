// The wind, shared by the main pass and the prepass, so a blade, its shadow and its motion move as one.
// A blade bends by the square of its height above the ground: the root stays, the tip swings. Gusts roll across the
// field as long waves along the wind's direction; each blade adds its own small flutter.

struct Wind {
    // x: the time, y: the time a frame ago (for motion vectors), z: the strength, w: unused
    params: vec4<f32>,
};

fn sway(world: vec3<f32>, time: f32, strength: f32) -> vec3<f32> {
    let dir = normalize(vec2<f32>(0.8, 0.6));
    let along = dot(world.xz, dir);
    // long gusts, then shorter ripples riding on them
    let gust = 0.5 + 0.5 * sin(along * 0.11 - time * 1.3) * sin(along * 0.037 - time * 0.45 + 1.7);
    let ripple = 0.5 + 0.5 * sin(along * 0.9 - time * 3.1 + world.x * 0.3);
    // a blade's own character, smooth across the few centimetres of one blade or one spikelet, so all its corners move
    // together (a hash per small cell blew the corners of one spikelet apart into big flat triangles)
    let own = 0.5 + 0.5 * sin(world.x * 3.1 + world.z * 2.3) * cos(world.x * 1.7 - world.z * 2.9);
    let flutter = sin(time * (5.0 + 3.0 * own) + own * 6.28) * 0.05 * strength;
    let bend = (0.05 + 0.22 * gust + 0.07 * ripple) * strength;
    let h = max(world.y, 0.0);
    let reach = h * h * (0.9 + 0.4 * own);
    let push = dir * bend * reach + vec2<f32>(-dir.y, dir.x) * flutter * reach;
    // the blade bows: as the tip moves out it sinks a little, keeping its length roughly
    let sink = 0.35 * dot(push, push) / max(h, 0.05);
    return vec3<f32>(push.x, -sink, push.y);
}
