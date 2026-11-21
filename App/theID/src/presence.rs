//! A person at this Mac: what only a person decides (accepting a proposal into main, the build the kernel runs) is
//! signed by a key in this Mac's Secure Enclave, which signs only after Touch ID or the login password. Unlike the
//! Ed25519 keys in the Keychain, no process can read it: an agent can ask, and the person sees the question.
//!
//! The Enclave holds P-256 keys only, so a person's key is P-256 (ECDSA over SHA-256); what it signs is laid out as
//! everything theID signs ([`crate::sign`]: a domain, then each field with its length). Its public key is the master's
//! word (theDB keeps the master's signature of it). The helper that talks to the Enclave is `presence.swift`, carried
//! inside this crate and written out beside the user's caches when first needed.

use crate::{Result, err, signed_bytes};
use p256::ecdsa::signature::{Signer, Verifier};
use p256::ecdsa::{Signature, SigningKey, VerifyingKey};
use std::io::Write;
use std::path::PathBuf;

const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/presence"));

/// A person's key: in this Mac's Secure Enclave (its blob, which only that Enclave can use, and its public key), or in
/// memory, for tests.
#[derive(Clone)]
pub enum Person {
    Enclave { blob: String, public: Vec<u8> },
    Soft(SigningKey),
}

impl Person {
    /// A new key in this Mac's Secure Enclave. Making it asks nothing; each signature asks the person.
    pub fn make() -> Result<Person> {
        let out = run(&["make"], "")?;
        let mut l = out.lines();
        let blob = l.next().ok_or("the Enclave made no key")?.to_string();
        let public = unhex(l.next().ok_or("the Enclave gave no public key")?)?;
        Ok(Person::Enclave { blob, public })
    }

    /// A key in memory: for tests, never kept.
    pub fn soft() -> Person {
        Person::Soft(SigningKey::random(&mut p256::elliptic_curve::rand_core::OsRng))
    }

    /// The public key (SEC1, uncompressed).
    pub fn public(&self) -> Vec<u8> {
        match self {
            Person::Enclave { public, .. } => public.clone(),
            Person::Soft(k) => VerifyingKey::from(k).to_encoded_point(false).as_bytes().to_vec(),
        }
    }

    /// Signs `fields` as a `domain`, after the person says yes to `reason` ("accept … into main"). 64 bytes.
    pub fn sign(&self, domain: &str, fields: &[&[u8]], reason: &str) -> Result<Vec<u8>> {
        let message = signed_bytes(domain, fields);
        match self {
            Person::Enclave { blob, .. } => unhex(run(&["sign", reason], &format!("{blob}\n{}\n", hex(&message)))?.trim()),
            Person::Soft(k) => Ok(Signer::<Signature>::sign(k, &message).to_bytes().to_vec()),
        }
    }

    /// As kept in the Keychain: the blob, a space, the public key in hex. (A soft key is never kept.)
    pub fn to_text(&self) -> Option<String> {
        match self {
            Person::Enclave { blob, public } => Some(format!("{blob} {}", hex(public))),
            Person::Soft(_) => None,
        }
    }

    pub fn from_text(t: &str) -> Option<Person> {
        let (blob, public) = t.trim().split_once(' ')?;
        Some(Person::Enclave { blob: blob.into(), public: unhex(public).ok()? })
    }
}

/// Whether `sig` is the person `public`'s signature of `fields` as a `domain`.
pub fn verify(public: &[u8], domain: &str, fields: &[&[u8]], sig: &[u8]) -> bool {
    let (Ok(k), Ok(s)) = (VerifyingKey::from_sec1_bytes(public), Signature::from_slice(sig)) else { return false };
    k.verify(&signed_bytes(domain, fields), &s).is_ok()
}

/// Runs the helper with `args`, `input` on its input; its output.
fn run(args: &[&str], input: &str) -> Result<String> {
    let mut child = std::process::Command::new(helper()?)
        .args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(err)?;
    child.stdin.take().ok_or("no input to the helper")?.write_all(input.as_bytes()).map_err(err)?;
    let out = child.wait_with_output().map_err(err)?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    String::from_utf8(out.stdout).map_err(err)
}

/// The helper, written out once per build of it. It is named theOS: the system's question reads "theOS is trying to …".
fn helper() -> Result<PathBuf> {
    if HELPER.is_empty() {
        return Err("this build has no Secure Enclave helper (built off macOS)".into());
    }
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    HELPER.hash(&mut h);
    let home = std::env::var("HOME").map_err(err)?;
    let dir = PathBuf::from(home).join("Library/Caches/theOS/presence").join(format!("{:016x}", h.finish()));
    let path = dir.join("theOS");
    if std::fs::read(&path).is_ok_and(|b| b == HELPER) {
        return Ok(path);
    }
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(&dir).map_err(err)?;
    let part = dir.join(format!("theOS.{}", std::process::id()));
    std::fs::write(&part, HELPER).map_err(err)?;
    std::fs::set_permissions(&part, std::fs::Permissions::from_mode(0o755)).map_err(err)?;
    std::fs::rename(&part, &path).map_err(err)?;
    Ok(path)
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn unhex(s: &str) -> Result<Vec<u8>> {
    if s.len() % 2 != 0 {
        return Err("odd hex".into());
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(err)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_persons_signature_holds_for_its_domain_and_fields_only() {
        let p = Person::soft();
        let s = p.sign("accept", &[b"a", b"b"], "").unwrap();
        assert!(verify(&p.public(), "accept", &[b"a", b"b"], &s));
        assert!(!verify(&p.public(), "pin", &[b"a", b"b"], &s));
        assert!(!verify(&p.public(), "accept", &[b"ab"], &s));
        assert!(!verify(&Person::soft().public(), "accept", &[b"a", b"b"], &s));
    }

    /// The Enclave's signatures check here. Its key in this test asks no person (no Touch ID in a test run).
    #[test]
    #[cfg(target_os = "macos")]
    fn the_enclaves_signatures_hold() {
        let out = run(&["test"], "").unwrap();
        let mut l = out.lines();
        let public = unhex(l.next().unwrap()).unwrap();
        for line in l {
            let (msg, sig) = line.split_once(' ').unwrap();
            let m = unhex(msg).unwrap();
            let (Ok(k), Ok(s)) = (VerifyingKey::from_sec1_bytes(&public), Signature::from_slice(&unhex(sig).unwrap())) else { panic!() };
            assert!(k.verify(&m, &s).is_ok());
        }
    }
}
