// The impostor bake's second pass: a surface's world normal as its colour (the master stands at the origin
// unturned, so world is its own space), turned toward the camera on the side that is seen.
import bevy_pbr::render::forward_io::VertexOutput;

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
    var n = normalize(in.world_normal);
    if (!front) {
        n = -n;
    }
    return vec4<f32>(n * 0.5 + 0.5, 1.0);
}
