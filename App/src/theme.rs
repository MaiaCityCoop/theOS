//! The palette: a theme doc in theDB, named by the root (`theme`), its tokens by name (`paper`, `forest`, ...) as
//! `#rrggbb` or `#rrggbbaa`. Everything theOS draws takes its colours from it by token: the views' docs, the pill, the
//! setup screen, theDB's view. Read once when theOS starts.
//!
//! A store with no theme doc yet (a new store, on its setup screen) is drawn in `BRAND`, the brand's own palette as
//! Brand/brand.css has it: the one place it is written in the host.

use bevy::prelude::*;
use std::collections::HashMap;
use std::sync::OnceLock;

/// The brand's palette (Brand/brand.css, :root), the theme doc's first version.
pub const BRAND: &str = r##"{
  "paper": "#f7f0e3",
  "cream": "#fbf6ea",
  "sand": "#ece1cc",
  "forest": "#173655",
  "forest2": "#46596e",
  "clay": "#4f9d34",
  "sun": "#f2b544",
  "glass": "#fbf6ead1",
  "picked": "#f4e2b8"
}
"##;

fn palette() -> &'static HashMap<String, Color> {
    static P: OnceLock<HashMap<String, Color>> = OnceLock::new();
    P.get_or_init(|| {
        let text = crate::root::root().theme.as_deref().and_then(|id| crate::db().text(id).ok().flatten()).unwrap_or_else(|| BRAND.to_string());
        let tokens: HashMap<String, String> = serde_json::from_str(&text).unwrap_or_else(|_| serde_json::from_str(BRAND).expect("the brand palette parses"));
        tokens.into_iter().filter_map(|(k, v)| Some((k, Srgba::hex(v.trim_start_matches('#')).ok()?.into()))).collect()
    })
}

/// The colour of `token`: a name from the theme, or `#rrggbb` itself. An unknown name is the theme's `forest`.
pub fn colour(token: &str) -> Color {
    if let Some(hex) = token.strip_prefix('#') {
        return Srgba::hex(hex).map(Color::from).unwrap_or_else(|_| colour("forest"));
    }
    palette().get(token).or_else(|| palette().get("forest")).copied().unwrap_or(Color::BLACK)
}
