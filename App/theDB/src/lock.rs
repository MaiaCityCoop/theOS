//! The system at a version: a lock. `lock` takes everything the root reaches now (the root, its top vibe and every
//! vibe it is made of, every doc they name, and every blob), each doc at its exact version, and keeps that as one
//! object: canonical JSON, signed by the master or the host, a blob whose BLAKE3 hash is the system's hash.
//!
//! A process opened at a lock (`THEDB_LOCK=<hash>`, or `theKERNEL --at <hash>`) reads every doc at the version the lock
//! names and nothing else: the same hash gives the same system, every time, on any machine that holds its objects. It
//! writes nothing: a system at a lock is a system as it was.

use crate::{Hash, Result, TheDB, err};
use std::collections::BTreeMap;

const LOCK: &str = "theDB lock";

/// What a lock pins.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Pins {
    /// The root doc's id.
    pub root: String,
    /// The top vibe the root names, at its version, if it names one.
    pub vibe: Option<String>,
    /// Every doc the root reaches, at its version.
    pub docs: BTreeMap<String, String>,
    /// Every blob the root reaches.
    pub blobs: Vec<String>,
}

/// A lock as kept: the pins, who signed them, and the signature.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct Signed {
    pins: Pins,
    signer: String,
    sig: String,
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Result<Vec<u8>> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2).ok_or("odd hex")?, 16).map_err(err)).collect()
}

impl TheDB {
    /// The system as it is now, pinned: everything the root reaches, each doc at its version; the top vibe whole.
    /// Signed by this process's key (the master's or the host's), kept as a blob. Returns its hash.
    pub fn lock(&self) -> Result<Hash> {
        let reach = self.reach()?;
        let root_text = self.text(&reach.root)?.unwrap_or_default();
        let vibe = serde_json::from_str::<serde_json::Value>(&root_text).ok().and_then(|v| v.get("vibe").and_then(|v| v.as_str()).map(str::to_string));
        let vibe = match vibe {
            Some(v) => {
                let missing = self.tree(&v)?.missing();
                if !missing.is_empty() {
                    return Err(format!("the top vibe is not whole: {}", missing.join("; ")));
                }
                let at = self.head(&v)?.ok_or_else(|| format!("no vibe {v}"))?;
                Some(format!("{v}@{at}"))
            }
            None => None,
        };
        let pins = Pins {
            root: reach.root.clone(),
            vibe,
            docs: reach.docs.iter().map(|(id, h)| (id.clone(), h.to_hex().to_string())).collect(),
            blobs: reach.blobs.keys().map(|h| h.to_hex().to_string()).collect(),
        };
        self.is_master_or_host()?;
        let key = self.key().ok_or("a lock is signed: this process has no key")?;
        let body = serde_json::to_vec(&pins).map_err(err)?;
        let sig = theid::sign(&key, LOCK, &[&body]);
        let signed = Signed { pins, signer: key.public().to_string(), sig: hex(&sig.to_bytes()) };
        self.put(serde_json::to_vec_pretty(&signed).map_err(err)?)
    }

    /// The pins of lock `hash`, its signature checked: by this store's master, or its host by the master's grant.
    pub fn read_lock(&self, hash: Hash) -> Result<Pins> {
        let bytes = self.get(hash)?.ok_or_else(|| format!("no lock {hash}"))?;
        let signed: Signed = serde_json::from_slice(&bytes).map_err(|e| format!("{hash} is no lock: {e}"))?;
        let signer: theid::PublicKey = signed.signer.parse().map_err(err)?;
        let sig = theid::signature(&unhex(&signed.sig)?)?;
        let body = serde_json::to_vec(&signed.pins).map_err(err)?;
        if !theid::verify(&signer, LOCK, &[&body], &sig) {
            return Err(format!("the lock {hash}: its signature does not hold"));
        }
        if let Some(master) = self.master()? {
            let host = self.host()?;
            let ok = signer == master || host.is_some_and(|(h, g)| h == signer && self.grant_at(g).is_ok_and(|grant| theid::allows(&grant, &master, &h, &theid::Cap::Main, crate::now())));
            if !ok {
                return Err(format!("the lock {hash} is signed by {}, not by this store's master or host", signer.fmt_short()));
            }
        }
        Ok(signed.pins)
    }

    /// Opens this process at lock `hash`: every doc read at the version it pins, and nothing written.
    pub fn at_lock(&mut self, hash: Hash) -> Result<()> {
        let pins = self.read_lock(hash)?;
        let docs = pins.docs.iter().map(|(id, h)| Ok((id.clone(), h.parse().map_err(err)?))).collect::<Result<BTreeMap<String, Hash>>>()?;
        self.lock = Some(crate::Locked { hash, root: pins.root, docs });
        Ok(())
    }

    /// The lock this process runs at, if any.
    pub fn locked(&self) -> Option<Hash> {
        self.lock.as_ref().map(|l| l.hash)
    }
}
