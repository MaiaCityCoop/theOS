//! The root: the one doc everything is reached from (intent 0049). It names, by id, every doc the engine uses; nothing
//! is found by a name or a path. Its content is JSON text, read once at start into this struct.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Root {
    pub shaders: Shaders,
    pub fonts: Fonts,
    /// The asset library: each asset's doc (its recipe as JSON).
    pub library: Vec<String>,
    /// The Meadow's biome recipe.
    pub biome: String,
    /// The Studio's shot list it opens with, and the Meadow's four anchors.
    pub first_shots: String,
    pub anchors: String,
    /// Mértola's package: one doc, each file a part.
    pub mertola: String,
    /// The Earth: every open-data file fetched, a part of this doc by its source URL; and the places baked on a
    /// map's click, by where they are.
    pub earth: String,
    /// Bakes made once: each result a part of this doc, under the hash of what it was made from.
    pub bakes: String,
    /// The dashboard: a view doc.
    pub home: String,
    /// The layers each view lays over its world: layer docs, in order.
    pub layers: Layers,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Layers {
    pub meadow: Vec<String>,
    pub library: Vec<String>,
    pub place: Vec<String>,
    pub studio: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Shaders {
    pub ground: String,
    pub wind: String,
    pub grass_wind: String,
    pub grass_wind_prepass: String,
    pub impostor: String,
    pub bake_normal: String,
    pub lawn_bake: String,
    pub patch_field: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Fonts {
    pub serif: String,
    pub sans: String,
    pub mono: String,
}

/// The root, as the store has it when the app starts.
pub fn root() -> &'static Root {
    static ROOT: std::sync::OnceLock<Root> = std::sync::OnceLock::new();
    ROOT.get_or_init(|| {
        let db = crate::db();
        let id = db.root().ok().flatten().expect("theDB has a root doc");
        let text = db.text(&id).ok().flatten().expect("the root doc reads");
        serde_json::from_str(&text).expect("the root doc parses")
    })
}

/// The asset path of a shader doc, for Bevy (the id and the kind of file).
pub fn shader(id: &str) -> String {
    format!("{id}.wesl")
}

/// The asset path of a font doc.
pub fn font(id: &str) -> String {
    format!("{id}.ttf")
}
