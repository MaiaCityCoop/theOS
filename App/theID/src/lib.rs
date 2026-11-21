//! theID: who someone is, and what they may do, for the whole stack: theKERNEL, the host (theOS), theDB, the host's
//! MCP, and every iroh endpoint. One primitive: **a key and its grants** (intent 0059).
//!
//! - **Keys** are iroh's own (`SecretKey`, `PublicKey`: Ed25519). Everyone has one, of the same kind: an **owner**,
//!   who owns a store and its main; and **agents**: a device (theOS's host on a Mac), a Claude session, a bot, a peer.
//!   An agent's key is also its iroh `EndpointId`, so "this key may write that line" and "this connection is that
//!   agent" are one fact.
//! - **Signatures** are made only by [`sign`] and checked only by [`verify`]: a domain (what is signed: a commit, an
//!   accept, a pin) and fields, each with its length, under one prefix. A signature made for one domain is never valid
//!   for another, nor for what iroh signs with the same key (its TLS handshakes).
//! - **Grants** are n0's rcan tokens: the owner's signed word that a key may do one [`Cap`] until a time; passed on
//!   by its holder to its own sessions, the same or narrower and shorter, as a chain that leads back to the owner
//!   ([`allows_chain`]).
//! - **Secrets** are kept in the system's own store on each platform (`keyring`): agents' and the host's as they are,
//!   the owner's locked by the person's presence ([`presence`]: Touch ID and the Secure Enclave on a Mac), so every
//!   use of the owner's key asks the person. The owner's secret is also in its owner's password manager, shown once
//!   when it is made.
//!
//! The owner's public key is the store's (theDB keeps it); which key a process signs with is [`key_for`].

pub use iroh_base::{PublicKey, SecretKey, Signature};

pub mod presence;
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, String>;

pub(crate) fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ---- signing: one way, for everything ----

/// The bytes a signature covers: the prefix, the domain, then each field with its length.
pub(crate) fn signed_bytes(domain: &str, fields: &[&[u8]]) -> Vec<u8> {
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

// ---- grants: what the owner lets a key do ----

/// What an owner can grant. One list for the whole stack. (New ones go last: grants already made keep their meaning.)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum Cap {
    /// Write the line (theDB's branch `line-<agent>`) of that name.
    Line(String),
    /// Write main and every branch: the host's routine writes, and the merges its owner signs.
    Main,
    /// Open intents, and change their tasks and state up to ready.
    Intents,
    /// Read the store.
    Read,
    /// Ask the host for builds and checks.
    Run,
}

impl rcan::Capability for Cap {
    fn permits(&self, other: &Self) -> bool {
        self == other
    }
}

/// A grant: signed by an owner (or passed on by its holder), to a key, for one capability, until a time.
pub type Grant = rcan::Rcan<Cap>;

fn valid_for(days: u64) -> rcan::Expires {
    rcan::Expires::valid_for(std::time::Duration::from_secs(days * 86_400))
}

/// The owner grants `to` the capability `cap` for `days`.
pub fn grant(owner: &SecretKey, to: PublicKey, cap: Cap, days: u64) -> Grant {
    rcan::Rcan::issuing_builder(owner.as_signing_key(), to.as_verifying_key(), cap).sign(valid_for(days))
}

/// The holder of `mine` (whose key is `holder`) passes its capability on to `to` (a session of its own) for `days`:
/// the next link of a chain that leads back to `owner`. Never longer than `mine` holds.
pub fn pass_on(holder: &SecretKey, mine: &Grant, owner: &PublicKey, to: PublicKey, days: u64) -> Grant {
    let ends = until(mine).min(now().saturating_add(days * 86_400));
    rcan::Rcan::delegating_builder(holder.as_signing_key(), to.as_verifying_key(), owner.as_verifying_key(), mine.capability().clone()).sign(rcan::Expires::At(ends))
}

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
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

/// Whether `g` lets `key` do `cap` at the time `at` (seconds since 1970): given by `owner`, to `key`, for `cap`,
/// not ended at `at`. A signature is checked against the time it was made, so a grant that ends later does not undo
/// what was signed while it held.
pub fn allows(g: &Grant, owner: &PublicKey, key: &PublicKey, cap: &Cap, at: u64) -> bool {
    allows_chain(std::slice::from_ref(g), owner, key, cap, at)
}

/// Whether the chain `chain` (the owner's grant first, then each passing on) lets `key` do `cap` at the time `at`:
/// each link given by the one the link before was given to, every link for `cap`, none ended at `at`, and the last
/// given to `key`. The same rule as rcan's own authorizer, at a time of our choosing.
pub fn allows_chain(chain: &[Grant], owner: &PublicKey, key: &PublicKey, cap: &Cap, at: u64) -> bool {
    use rcan::Capability;
    let when = std::time::UNIX_EPOCH + std::time::Duration::from_secs(at);
    let mut issuer = owner.as_verifying_key();
    for g in chain {
        if *g.issuer() != issuer || *g.capability_issuer() != owner.as_verifying_key() || !g.capability().permits(cap) || !g.expires().is_valid_at(when) {
            return false;
        }
        issuer = *g.audience();
    }
    !chain.is_empty() && issuer == key.as_verifying_key()
}

// ---- secrets, in the system's own store (keyring) ----
//
// On a Mac an item trusts the program that made it: another program (an agent's shell running `security`) is asked
// about by the system, the person decides. The host's builds are signed with one certificate, so a new build is the
// same program to the Keychain.

const SERVICE: &str = "theOS";

/// Whose secret.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Who {
    /// The owner's, locked by the person's presence (`presence`): never kept as it is.
    Owner,
    /// The host's (theOS on this device): its routine writes, by the owner's grant of `Cap::Main`.
    Host,
    /// An agent's, by name.
    Agent(String),
}

fn account(owner: &PublicKey, who: &Who) -> String {
    match who {
        Who::Owner => format!("owner of {owner}"),
        Who::Host => format!("host of {owner}"),
        Who::Agent(name) => format!("agent {name} of {owner}"),
    }
}

/// The store of secrets on this platform, set once.
fn store() -> Result<()> {
    static SET: std::sync::OnceLock<std::result::Result<(), String>> = std::sync::OnceLock::new();
    SET.get_or_init(|| {
        #[cfg(target_os = "macos")]
        let s = apple_native_keyring_store::keychain::Store::new().map_err(err)?;
        #[cfg(target_os = "ios")]
        let s = apple_native_keyring_store::protected::Store::new().map_err(err)?;
        #[cfg(target_os = "windows")]
        let s = windows_native_keyring_store::Store::new().map_err(err)?;
        #[cfg(all(unix, not(any(target_os = "macos", target_os = "ios", target_os = "android"))))]
        let s = zbus_secret_service_keyring_store::Store::new().map_err(err)?;
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", all(unix, not(target_os = "android"))))]
        {
            keyring_core::set_default_store(s);
            Ok(())
        }
        #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "windows", all(unix, not(target_os = "android")))))]
        Err("no store of secrets on this platform yet".to_string())
    })
    .clone()
}

fn entry(account: &str) -> Result<keyring_core::Entry> {
    store()?;
    keyring_core::Entry::new(SERVICE, account).map_err(err)
}

fn read_text(account: &str) -> Option<String> {
    entry(account).ok()?.get_password().ok().map(|t| t.trim().to_string())
}

fn write_text(account: &str, text: &str) -> Result<()> {
    let e = entry(account)?;
    // made new, so the item trusts this program alone (not whatever made it before)
    let _ = e.delete_credential();
    e.set_password(text).map_err(err)
}

/// The secret key of `who` under `owner`, as kept (an agent's or the host's; the owner's is only had by [`owner_key`]).
pub fn keychain_get(owner: &PublicKey, who: &Who) -> Option<SecretKey> {
    if *who == Who::Owner {
        return None;
    }
    read_text(&account(owner, who))?.parse().ok()
}

/// Keeps `key` as `who`'s under `owner`, and reads it back to be sure. The owner's goes through [`protect_owner`].
pub fn keychain_set(owner: &PublicKey, who: &Who, key: &SecretKey) -> Result<()> {
    if *who == Who::Owner {
        return Err("the owner's key is kept locked: protect_owner".into());
    }
    write_text(&account(owner, who), &secret_text(key))?;
    match keychain_get(owner, who) {
        Some(k) if k.public() == key.public() => Ok(()),
        _ => Err("the key is not in the store after writing it".into()),
    }
}

/// Removes what is kept for `who` under `owner` (an agent let go).
pub fn keychain_delete(owner: &PublicKey, who: &Who) -> Result<()> {
    entry(&account(owner, who))?.delete_credential().map_err(err)
}

/// Locks the owner's key with the person's presence on this device and keeps it so; an earlier unlocked copy (the
/// master's, as it was kept before intent 0059) is removed.
pub fn protect_owner(key: &SecretKey) -> Result<()> {
    let owner = key.public();
    write_text(&account(&owner, &Who::Owner), &presence::lock(&key.to_bytes())?)?;
    match owner_key(&owner, "check that the owner's key is kept") {
        Ok(k) if k.public() == owner => {}
        Ok(_) => return Err("the owner's key read back is another key".into()),
        Err(e) => return Err(format!("the owner's key could not be read back: {e}")),
    }
    if let Ok(e) = entry(&format!("master of {owner}")) {
        let _ = e.delete_credential();
    }
    Ok(())
}

/// The owner's key, unlocked by the person: the system asks them (Touch ID or the login password), showing `reason`.
pub fn owner_key(owner: &PublicKey, reason: &str) -> Result<SecretKey> {
    let locked = read_text(&account(owner, &Who::Owner)).ok_or("this device holds no owner's key for this store: `theDB owner protect` (or `owner restore`)")?;
    let bytes: [u8; 32] = presence::unlock(&locked, reason)?.try_into().map_err(|_| "the owner's key is not 32 bytes")?;
    let key = SecretKey::from_bytes(&bytes);
    if key.public() != *owner {
        return Err("the key unlocked is not this store's owner".into());
    }
    Ok(key)
}

/// The owner's key as kept before intent 0059 (the master's, unlocked), if this device still holds it: read once to
/// lock it.
pub fn legacy_owner_key(owner: &PublicKey) -> Option<SecretKey> {
    read_text(&format!("master of {owner}"))?.parse().ok()
}

/// A secret key as text (64 hex digits): what is shown once and kept in a password manager. `SecretKey` reads it back.
pub fn secret_text(key: &SecretKey) -> String {
    key.to_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// The key this process signs with under `owner`: the agent's named by `THEOS_AGENT`, else the host's. The owner's
/// key signs only what a person decides, unlocked each time ([`owner_key`]).
pub fn key_for(owner: &PublicKey) -> Option<SecretKey> {
    match std::env::var("THEOS_AGENT") {
        Ok(a) if !a.is_empty() => keychain_get(owner, &Who::Agent(a)),
        _ => keychain_get(owner, &Who::Host),
    }
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
    fn a_chain_leads_back_to_the_owner() {
        let (owner, agent, session, other) = (SecretKey::generate(), SecretKey::generate(), SecretKey::generate(), SecretKey::generate());
        let mine = grant(&owner, agent.public(), Cap::Intents, 30);
        let passed = pass_on(&agent, &mine, &owner.public(), session.public(), 1);
        let now = now();
        assert!(allows_chain(&[mine.clone(), passed.clone()], &owner.public(), &session.public(), &Cap::Intents, now));
        assert!(!allows_chain(&[mine.clone(), passed.clone()], &owner.public(), &session.public(), &Cap::Main, now), "only what was given");
        assert!(!allows_chain(&[passed.clone()], &owner.public(), &session.public(), &Cap::Intents, now), "not from the owner");
        assert!(!allows_chain(&[mine.clone(), passed.clone()], &owner.public(), &other.public(), &Cap::Intents, now), "to another key");
        assert!(!allows_chain(&[mine, passed], &owner.public(), &session.public(), &Cap::Intents, now + 2 * 86_400), "a session's grant is short");
    }

    #[test]
    fn a_grant_allows_its_key_its_capability_while_it_holds() {
        let (m, a) = (SecretKey::generate(), SecretKey::generate());
        let g = read_grant(&grant(&m, a.public(), Cap::Line("line-a".into()), 1).encode()).unwrap();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        assert!(allows(&g, &m.public(), &a.public(), &Cap::Line("line-a".into()), now));
        assert!(!allows(&g, &m.public(), &a.public(), &Cap::Line("line-b".into()), now));
        assert!(!allows(&g, &a.public(), &a.public(), &Cap::Line("line-a".into()), now), "not from the owner");
        assert!(!allows(&g, &m.public(), &a.public(), &Cap::Line("line-a".into()), now + 2 * 86_400), "ended");
    }
}
