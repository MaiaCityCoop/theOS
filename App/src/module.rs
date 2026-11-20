//! Modules (intent 0054): code that is content. A module is a doc in theDB whose text is its source (one Rust file)
//! and whose part `wasm` is that source built (`theDB module build`); theOS loads the part by the doc's id and runs it
//! in wasmi, sandboxed: a module touches nothing but the numbers it is given and returns.
//!
//! **The world contract.** A world doc names its module (`module`: the doc's id). The module exports, all `f32`:
//! `eye_height()` (where the Game's eye starts above the ground), `near()` and `far()` (the camera's planes), and
//! `ground_half(eye_y)` (how far the ground reaches to each side for an eye that high). theOS hard-sets none of them.

use bevy::prelude::*;
use std::sync::Mutex;
use wasmi::{Engine, Linker, Module, Store, TypedFunc};

/// A world module, loaded and ready to call.
#[derive(Resource)]
pub struct WorldModule {
    store: Mutex<Store<()>>,
    eye_height: TypedFunc<(), f32>,
    near: TypedFunc<(), f32>,
    far: TypedFunc<(), f32>,
    ground_half: TypedFunc<f32, f32>,
}

impl WorldModule {
    /// The module doc `id`'s built part, instantiated.
    pub fn load(id: &str) -> Result<Self, String> {
        let wasm = crate::db().part(id, "wasm")?.ok_or_else(|| format!("the module {id} is not built (theDB module build {id})"))?;
        let engine = Engine::default();
        let module = Module::new(&engine, &wasm[..]).map_err(|e| e.to_string())?;
        let mut store = Store::new(&engine, ());
        // a world module imports nothing: it can reach nothing of the host
        let instance = Linker::<()>::new(&engine).instantiate_and_start(&mut store, &module).map_err(|e| e.to_string())?;
        let f = |name: &str| instance.get_typed_func::<(), f32>(&store, name).map_err(|e| format!("the module {id} lacks {name}: {e}"));
        Ok(WorldModule {
            eye_height: f("eye_height")?,
            near: f("near")?,
            far: f("far")?,
            ground_half: instance.get_typed_func::<f32, f32>(&store, "ground_half").map_err(|e| format!("the module {id} lacks ground_half: {e}"))?,
            store: Mutex::new(store),
        })
    }

    fn call0(&self, f: TypedFunc<(), f32>) -> f32 {
        f.call(&mut *self.store.lock().unwrap_or_else(|e| e.into_inner()), ()).unwrap_or(f32::NAN)
    }

    pub fn eye_height(&self) -> f32 {
        self.call0(self.eye_height)
    }
    pub fn near(&self) -> f32 {
        self.call0(self.near)
    }
    pub fn far(&self) -> f32 {
        self.call0(self.far)
    }
    pub fn ground_half(&self, eye_y: f32) -> f32 {
        self.ground_half.call(&mut *self.store.lock().unwrap_or_else(|e| e.into_inner()), eye_y).unwrap_or(f32::NAN)
    }
}
