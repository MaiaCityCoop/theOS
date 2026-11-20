// The meadow's mid and far sward as baked patches (`src/patches.rs`): every slot of a tile is one square-metre patch
// of real blades, seen through its baked views (the grass patch asset's impostor). The GPU places each from a hash of
// its world cell (place, turn, size), stands it on the land, picks the view nearest the eye and turns the quad to it.
// Patches dissolve in one by one past the real blades, and out into the carpet at the far end. Nothing is stored.
import bevy_pbr::render::{
    mesh_functions,
    forward_io::{Vertex, VertexOutput, FragmentOutput},
    view_transformations::position_world_to_clip,
    mesh_view_bindings::view,
    pbr_types,
    pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing, calculate_view},
};
import package::wind::{thash, land, bare};

struct Params {
    // xyz: the master's centre, w: the radius of its sphere
    sphere: vec4<f32>,
    // x: frames along a side, y: where the patches begin (m), z: where the last level ends (m)
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

fn turn(v: vec3<f32>, c: f32, s: f32) -> vec3<f32> {
    return vec3<f32>(c * v.x - s * v.z, v.y, s * v.x + c * v.z);
}

@vertex
fn vertex(v: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh_functions::get_world_from_local(v.instance_index);
    let world = (model * vec4<f32>(v.position, 1.0)).xyz;
    let s = length(model[0].xyz); // the level's cell, carried in the tile's scale
    let level = u32(round(log2(max(s, 1.0))));
    let ci = i32(floor(world.x / s));
    let cj = i32(floor(world.z / s));
    let seed = 700u + level * 16u;
    let p = vec2<f32>((f32(ci) + thash(ci, cj, seed + 1u)) * s, (f32(cj) + thash(ci, cj, seed + 2u)) * s);
    let eye = view.world_position;
    let d = distance(p, eye.xz);
    // where this level shows a patch: past the real blades for the first, after the level before for the others;
    // patch by patch (a dissolve), so no edge shows
    let begin = select(params.grid.y * s, params.grid.y, level == 0u);
    let reach = 64.0 * s;
    var keep = smoothstep(begin, begin + 3.0 * s, d) * (1.0 - smoothstep(0.75 * reach, reach, d));
    if (level > 0u) {
        keep = min(keep, 1.0);
    }
    let r3 = thash(ci, cj, seed + 3u);
    var corner = vec2<f32>(0.0);
@if(VERTEX_UVS_A)
    corner = v.uv * 2.0 - 1.0;
    if (r3 >= keep || thash(ci, cj, seed + 4u) < bare(p)) {
        out.position = vec4<f32>(0.0, 0.0, -2.0, 1.0); // behind the far plane: nothing drawn
        out.world_position = vec4<f32>(0.0);
        out.world_normal = vec3<f32>(0.0, 1.0, 0.0);
        return out;
    }
    let yaw = thash(ci, cj, seed + 5u) * 6.2831853;
    let c = cos(yaw);
    let sn = sin(yaw);
    let size = s * (0.85 + 0.3 * thash(ci, cj, seed + 6u));
    let base = vec3<f32>(p.x, land(p), p.y);
    let centre = base + turn(params.sphere.xyz, c, sn) * size;
    // the eye's direction in the patch's own space, on the upper hemisphere
    var dl = turn(normalize(eye - centre), c, -sn);
    dl.y = max(dl.y, 0.0);
    dl = normalize(dl + vec3<f32>(0.0, 1e-4, 0.0));
    let n = params.grid.x;
    let o = dl.xz / (abs(dl.x) + abs(dl.y) + abs(dl.z));
    let uv = vec2<f32>(o.x + o.y, o.x - o.y);
    let i = clamp(floor((uv.x * 0.5 + 0.5) * n), 0.0, n - 1.0);
    let j = clamp(floor((uv.y * 0.5 + 0.5) * n), 0.0, n - 1.0);
    let f = frame_dir(i, j, n);
    let right = normalize(cross(frame_up(f), f));
    let up = cross(f, right);
    let local = params.sphere.xyz + (right * corner.x + up * corner.y) * params.sphere.w;
    let w = base + turn(local, c, sn) * size;
    out.world_position = vec4<f32>(w, 1.0);
    out.position = position_world_to_clip(w);
    // the patch's turn rides in the normal, for the fragment to turn the baked normals into the world
    out.world_normal = vec3<f32>(c, sn, 0.0);
@if(VERTEX_UVS_A)
    out.uv = vec2<f32>((i + corner.x * 0.5 + 0.5) / n, (j + 0.5 - corner.y * 0.5) / n);
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> FragmentOutput {
    var out: FragmentOutput;
    var uv = vec2<f32>(0.0);
@if(VERTEX_UVS_A)
    uv = in.uv;
    let a = textureSample(albedo_tex, albedo_smp, uv);
    if (a.a < 0.5) {
        discard;
    }
    let nb = textureSample(normal_tex, normal_smp, uv).xyz * 2.0 - 1.0;
    // a patch is many blades facing every way: its light is mostly that of the sky above, a little of each blade
    let nw = normalize(mix(turn(nb, in.world_normal.x, in.world_normal.y), vec3<f32>(0.0, 1.0, 0.0), 0.6));
    var pbr = pbr_types::pbr_input_new();
    pbr.material.base_color = vec4<f32>(a.rgb, 1.0);
    pbr.material.perceptual_roughness = 0.85;
    pbr.material.reflectance = vec3<f32>(0.05);
    pbr.material.diffuse_transmission = 0.5;
    pbr.frag_coord = in.position;
    pbr.world_position = in.world_position;
    pbr.world_normal = nw;
    pbr.N = nw;
    pbr.V = calculate_view(in.world_position, false);
    out.color = apply_pbr_lighting(pbr);
    out.color = main_pass_post_lighting_processing(pbr, out.color);
    return out;
}
