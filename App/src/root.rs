//! The root: the one doc everything is reached from (intent 0049). It names, by id, every doc the engine uses; nothing
//! is found by a name or a path. Its content is JSON text, read once at start into this struct.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Root {
    pub shaders: Shaders,
    pub fonts: Fonts,
    /// The world: its settings (the sky's colour, the ground's, its grid lines').
    pub world: String,
    /// The stories timeline: the shot list the Studio opens and the gate holds.
    pub timeline: String,
    /// The dashboard: a view doc.
    pub home: String,
    /// The layers each view lays over the world: layer docs, in order.
    pub layers: Layers,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Layers {
    pub game: Vec<String>,
    pub studio: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Shaders {
    /// The ground's grid (`world::Grid`): its fragment shader.
    pub grid: String,
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
