// The ground, composed per pixel from its biome's layers (`src/biome.rs`): each layer lies where its own noise rises
// over its threshold, softly, over those before it; then a fine mottle and a fine relief (the light changes with
// bumps of a few centimetres). Detail finer than a pixel fades out with distance, so far ground does not shimmer.
// Stones and clods share the mesh; their vertex colour is opaque (alpha 1) and they keep it.
import bevy_pbr::{
    render::{
        pbr_fragment::pbr_input_from_standard_material,
        forward_io::{VertexOutput, FragmentOutput},
        pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing},
    },
};
import super::wind::{tnoise, thash};

struct Biome {
    colours: array<vec4<f32>, 8>,
    rules: array<vec4<f32>, 8>,
    micro: vec4<f32>,
};

@group(constants::MATERIAL_BIND_GROUP) @binding(100) var<uniform> biome: Biome;

// three octaves: the cell, about a third of it, about a tenth (16, 5, 1.5 m for the bare layer, as the grass reads it)
fn fbm(p: vec2<f32>, cell: f32, seed: u32) -> f32 {
    return tnoise(p, cell, seed) * 0.65 + tnoise(p, cell * 0.3125, seed + 1u) * 0.25 + tnoise(p, cell * 0.09375, seed + 2u) * 0.10;
}

// Cellular noise: the distance to the nearest and the second nearest of points scattered one to a cell (`cell` metres),
// and the nearest one's own random number. Its edges are cracks; its nearest points, pebbles.
struct Cells {
    f1: f32,
    f2: f32,
    id: f32,
    centre: vec2<f32>,
};

fn cells(p: vec2<f32>, cell: f32, seed: u32) -> Cells {
    let q = p / cell;
    let i = floor(q);
    var out: Cells;
    out.f1 = 9.0;
    out.f2 = 9.0;
    for (var dz = -1; dz <= 1; dz = dz + 1) {
        for (var dx = -1; dx <= 1; dx = dx + 1) {
            let cx = i32(i.x) + dx;
            let cz = i32(i.y) + dz;
            let point = vec2<f32>(f32(cx) + thash(cx, cz, seed), f32(cz) + thash(cx, cz, seed + 1u));
            let d = distance(q, point);
            if (d < out.f1) {
                out.f2 = out.f1;
                out.f1 = d;
                out.id = thash(cx, cz, seed + 2u);
                out.centre = point * cell;
            } else if (d < out.f2) {
                out.f2 = d;
            }
        }
    }
    return out;
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) is_front: bool) -> FragmentOutput {
    var pbr_input = pbr_input_from_standard_material(in, is_front);
    var ground = true;
@if(VERTEX_COLORS)
    ground = in.color.a < 0.75;
    if (ground) {
        let p = in.world_position.xz;
        // how big a pixel is here, in metres: detail smaller than about two pixels is left out
        let px = max(length(fwidth(p)), 1e-4);
        let count = u32(biome.micro.w);
        let bare_layer = u32(biome.micro.z);
        var colour = biome.colours[0].rgb;
        var rough = biome.colours[0].a;
        var bare = 0.0;
        for (var k = 1u; k < count; k = k + 1u) {
            let rule = biome.rules[k];
            let n = fbm(p, rule.x, k * 3u + 2u);
            let cover = smoothstep(rule.y, rule.y + rule.z, n) * rule.w;
            colour = mix(colour, biome.colours[k].rgb, cover);
            rough = mix(rough, biome.colours[k].a, cover);
            if (k == bare_layer) {
                bare = cover;
            }
        }
        // ---- the bare ground's own detail, where it shows, while a pixel is small enough to hold it ----
        let near = clamp(0.012 / px - 0.5, 0.0, 1.0); // centimetre detail, gone past a few tens of metres
        var lift = 0.0; // this pixel's small height, for its shade and its relief
        if (bare > 0.01 && near > 0.0) {
            // damp and dry: the soil darkens in soft-edged patches where it holds water
            let damp = smoothstep(0.52, 0.6, tnoise(p, 2.2, 80u));
            colour = mix(colour, colour * vec3<f32>(0.62, 0.6, 0.58), damp * bare);
            // dry soil cracks into plates a hand across: dark, narrow edges where the cells meet
            let warp = vec2<f32>(tnoise(p, 0.09, 82u), tnoise(p, 0.09, 83u)) - 0.5;
            let c = cells(p + warp * 0.05, 0.07, 81u);
            let dry = smoothstep(0.35, 0.6, tnoise(p, 0.9, 87u)); // cracks only where the soil has dried out
            let crack = (1.0 - smoothstep(0.0, 0.05, c.f2 - c.f1)) * (1.0 - damp) * dry * bare * near;
            colour = colour * (1.0 - 0.35 * crack);
            lift = lift - crack * 0.5;
            // pebbles: one in some cells, a small grey dome
            let pc = cells(p, 0.05, 84u);
            let pebble = (1.0 - smoothstep(0.14, 0.22, pc.f1)) * step(0.8, pc.id) * bare * near;
            let grey = colour * (0.75 + 0.5 * fract(pc.id * 7.31));
            colour = mix(colour, grey, pebble);
            lift = lift + pebble * (1.0 - pc.f1 / 0.22);
            // grains: the finest speckle of sand and crumbs
            let grain = tnoise(p, 0.006, 86u) - 0.5;
            colour = colour * (1.0 + 0.35 * grain * bare * clamp(0.008 / px - 0.5, 0.0, 1.0));
        }
        // under the sward: specks of litter and dark gaps between tufts
        if (bare < 0.99 && near > 0.0) {
            // one noise, not cells: this covers most of the near ground, and cells cost too much there
            let leaf = smoothstep(0.72, 0.8, tnoise(p, 0.05, 88u)) * (1.0 - bare) * near;
            colour = mix(colour, vec3<f32>(0.15, 0.115, 0.06), leaf * 0.7);
            lift = lift + leaf * 0.3;
        }
        // cavities: what lies lower than its surroundings is darker (light reaches it less)
        colour = colour * (1.0 + 0.25 * clamp(lift, -1.0, 1.0));
        // a fine mottle, a few to 20 cm, fading out where a pixel is larger than it
        let fine = clamp(0.1 / px - 0.5, 0.0, 1.0);
        let m = (tnoise(p, 0.17, 90u) - 0.5) + 0.5 * (tnoise(p, 0.045, 91u) - 0.5) * clamp(0.03 / px - 0.5, 0.0, 1.0);
        colour = colour * (1.0 + biome.micro.y * m * 1.6 * fine);
        // from afar, a sward is countless blade tips: fine streaks lighter and darker, stretched along the view, so
        // the carpet beyond the blades reads as grass and not as paint
        // the view's direction along the ground: how the ground position changes from one pixel row to the next
        let along = normalize(dpdy(p) + vec2<f32>(1e-6, 0.0));
        let across = vec2<f32>(-along.y, along.x);
        let streak = tnoise(vec2<f32>(dot(p, across) * 9.0, dot(p, along) * 0.8), 1.0, 95u) - 0.5;
        colour = colour * (1.0 + 0.5 * streak * (1.0 - bare) * (1.0 - fine * 0.7));
        pbr_input.material.base_color = vec4<f32>(colour, 1.0);
        pbr_input.material.perceptual_roughness = rough;
        // a sward catches the low sun as a soft sheen (a field of blade tips); bare soil does not
        pbr_input.material.reflectance = vec3<f32>(0.12 * (1.0 - bare));
        pbr_input.material.perceptual_roughness = mix(0.85, rough, bare);
        // the fine relief: the slope of small noise tilts the normal, so tiny bumps catch and lose the light
        let e = 0.01;
        let h0 = tnoise(p, 0.12, 92u) * 0.6 + tnoise(p, 0.04, 93u) * 0.4;
        let hx = tnoise(p + vec2<f32>(e, 0.0), 0.12, 92u) * 0.6 + tnoise(p + vec2<f32>(e, 0.0), 0.04, 93u) * 0.4;
        let hz = tnoise(p + vec2<f32>(0.0, e), 0.12, 92u) * 0.6 + tnoise(p + vec2<f32>(0.0, e), 0.04, 93u) * 0.4;
        let k = biome.micro.x * 0.02 * fine;
        var slope = vec3<f32>(-(hx - h0) / e * k, 0.0, -(hz - h0) / e * k);
        // and the small detail's own relief: its height changes from pixel to pixel tilt the normal
        let lift_slope = vec2<f32>(dpdx(lift), dpdy(lift)) * 0.6;
        slope = slope + vec3<f32>(-lift_slope.x, 0.0, -lift_slope.y);
        pbr_input.N = normalize(pbr_input.N + slope);
    }
    var out: FragmentOutput;
    out.color = apply_pbr_lighting(pbr_input);
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
    return out;
}
