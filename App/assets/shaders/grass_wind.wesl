// The grass's main-pass vertex shader: Bevy's own, with the wind added in world space.
import bevy_pbr::render::{
    mesh_functions,
    forward_io::{Vertex, VertexOutput, decompress_vertex},
    view_transformations::position_world_to_clip,
};
import package::wind::{Wind, Blade, sway, sink, blade, slot_of};

@group(constants::MATERIAL_BIND_GROUP) @binding(100) var<uniform> wind: Wind;

@vertex
fn vertex(v: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let vertex = decompress_vertex(v, v.instance_index);
    let world_from_local = mesh_functions::get_world_from_local(v.instance_index);
    var world = mesh_functions::mesh_position_local_to_world(world_from_local, vec4<f32>(vertex.position, 1.0));
    let made = wind.eye.w > 1.5;
    var b: Blade;
    if (made) {
        // the GPU grass: the slot's world place, with the tile's cell size in y
        let at = slot_of(world.xyz, length(world_from_local[0].xyz));
        b = blade(at.xyz, at.w, world.y, wind, wind.params.x, wind.params.y);
        world = vec4<f32>(b.position, 1.0);
    } else {
        let sunk = sink(world.xyz, wind);
        world = vec4<f32>(sunk + sway(sunk, wind.params.x, wind.params.z), 1.0);
    }
    out.world_position = world;
    out.position = position_world_to_clip(world.xyz);
@if(VERTEX_NORMALS) {
    out.world_normal = mesh_functions::mesh_normal_local_to_world(vertex.normal, v.instance_index);
    if (made) {
        out.world_normal = b.normal;
    }
}
@if(VERTEX_UVS_A)
    out.uv = vertex.uv;
@if(VERTEX_UVS_B)
    out.uv_b = vertex.uv_b;
@if(VERTEX_TANGENTS)
    out.world_tangent = mesh_functions::mesh_tangent_local_to_world(world_from_local, vertex.tangent, v.instance_index);
@if(VERTEX_COLORS) {
    out.color = vertex.color;
    if (made) {
        out.color = b.colour;
    }
}
@if(VERTEX_OUTPUT_INSTANCE_INDEX)
    out.instance_index = v.instance_index;
@if(VISIBILITY_RANGE_DITHER)
    out.visibility_range_dither = mesh_functions::get_visibility_range_dither_level(v.instance_index, world_from_local[3]);
    return out;
}
