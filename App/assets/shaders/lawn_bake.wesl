// The lawn's bake (`src/lawn.rs`): each blade point is carried up along the view direction f to the plane of the
// blade tips (height TOP); that is where the view stores it. Its depth is its height, so where several lie on one
// line the highest, the first the eye meets, is kept. Written straight to clip space over the tile [-0.5, 0.5]².
import bevy_pbr::render::forward_io::{Vertex, VertexOutput, decompress_vertex};

struct Params {
    v: vec4<f32>,
};

@group(constants::MATERIAL_BIND_GROUP) @binding(0) var<uniform> params: Params;

@vertex
fn vertex(v: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let vx = decompress_vertex(v, v.instance_index);
    let p = vx.position;
    let top = params.v.w;
    let at = p.xz + params.v.xy * (top - p.y);
    let depth = 0.02 + 0.96 * clamp(p.y / top, 0.0, 1.0); // reverse depth: the higher, the nearer
    out.position = vec4<f32>(at.x * 2.0, -at.y * 2.0, depth, 1.0);
    out.world_position = vec4<f32>(p, 1.0);
    out.world_normal = vx.normal;
@if(VERTEX_COLORS)
    out.color = vx.color;
    return out;
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
    if (params.v.z < 0.5) {
        var c = vec3<f32>(0.1, 0.2, 0.05);
@if(VERTEX_COLORS)
        c = in.color.rgb;
        return vec4<f32>(c, 1.0);
    }
    var n = normalize(in.world_normal);
    if (!front) {
        n = -n;
    }
    return vec4<f32>(clamp(in.world_position.y / params.v.w, 0.0, 1.0), n.x * 0.5 + 0.5, n.z * 0.5 + 0.5, 1.0);
}
