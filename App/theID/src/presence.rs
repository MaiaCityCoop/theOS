//! The person's presence, which locks the owner's key (intent 0059). One primitive stays one: the owner signs with its
//! own Ed25519 key, like every key in theID; what the person's presence adds is that the key is kept locked, and only
//! the person opens it, each time.
//!
//! On a Mac the lock is a key in the Secure Enclave (P-256, the only kind it holds), used only after Touch ID or the
//! login password: the owner's key is sealed to its public half (an ephemeral key's agreement with it, HKDF-SHA256,
//! ChaCha20-Poly1305), and opening it needs the Enclave's agreement, which asks the person. The Enclave key never
//! leaves the device; the owner's key is open only inside the process that asked, for the moment it signs. Other
//! platforms lock the same way with their own hardware (Windows Hello, Android's keystore, a security key or TPM on
//! Linux): to come.
//!
//! The helper that talks to the Enclave is `presence.swift`, carried inside this crate and written out beside the
//! user's caches when first needed. It is named theOS: the system's question reads "theOS is trying to …".

use crate::{Result, err};
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use p256::elliptic_curve::rand_core::OsRng;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use std::io::Write;
use std::path::PathBuf;

const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/presence"));
const INFO: &[u8] = b"theOS owner key v1";

/// Locks `secret` with a new key in this device's Secure Enclave that asks the person on every use. Returns what to
/// keep: the Enclave key's blob (useless on any other device), the public halves, the nonce and the sealed secret.
pub fn lock(secret: &[u8]) -> Result<String> {
    lock_with("make", secret)
}

fn lock_with(make: &str, secret: &[u8]) -> Result<String> {
    let out = run(&[make], "")?;
    let mut l = out.lines();
    let blob = l.next().ok_or("the Enclave made no key")?.to_string();
    let enclave = unhex(l.next().ok_or("the Enclave gave no public key")?)?;
    let theirs = p256::PublicKey::from_sec1_bytes(&enclave).map_err(err)?;
    let mine = p256::ecdh::EphemeralSecret::random(&mut OsRng);
    let ephemeral = mine.public_key().to_encoded_point(false).as_bytes().to_vec();
    let shared = mine.diffie_hellman(&theirs);
    let cipher = cipher(shared.raw_secret_bytes(), &ephemeral, &enclave)?;
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let sealed = cipher.encrypt(&nonce, secret).map_err(|_| "not sealed")?;
    Ok(format!("v1 {blob} {} {} {} {}", hex(&enclave), hex(&ephemeral), hex(&nonce), hex(&sealed)))
}

/// Opens what [`lock`] kept: the system asks the person, showing `reason`.
pub fn unlock(locked: &str, reason: &str) -> Result<Vec<u8>> {
    let parts: Vec<&str> = locked.split(' ').collect();
    let ["v1", blob, enclave, ephemeral, nonce, sealed] = parts.as_slice() else { return Err("not a locked key".into()) };
    let (enclave, ephemeral, nonce, sealed) = (unhex(enclave)?, unhex(ephemeral)?, unhex(nonce)?, unhex(sealed)?);
    let shared = unhex(run(&["agree", reason], &format!("{blob}\n{}\n", hex(&ephemeral)))?.trim())?;
    let cipher = cipher(shared.as_slice().into(), &ephemeral, &enclave)?;
    if nonce.len() != 12 {
        return Err("not a nonce".into());
    }
    cipher.decrypt(Nonce::from_slice(&nonce), sealed.as_slice()).map_err(|_| "the lock does not open with this device's Enclave".into())
}

/// The cipher both sides derive from the agreement, bound to both public halves.
fn cipher(shared: &p256::FieldBytes, ephemeral: &[u8], enclave: &[u8]) -> Result<ChaCha20Poly1305> {
    let salt = [ephemeral, enclave].concat();
    let mut key = [0u8; 32];
    hkdf::Hkdf::<sha2::Sha256>::new(Some(&salt), shared).expand(INFO, &mut key).map_err(|_| "no key derived")?;
    Ok(ChaCha20Poly1305::new((&key).into()))
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

/// The helper, written out once per build of it.
fn helper() -> Result<PathBuf> {
    if HELPER.is_empty() {
        return Err("no presence on this platform yet: the owner's key cannot be locked here".into());
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

    /// A key locked by the Enclave opens with it, and is refused when the sealed part is touched. The Enclave key in
    /// this test asks nobody (no Touch ID in a test run).
    #[test]
    #[cfg(target_os = "macos")]
    fn a_locked_key_opens_with_this_devices_enclave() {
        let secret = [7u8; 32];
        let locked = lock_with("make-test", &secret).unwrap();
        assert_eq!(unlock(&locked, "test").unwrap(), secret);
        let mut parts: Vec<String> = locked.split(' ').map(str::to_string).collect();
        let flip = if parts[5].starts_with("00") { "01" } else { "00" };
        parts[5].replace_range(0..2, flip);
        assert!(unlock(&parts.join(" "), "test").is_err(), "a touched seal does not open");
    }
}
