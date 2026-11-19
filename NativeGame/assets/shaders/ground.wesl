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
import super::wind::tnoise;

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
        var colour = biome.colours[0].rgb;
        var rough = biome.colours[0].a;
        for (var k = 1u; k < count; k = k + 1u) {
            let rule = biome.rules[k];
            // the layer's own noise, its finest octave dropped when it is finer than a pixel
            let n = fbm(p, rule.x, k * 3u + 2u);
            let cover = smoothstep(rule.y, rule.y + rule.z, n) * rule.w;
            colour = mix(colour, biome.colours[k].rgb, cover);
            rough = mix(rough, biome.colours[k].a, cover);
        }
        // a fine mottle, a few to 20 cm, fading out where a pixel is larger than it
        let fine = clamp(0.1 / px - 0.5, 0.0, 1.0);
        let m = (tnoise(p, 0.17, 90u) - 0.5) + 0.5 * (tnoise(p, 0.045, 91u) - 0.5) * clamp(0.03 / px - 0.5, 0.0, 1.0);
        colour = colour * (1.0 + biome.micro.y * m * 1.6 * fine);
        pbr_input.material.base_color = vec4<f32>(colour, 1.0);
        pbr_input.material.perceptual_roughness = rough;
        // the fine relief: the slope of small noise tilts the normal, so tiny bumps catch and lose the light
        let e = 0.01;
        let h0 = tnoise(p, 0.12, 92u) * 0.6 + tnoise(p, 0.04, 93u) * 0.4;
        let hx = tnoise(p + vec2<f32>(e, 0.0), 0.12, 92u) * 0.6 + tnoise(p + vec2<f32>(e, 0.0), 0.04, 93u) * 0.4;
        let hz = tnoise(p + vec2<f32>(0.0, e), 0.12, 92u) * 0.6 + tnoise(p + vec2<f32>(0.0, e), 0.04, 93u) * 0.4;
        let k = biome.micro.x * 0.02 * fine;
        let slope = vec3<f32>(-(hx - h0) / e * k, 0.0, -(hz - h0) / e * k);
        pbr_input.N = normalize(pbr_input.N + slope);
    }
    var out: FragmentOutput;
    out.color = apply_pbr_lighting(pbr_input);
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
    return out;
}
