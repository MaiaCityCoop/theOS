//! Modules (intent 0054): code that is content. A module is a doc in theDB whose text is its source (one Rust file)
//! and whose part `wasm` is that source built (`theDB module build`); theOS loads the part by the doc's id and runs it
//! in wasmi, sandboxed: a module touches nothing but the numbers it is given and returns.
//!
//! **The world contract.** A world doc names its module (`module`: the doc's id). The module exports, all `f32`:
//! `eye_height()` (where the Game's eye starts above the ground), `near()` and `far()` (the camera's planes),
//! `ground_half(eye_y)` (how far the ground reaches to each side for an eye that high), and how one walks in it:
//! `walk_speed(eye_y, running)` (metres a second; `running` is 0 or 1), `lowest()` and `highest()` (the eye's limits),
//! `rise_per_notch()` (what a wheel notch multiplies the height by), `lens_mm()` (the walker's lens), `start_x()` and
//! `start_z()` (where the walker starts). theOS hard-sets none of them; it only maps the keys and the mouse.

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
    walk_speed: TypedFunc<(f32, i32), f32>,
    lowest: TypedFunc<(), f32>,
    highest: TypedFunc<(), f32>,
    rise_per_notch: TypedFunc<(), f32>,
    lens_mm: TypedFunc<(), f32>,
    start_x: TypedFunc<(), f32>,
    start_z: TypedFunc<(), f32>,
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
            walk_speed: instance.get_typed_func::<(f32, i32), f32>(&store, "walk_speed").map_err(|e| format!("the module {id} lacks walk_speed: {e}"))?,
            lowest: f("lowest")?,
            highest: f("highest")?,
            rise_per_notch: f("rise_per_notch")?,
            lens_mm: f("lens_mm")?,
            start_x: f("start_x")?,
            start_z: f("start_z")?,
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
    pub fn walk_speed(&self, eye_y: f32, running: bool) -> f32 {
        self.walk_speed.call(&mut *self.store.lock().unwrap_or_else(|e| e.into_inner()), (eye_y, running as i32)).unwrap_or(0.0)
    }
    pub fn lowest(&self) -> f32 {
        self.call0(self.lowest)
    }
    pub fn highest(&self) -> f32 {
        self.call0(self.highest)
    }
    pub fn rise_per_notch(&self) -> f32 {
        self.call0(self.rise_per_notch)
    }
    pub fn lens_mm(&self) -> f32 {
        self.call0(self.lens_mm)
    }
    pub fn start_x(&self) -> f32 {
        self.call0(self.start_x)
    }
    pub fn start_z(&self) -> f32 {
        self.call0(self.start_z)
    }
    pub fn ground_half(&self, eye_y: f32) -> f32 {
        self.ground_half.call(&mut *self.store.lock().unwrap_or_else(|e| e.into_inner()), eye_y).unwrap_or(f32::NAN)
    }
}
