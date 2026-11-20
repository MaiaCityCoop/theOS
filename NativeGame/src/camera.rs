//! The virtual camera: shots in the legacy timeline's format, evaluated at any time.
//!
//! The camera is a pure function of the shot list and the time, so playing, seeking and an agent's still all see the
//! same camera. Ported from `TheGame/cine/cine.js` (the eases, the curve through the keys, the zoom in stops) and
//! `TheGame/cine/lenses.js` (the lens kit).

use bevy::math::Vec3;
use serde::{Deserialize, Serialize};

/// One position of the camera: where it is, where it looks, its lens and its roll in degrees.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Key {
    pub pos: [f32; 3],
    pub look: [f32; 3],
    #[serde(default = "default_mm")]
    pub mm: f32,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub roll: f32,
    /// The aperture as an f-stop; without it everything is sharp.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aperture: Option<f32>,
    /// The focus distance, metres; without it the lens focuses on what it looks at.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus: Option<f32>,
}
fn default_mm() -> f32 {
    35.0
}
fn is_zero(v: &f32) -> bool {
    *v == 0.0
}

/// How a move starts and ends.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ease {
    /// From rest to rest.
    #[default]
    Inout,
    /// From rest, leaves moving.
    In,
    /// Arrives moving, comes to rest.
    Out,
    /// Moving through.
    Linear,
    /// Barely eased.
    Soft,
}

impl Ease {
    pub fn at(self, q: f32) -> f32 {
        match self {
            Ease::Linear => q,
            Ease::Soft => q + (q * q * (3.0 - 2.0 * q) - q) * 0.5,
            _ => {
                // a cubic with the speed 1.5 at the end that is not at rest, 0 at an end that is
                let s0 = if self == Ease::Out { 1.5 } else { 0.0 };
                let s1 = if self == Ease::In { 1.5 } else { 0.0 };
                let (q2, q3) = (q * q, q * q * q);
                (q3 - 2.0 * q2 + q) * s0 + (3.0 * q2 - 2.0 * q3) + (q3 - q2) * s1
            }
        }
    }
}

/// A shot: the camera travels through its keys on a smooth curve in `secs` seconds. One key is a locked-off shot.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Shot {
    pub name: String,
    #[serde(default)]
    pub kind: String,
    pub secs: f32,
    #[serde(default)]
    pub ease: Ease,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub why: String,
    /// The shot's hour of the day (0 to 24), or `[from, to]` across the shot (a time-lapse). Without it the shot keeps
    /// the hour it finds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hour: Option<Over>,
    /// The shot's wind (0 calm to 2.5 a storm), or `[from, to]` across the shot. Without it the shot keeps the wind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wind: Option<Over>,
    /// The world the shot is in: a doc's id (a biome is the Meadow, a place a real place, an asset the Library with
    /// it on the shelf). Without it the Meadow.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world: Option<String>,
    pub keys: Vec<Key>,
}

/// A value held through a shot, or one that runs from one value to another across it.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Over {
    Held(f32),
    Runs([f32; 2]),
}

impl Over {
    /// The value at `q`, the share of the shot played.
    pub fn at(&self, q: f32) -> f32 {
        match *self {
            Over::Held(v) => v,
            Over::Runs([a, b]) => a + (b - a) * q,
        }
    }
}

/// A shot list, cut one shot after the other. The file holds `{ "clips": [...] }` like the legacy timelines.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Timeline {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub title: String,
    pub clips: Vec<Shot>,
}

/// The camera at one moment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    pub pos: Vec3,
    pub look: Vec3,
    pub mm: f32,
    pub roll: f32,
    pub aperture: Option<f32>,
    pub focus: Option<f32>,
}

impl From<&Key> for Camera {
    fn from(k: &Key) -> Self {
        Camera { pos: k.pos.into(), look: k.look.into(), mm: k.mm, roll: k.roll, aperture: k.aperture, focus: k.focus }
    }
}

/// Between two optional values, evenly in their logarithm; one alone holds.
fn stops(a: Option<f32>, b: Option<f32>, u: f32) -> Option<f32> {
    match (a, b) {
        (Some(a), Some(b)) => Some((a.max(1e-3).ln() + (b.max(1e-3).ln() - a.max(1e-3).ln()) * u).exp()),
        (a, b) => a.or(b),
    }
}

fn catmull_rom(a: f32, b: f32, c: f32, d: f32, t: f32) -> f32 {
    0.5 * (2.0 * b + (c - a) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t * t + (3.0 * b - a - 3.0 * c + d) * t * t * t)
}

impl Shot {
    /// The camera at `q`, the share of the shot played (0 to 1).
    pub fn at(&self, q: f32) -> Camera {
        let k = &self.keys;
        let n = k.len();
        if n == 1 {
            return (&k[0]).into();
        }
        let q = self.ease.at(q.clamp(0.0, 1.0));
        let f = q * (n - 1) as f32;
        let j = (f.floor() as usize).min(n - 2);
        let u = f - j as f32;
        let (a, b, c, d) = (&k[j.saturating_sub(1)], &k[j], &k[j + 1], &k[(j + 2).min(n - 1)]);
        let curve = |pa: [f32; 3], pb: [f32; 3], pc: [f32; 3], pd: [f32; 3]| {
            Vec3::from_array(std::array::from_fn(|i| catmull_rom(pa[i], pb[i], pc[i], pd[i], u)))
        };
        Camera {
            pos: curve(a.pos, b.pos, c.pos, d.pos),
            look: curve(a.look, b.look, c.look, d.look),
            roll: b.roll + (c.roll - b.roll) * u,
            mm: (b.mm.ln() + (c.mm.ln() - b.mm.ln()) * u).exp(), // a zoom runs evenly in stops
            // an aperture and a focus pull run evenly in stops and in log distance, as a focus puller's hand
            aperture: stops(b.aperture, c.aperture, u),
            focus: stops(b.focus, c.focus, u),
        }
    }
}

impl Timeline {
    pub fn from_json(text: &str) -> Result<Self, serde_json::Error> {
        let t: Timeline = serde_json::from_str(text)?;
        Ok(Timeline { clips: t.clips.into_iter().filter(|c| !c.keys.is_empty() && c.secs > 0.0).collect(), ..t })
    }

    pub fn duration(&self) -> f32 {
        self.clips.iter().map(|c| c.secs).sum()
    }

    /// The shot playing at `time` and the share of it played.
    pub fn shot_at(&self, time: f32) -> Option<(usize, f32)> {
        let mut start = 0.0;
        for (i, c) in self.clips.iter().enumerate() {
            if time < start + c.secs || i + 1 == self.clips.len() {
                return Some((i, ((time - start) / c.secs).clamp(0.0, 1.0)));
            }
            start += c.secs;
        }
        None
    }

    /// The camera at `time` seconds into the film.
    pub fn at(&self, time: f32) -> Option<Camera> {
        self.shot_at(time).map(|(i, q)| self.clips[i].at(q))
    }
}

/// A small deterministic random source, so a seed always gives the same shots.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((self.0 >> 40) as f32) / (1u64 << 24) as f32
    }
    fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.next()
    }
    fn dir(&mut self) -> Vec3 {
        let a = self.range(0.0, std::f32::consts::TAU);
        Vec3::new(a.cos(), 0.0, a.sin())
    }
}

fn key(pos: Vec3, look: Vec3, mm: f32, roll: f32) -> Key {
    Key { pos: pos.to_array(), look: look.to_array(), mm, roll, aperture: None, focus: None }
}
fn shot(name: &str, kind: &str, secs: f32, ease: Ease, why: &str, keys: Vec<Key>) -> Shot {
    Shot { name: name.into(), kind: kind.into(), secs, ease, why: why.into(), hour: None, wind: None, world: None, keys }
}

/// Five shots of different sizes and moves over the plane, the same for the same seed.
pub fn five_shots(seed: u64) -> Timeline {
    let mut r = Rng(seed ^ 0x9E37_79B9_7F4A_7C15);
    r.next();

    // 1. wide, a crane: from high above, down toward the ground, the horizon steady
    let d = r.dir();
    let o = d * r.range(-30.0, 30.0);
    let h0 = r.range(45.0, 80.0);
    let crane = shot("Over the plain", "wide", r.range(7.0, 9.0), Ease::Inout, "a crane down from the sky: the whole plain, nothing on it yet", vec![
        key(o + Vec3::Y * h0, o + d * 400.0, 28.0, 0.0),
        key(o + d * 20.0 + Vec3::Y * h0 * 0.45, o + d * 400.0 + Vec3::Y * 4.0, 28.0, 0.0),
        key(o + d * 40.0 + Vec3::Y * 2.5, o + d * 400.0 + Vec3::Y * 2.0, 35.0, 0.0),
    ]);

    // 2. medium, a track: sideways at eye height, moving through
    let d = r.dir();
    let side = Vec3::new(-d.z, 0.0, d.x);
    let p = d * r.range(-20.0, 20.0) + Vec3::Y * 1.6;
    let track = shot("Walking the plain", "medium", r.range(6.0, 8.0), Ease::Linear, "a track at eye height: the plain goes by", vec![
        key(p, p + d * 60.0, 50.0, 0.0),
        key(p + side * 6.0, p + side * 6.0 + d * 60.0, 50.0, 0.0),
    ]);

    // 3. close, a push: low over the ground, toward the ground ahead
    let d = r.dir();
    let p = d * r.range(-10.0, 10.0) + Vec3::Y * 0.35;
    let push = shot("The ground", "close", r.range(5.0, 7.0), Ease::Inout, "a push in low: where the first seed will go", vec![
        key(p, p + d * 6.0 - Vec3::Y * 0.35, 75.0, 0.0),
        key(p + d * 2.0 - Vec3::Y * 0.1, p + d * 6.0 - Vec3::Y * 0.35, 100.0, 0.0),
    ]);

    // 4. low, an orbit: around one spot, a little tilted
    let c = r.dir() * r.range(0.0, 25.0);
    let rad = r.range(5.0, 9.0);
    let a0 = r.range(0.0, std::f32::consts::TAU);
    let orbit_keys = (0..5)
        .map(|i| {
            let a = a0 + i as f32 * 0.5;
            key(c + Vec3::new(a.cos() * rad, 1.0, a.sin() * rad), c, 35.0, 4.0 - i as f32 * 2.0)
        })
        .collect();
    let orbit = shot("Around a spot", "low", r.range(8.0, 10.0), Ease::Soft, "an orbit around one spot of ground: here", orbit_keys);

    // 5. locked, a long lens on the horizon
    let d = r.dir();
    let p = Vec3::new(-d.z, 0.0, d.x) * r.range(-5.0, 5.0) + Vec3::Y * 1.7;
    let locked = shot("The horizon", "locked", r.range(5.0, 6.0), Ease::Inout, "a long lens held still: nothing between here and the edge of the world", vec![
        key(p, p + d * 1000.0 - Vec3::Y, 135.0, 0.0),
    ]);

    Timeline { title: format!("Five new shots, seed {seed}"), clips: vec![crane, track, push, orbit, locked] }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f32, b: f32, e: f32) -> bool {
        (a - b).abs() < e
    }

    #[test]
    fn eases_start_and_end_where_they_should() {
        for e in [Ease::Inout, Ease::In, Ease::Out, Ease::Linear, Ease::Soft] {
            assert!(close(e.at(0.0), 0.0, 1e-6) && close(e.at(1.0), 1.0, 1e-6), "{e:?}");
        }
        let speed = |e: Ease, q: f32| (e.at(q + 1e-3) - e.at(q)) / 1e-3;
        assert!(speed(Ease::Inout, 0.0) < 0.01 && speed(Ease::Inout, 0.999) < 0.01, "inout rests at both ends");
        assert!(speed(Ease::In, 0.0) < 0.01 && speed(Ease::In, 0.999) > 1.0, "in leaves moving");
        assert!(speed(Ease::Out, 0.0) > 1.0 && speed(Ease::Out, 0.999) < 0.01, "out arrives moving");
    }

    #[test]
    fn a_shot_passes_through_every_key() {
        let t = five_shots(7);
        for s in &t.clips {
            let n = s.keys.len();
            for (i, k) in s.keys.iter().enumerate() {
                if n == 1 {
                    assert_eq!(s.at(0.5).pos, Vec3::from(k.pos));
                    continue;
                }
                let target = i as f32 / (n - 1) as f32; // the eased share that lands on key i, found by search
                let q = (0..=10000)
                    .map(|j| j as f32 / 10000.0)
                    .min_by(|a, b| (s.ease.at(*a) - target).abs().total_cmp(&(s.ease.at(*b) - target).abs()))
                    .unwrap();
                let c = s.at(q);
                assert!(c.pos.distance(Vec3::from(k.pos)) < 0.05, "{} key {i}: {:?} vs {:?}", s.name, c.pos, k.pos);
            }
        }
    }

    #[test]
    fn seeking_is_playing() {
        let t = five_shots(3);
        let reread = Timeline::from_json(&serde_json::to_string(&t).unwrap()).unwrap();
        let mut time = 0.0;
        while time < t.duration() {
            assert_eq!(t.at(time), reread.at(time));
            time += 1.0 / 60.0;
        }
    }

    #[test]
    fn a_seed_gives_the_same_shots_and_five_kinds() {
        assert_eq!(five_shots(11), five_shots(11));
        assert_ne!(five_shots(11), five_shots(12));
        let kinds: Vec<_> = five_shots(11).clips.iter().map(|c| c.kind.clone()).collect();
        assert_eq!(kinds, ["wide", "medium", "close", "low", "locked"]);
    }

    #[test]
    fn the_legacy_format_reads() {
        let text = r#"{ "intent": "0026", "clips": [ { "name": "a", "kind": "wide", "secs": 9, "ease": "in", "in": "dip",
            "keys": [ { "pos": [0, 1, 0], "look": [0, 1, 5], "mm": 35 }, { "pos": [1, 1, 0], "look": [0, 1, 5], "mm": 28, "roll": 6 } ] } ] }"#;
        let t = Timeline::from_json(text).unwrap();
        assert_eq!(t.clips.len(), 1);
        assert_eq!(t.clips[0].ease, Ease::In);
        assert!(close(t.duration(), 9.0, 1e-6));
    }
}
