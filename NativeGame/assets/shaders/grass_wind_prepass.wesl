// The grass's prepass vertex shader (depth, normals, motion, the sun's shadow): Bevy's own, with the same wind, and
// where the blade was a frame ago, so the anti-aliasing follows it.
import bevy_pbr::{
    prepass::io::{Vertex, VertexOutput, decompress_vertex},
    render::{
        mesh_functions,
        view_transformations::position_world_to_clip,
    },
};
import super::wind::{Wind, Blade, sway, sink, blade};

@group(constants::MATERIAL_BIND_GROUP) @binding(100) var<uniform> wind: Wind;

@vertex
fn vertex(v: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let vertex = decompress_vertex(v, v.instance_index);
    let world_from_local = mesh_functions::get_world_from_local(v.instance_index);
    let rest = mesh_functions::mesh_position_local_to_world(world_from_local, vec4<f32>(vertex.position, 1.0));
    let made = wind.eye.w > 1.5;
    var side = 0.0;
    var up = 0.0;
@if(VERTEX_UVS_A) {
    side = vertex.uv.x;
    up = vertex.uv.y;
}
    var b: Blade;
    if (made) {
        let slot = vec3<f32>(rest.x, length(world_from_local[0].xyz), rest.z);
        b = blade(slot, side, up, wind, wind.params.x);
        out.world_position = vec4<f32>(b.position, 1.0);
    } else {
        let sunk = sink(rest.xyz, wind);
        out.world_position = vec4<f32>(sunk + sway(sunk, wind.params.x, wind.params.z), 1.0);
    }
    out.position = position_world_to_clip(out.world_position.xyz);
@if(UNCLIPPED_DEPTH_ORTHO_EMULATION) {
    out.unclipped_depth = out.position.z;
    out.position.z = min(out.position.z, 1.0);
}
@if(VERTEX_UVS_A)
    out.uv = vertex.uv;
@if(VERTEX_UVS_B)
    out.uv_b = vertex.uv_b;
@if(NORMAL_PREPASS_OR_DEFERRED_PREPASS) {
@if(VERTEX_NORMALS)
{
    out.world_normal = mesh_functions::mesh_normal_local_to_world(vertex.normal, v.instance_index);
    if (made) {
        out.world_normal = b.normal;
    }
}
@if(VERTEX_TANGENTS)
    out.world_tangent = mesh_functions::mesh_tangent_local_to_world(world_from_local, vertex.tangent, v.instance_index);
}
@if(VERTEX_COLORS)
    out.color = vertex.color;
@if(MOTION_VECTOR_PREPASS) {
    let prev_model = mesh_functions::get_previous_world_from_local(v.instance_index);
    let prev = mesh_functions::mesh_position_local_to_world(prev_model, vec4<f32>(vertex.position, 1.0));
    if (made) {
        // where the same blade was a frame ago: the same cell, the wind of a frame ago
        let slot = vec3<f32>(rest.x, length(world_from_local[0].xyz), rest.z);
        out.previous_world_position = vec4<f32>(blade(slot, side, up, wind, wind.params.y).position, 1.0);
    } else {
        let prev_sunk = sink(prev.xyz, wind);
        out.previous_world_position = vec4<f32>(prev_sunk + sway(prev_sunk, wind.params.y, wind.params.z), 1.0);
    }
}
@if(VERTEX_OUTPUT_INSTANCE_INDEX)
    out.instance_index = v.instance_index;
@if(VISIBILITY_RANGE_DITHER)
    out.visibility_range_dither = mesh_functions::get_visibility_range_dither_level(v.instance_index, world_from_local[3]);
    return out;
}
