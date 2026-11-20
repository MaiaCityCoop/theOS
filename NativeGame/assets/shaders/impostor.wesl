// A far copy of a baked master (`src/impostor.rs`): one quad that turns to face the eye, showing the atlas frame
// nearest the eye's direction in the copy's own space, lit with the baked normals like any surface.
import bevy_pbr::render::{
    mesh_functions,
    forward_io::{Vertex, VertexOutput, FragmentOutput},
    view_transformations::position_world_to_clip,
    mesh_view_bindings::view,
    pbr_types,
    pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing, calculate_view},
};

struct Params {
    sphere: vec4<f32>,
    grid: vec4<f32>,
};

@group(constants::MATERIAL_BIND_GROUP) @binding(0) var<uniform> params: Params;
@group(constants::MATERIAL_BIND_GROUP) @binding(1) var albedo_tex: texture_2d<f32>;
@group(constants::MATERIAL_BIND_GROUP) @binding(2) var albedo_smp: sampler;
@group(constants::MATERIAL_BIND_GROUP) @binding(3) var normal_tex: texture_2d<f32>;
@group(constants::MATERIAL_BIND_GROUP) @binding(4) var normal_smp: sampler;

fn frame_dir(i: f32, j: f32, n: f32) -> vec3<f32> {
    let u = (i + 0.5) / n * 2.0 - 1.0;
    let v = (j + 0.5) / n * 2.0 - 1.0;
    let x = (u + v) * 0.5;
    let z = (u - v) * 0.5;
    return normalize(vec3<f32>(x, 1.0 - abs(x) - abs(z), z));
}

fn frame_up(f: vec3<f32>) -> vec3<f32> {
    if (abs(f.y) > 0.999) {
        return vec3<f32>(0.0, 0.0, -1.0);
    }
    return vec3<f32>(0.0, 1.0, 0.0);
}

@vertex
fn vertex(v: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh_functions::get_world_from_local(v.instance_index);
    let m3 = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
    let scale = length(model[0].xyz);
    let centre = (model * vec4<f32>(params.sphere.xyz, 1.0)).xyz;
    // the eye's direction in the copy's own space (its turn undone), kept on the upper hemisphere
    var d = normalize(transpose(m3) * (view.world_position - centre));
    d.y = max(d.y, 0.0);
    d = normalize(d + vec3<f32>(0.0, 1e-4, 0.0));
    // the nearest frame: encode the direction on the hemi-octahedral grid
    let n = params.grid.x;
    let o = d.xz / (abs(d.x) + abs(d.y) + abs(d.z));
    let uv = vec2<f32>(o.x + o.y, o.x - o.y);
    let i = clamp(floor((uv.x * 0.5 + 0.5) * n), 0.0, n - 1.0);
    let j = clamp(floor((uv.y * 0.5 + 0.5) * n), 0.0, n - 1.0);
    let f = frame_dir(i, j, n);
    // the quad in that frame's plane, as the baking camera saw it
    let right = normalize(cross(frame_up(f), f));
    let up = cross(f, right);
    let corner = v.position.xy; // in [-1, 1]
    let local = params.sphere.xyz + (right * corner.x + up * corner.y) * params.sphere.w;
    let world = model * vec4<f32>(local, 1.0);
    out.world_position = world;
    out.position = position_world_to_clip(world.xyz);
    // the frame's axes in the world: the fragment turns the baked normals (in the master's own space) with the copy
    out.world_normal = normalize(m3 * f);
@if(VERTEX_TANGENTS)
    out.world_tangent = vec4<f32>(normalize(m3 * right), 1.0);
@if(VERTEX_UVS_A)
    out.uv = vec2<f32>((i + corner.x * 0.5 + 0.5) / n, (j + 0.5 - corner.y * 0.5) / n);
    return out;
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) front: bool) -> FragmentOutput {
    var out: FragmentOutput;
    var uv = vec2<f32>(0.0);
@if(VERTEX_UVS_A)
    uv = in.uv;
    let a = textureSample(albedo_tex, albedo_smp, uv);
    if (a.a < 0.5) {
        discard;
    }
    // the baked normal is in the master's own space: written in the frame's axes there (right, up, toward the eye)
    // and rebuilt from the same axes in the world, so the copy's light turns with it
    let local = textureSample(normal_tex, normal_smp, uv).xyz * 2.0 - 1.0;
    var nb = local;
@if(VERTEX_TANGENTS)
    {
        let f = frame_dir(floor(uv.x * params.grid.x), floor(uv.y * params.grid.x), params.grid.x);
        let right = normalize(cross(frame_up(f), f));
        let up = cross(f, right);
        let n_w = normalize(in.world_normal);
        let r_w = normalize(in.world_tangent.xyz);
        let u_w = cross(n_w, r_w);
        nb = r_w * dot(local, right) + u_w * dot(local, up) + n_w * dot(local, f);
    }
    var pbr = pbr_types::pbr_input_new();
    pbr.material.base_color = vec4<f32>(a.rgb, 1.0);
    pbr.material.perceptual_roughness = 0.85;
    pbr.material.reflectance = vec3<f32>(0.1);
    pbr.frag_coord = in.position;
    pbr.world_position = in.world_position;
    pbr.world_normal = normalize(nb);
    pbr.N = normalize(nb);
    pbr.V = calculate_view(in.world_position, false);
    out.color = apply_pbr_lighting(pbr);
    out.color = main_pass_post_lighting_processing(pbr, out.color);
    return out;
}
