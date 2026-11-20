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
    /// What the shot films: without it the world; a view doc's id, that view of the interface.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world: Option<String>,
    /// In a shot of the interface: the pointer's path, as shares of the window's width and height, evenly through the
    /// shot; and the shares of the shot where it clicks.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pointer: Vec<[f32; 2]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub clicks: Vec<f32>,
    /// Layers of the interface laid over the shot while it plays: layer docs, by id.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<String>,
    pub keys: Vec<Key>,
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
    /// The pointer at `q`, the share of the shot played: on a straight path through its points, eased as the shot.
    pub fn pointer_at(&self, q: f32) -> Option<bevy::math::Vec2> {
        let p = &self.pointer;
        match p.len() {
            0 => None,
            1 => Some(p[0].into()),
            n => {
                let f = self.ease.at(q.clamp(0.0, 1.0)) * (n - 1) as f32;
                let j = (f.floor() as usize).min(n - 2);
                Some(bevy::math::Vec2::from(p[j]).lerp(p[j + 1].into(), f - j as f32))
            }
        }
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f32, b: f32, e: f32) -> bool {
        (a - b).abs() < e
    }

    /// A film to test with: a move through three keys with a zoom, a move of two keys with each other ease, and a
    /// locked-off shot.
    fn film() -> Timeline {
        let key = |x: f32, y: f32, mm: f32| Key { pos: [x, y, 0.0], look: [x, 1.0, -400.0], mm, roll: 0.0, aperture: None, focus: None };
        let shot = |name: &str, secs: f32, ease: Ease, keys: Vec<Key>| Shot {
            name: name.into(),
            kind: "wide".into(),
            secs,
            ease,
            why: String::new(),
            world: None,
            pointer: vec![],
            clicks: vec![],
            layers: vec![],
            keys,
        };
        let mut clips = vec![shot("a crane", 8.0, Ease::Inout, vec![key(0.0, 60.0, 28.0), key(20.0, 27.0, 28.0), key(40.0, 2.5, 35.0)])];
        for ease in [Ease::In, Ease::Out, Ease::Linear, Ease::Soft] {
            clips.push(shot("a track", 6.5, ease, vec![key(-3.0, 1.6, 50.0), key(3.0, 1.6, 50.0)]));
        }
        clips.push(shot("locked", 5.0, Ease::Inout, vec![key(0.0, 1.7, 135.0)]));
        Timeline { title: "a test".into(), clips }
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
        for s in &film().clips {
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
        let t = film();
        let reread = Timeline::from_json(&serde_json::to_string(&t).unwrap()).unwrap();
        let mut time = 0.0;
        while time < t.duration() {
            assert_eq!(t.at(time), reread.at(time));
            time += 1.0 / 60.0;
        }
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
