//! theID: who someone is, and what they may do, for the whole stack: theKERNEL, the host (theOS), theDB, and later
//! every iroh endpoint. One source for each of these, used everywhere and written nowhere else:
//!
//! - **Keys** are iroh's own (`SecretKey`, `PublicKey`: Ed25519). An agent's key is also its iroh `EndpointId`, so
//!   "this key may write that line" and "this connection is that agent" are one fact.
//! - **Signatures** are made only by [`sign`] and checked only by [`verify`]: a domain (what is signed: a commit, a
//!   root, a merge) and fields, each with its length, under one prefix. A signature made for one domain is never valid
//!   for another, nor for what iroh signs with the same key (its TLS handshakes).
//! - **Grants** are n0's rcan tokens: the master's signed word that a key may do one [`Cap`] until a time.
//! - **The Keychain** holds the secrets on this Mac: the master's and each agent's, never in `DATA/` or git. The
//!   master's is also in its owner's password manager, shown once when it is made.
//!
//! The master's public key is the store's (theDB keeps it); which key a process signs with is [`key_for`].

pub use iroh_base::{PublicKey, SecretKey, Signature};
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ---- signing: one way, for everything ----

/// The bytes a signature covers: the prefix, the domain, then each field with its length.
fn signed_bytes(domain: &str, fields: &[&[u8]]) -> Vec<u8> {
    let mut r = b"theOS signed v1\0".to_vec();
    for f in std::iter::once(domain.as_bytes()).chain(fields.iter().copied()) {
        r.extend_from_slice(&(f.len() as u32).to_be_bytes());
        r.extend_from_slice(f);
    }
    r
}

/// Signs `fields` as a `domain` (a commit, a root, a merge).
pub fn sign(key: &SecretKey, domain: &str, fields: &[&[u8]]) -> Signature {
    key.sign(&signed_bytes(domain, fields))
}

/// Whether `sig` is `signer`'s signature of `fields` as a `domain`.
pub fn verify(signer: &PublicKey, domain: &str, fields: &[&[u8]], sig: &Signature) -> bool {
    signer.verify(&signed_bytes(domain, fields), sig).is_ok()
}

/// A signature from its 64 bytes.
pub fn signature(bytes: &[u8]) -> Result<Signature> {
    let b: [u8; 64] = bytes.try_into().map_err(|_| format!("a signature of {} bytes", bytes.len()))?;
    Ok(Signature::from_bytes(&b))
}

// ---- grants: what the master lets a key do ----

/// What the master can grant. One list for the whole stack.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum Cap {
    /// Write the line (theDB's branch `line-<agent>`) of that name.
    Line(String),
}

impl rcan::Capability for Cap {
    fn permits(&self, other: &Self) -> bool {
        self == other
    }
}

/// A grant: signed by the master, to a key, for one capability, until a time.
pub type Grant = rcan::Rcan<Cap>;

/// The master grants `to` the capability `cap` for `days`.
pub fn grant(master: &SecretKey, to: PublicKey, cap: Cap, days: u64) -> Grant {
    rcan::Rcan::issuing_builder(master.as_signing_key(), to.as_verifying_key(), cap).sign(rcan::Expires::valid_for(std::time::Duration::from_secs(days * 86_400)))
}

/// The grant in `bytes`, its signature checked.
pub fn read_grant(bytes: &[u8]) -> Result<Grant> {
    Grant::decode(bytes).map_err(err)
}

/// When a grant ends, in seconds since 1970.
pub fn until(g: &Grant) -> u64 {
    match g.expires() {
        rcan::Expires::At(t) => *t,
        rcan::Expires::Never => u64::MAX,
    }
}

/// Whether `g` lets `key` do `cap` at the time `at` (seconds since 1970): given by `master`, to `key`, for `cap`,
/// not ended at `at`. A signature is checked against the time it was made, so a grant that ends later does not undo
/// what was signed while it held.
pub fn allows(g: &Grant, master: &PublicKey, key: &PublicKey, cap: &Cap, at: u64) -> bool {
    *g.issuer() == master.as_verifying_key()
        && *g.audience() == key.as_verifying_key()
        && g.capability() == cap
        && g.expires().is_valid_at(std::time::UNIX_EPOCH + std::time::Duration::from_secs(at))
}

// ---- the Keychain, through the `security` tool ----
//
// Every process that signs (the kernel, theOS, the `theDB` command, an agent's) reads its key through `security`, so
// the Keychain's entry trusts that one tool, and no build of ours has to be allowed again after each build.

const SERVICE: &str = "theOS";

/// Whose key: the master's, or an agent's by name.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Who {
    Master,
    Agent(String),
}

fn account(master: &PublicKey, who: &Who) -> String {
    match who {
        Who::Master => format!("master of {master}"),
        Who::Agent(name) => format!("agent {name} of {master}"),
    }
}

/// The key of `who` under `master`, from this Mac's Keychain.
pub fn keychain_get(master: &PublicKey, who: &Who) -> Option<SecretKey> {
    let out = std::process::Command::new("/usr/bin/security").args(["find-generic-password", "-s", SERVICE, "-a", &account(master, who), "-w"]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok()?.trim().parse().ok()
}

/// Keeps `key` as `who`'s under `master` in this Mac's Keychain, and reads it back to be sure.
pub fn keychain_set(master: &PublicKey, who: &Who, key: &SecretKey) -> Result<()> {
    use std::io::Write;
    let account = account(master, who);
    // the secret goes through the tool's input, not its arguments, which any process on the Mac could read
    let mut child = std::process::Command::new("/usr/bin/security").arg("-i").stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null()).spawn().map_err(err)?;
    writeln!(child.stdin.take().ok_or("no input to security")?, "add-generic-password -U -s {SERVICE} -a \"{account}\" -w {}", secret_text(key)).map_err(err)?;
    if !child.wait().map_err(err)?.success() {
        return Err("the Keychain refused the key".into());
    }
    match keychain_get(master, who) {
        Some(k) if k.public() == key.public() => Ok(()),
        _ => Err("the key is not in the Keychain after writing it".into()),
    }
}

/// A secret key as text (64 hex digits): what is shown once and kept in a password manager. `SecretKey` reads it back.
pub fn secret_text(key: &SecretKey) -> String {
    key.to_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// Whose key this process signs with: the agent named by `THEOS_AGENT`, or else the master.
pub fn who_am_i() -> Who {
    match std::env::var("THEOS_AGENT") {
        Ok(a) if !a.is_empty() => Who::Agent(a),
        _ => Who::Master,
    }
}

/// The key this process signs with under `master`, from the Keychain.
pub fn key_for(master: &PublicKey) -> Option<SecretKey> {
    keychain_get(master, &who_am_i())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_signature_holds_for_its_domain_and_fields_only() {
        let k = SecretKey::generate();
        let s = sign(&k, "commit", &[b"a", b"b"]);
        assert!(verify(&k.public(), "commit", &[b"a", b"b"], &s));
        assert!(!verify(&k.public(), "root", &[b"a", b"b"], &s), "another domain");
        assert!(!verify(&k.public(), "commit", &[b"ab"], &s), "fields are not run together");
        assert!(!verify(&SecretKey::generate().public(), "commit", &[b"a", b"b"], &s));
    }

    #[test]
    fn a_grant_allows_its_key_its_capability_while_it_holds() {
        let (m, a) = (SecretKey::generate(), SecretKey::generate());
        let g = read_grant(&grant(&m, a.public(), Cap::Line("line-a".into()), 1).encode()).unwrap();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        assert!(allows(&g, &m.public(), &a.public(), &Cap::Line("line-a".into()), now));
        assert!(!allows(&g, &m.public(), &a.public(), &Cap::Line("line-b".into()), now));
        assert!(!allows(&g, &a.public(), &a.public(), &Cap::Line("line-a".into()), now), "not from the master");
        assert!(!allows(&g, &m.public(), &a.public(), &Cap::Line("line-a".into()), now + 2 * 86_400), "ended");
    }
}
