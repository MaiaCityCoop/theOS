# 0058 · Identities, signed commits and who may edit what: the research

Samuel's question, 2026-11-20: who owns and edits what, in the manner of iroh and Loro; identities, also for syncing
between devices later; properly signed commits for docs and blobs alike.

Read on 2026-11-20 from the projects' own docs, specs and sources (listed at the end with what each was used for).
Where a page could not be read (loro.dev answered 403), the claim rests on docs.rs or the project's repository instead.

**theOS today** (intents [0049](../Intents/0049-docs-and-blobs.md), [0054](../Intents/0054-modules-as-blobs.md),
[0056](../Intents/0056-thedb-the-heart.md), `App/theDB/src/lib.rs`): one store on one device. A blob is bytes named by
BLAKE3 in iroh-blobs 0.105's file store. A doc is a Loro 1.18 document; every `commit_on` imports the current head,
exports a full snapshot, puts it as a blob and moves a tag (`doc/<id>` or `branch/<name>/<id>`) to it. The root is a tag
naming a blob that holds the root doc's id. `merge_into_main` re-commits each branch version onto main. Every
`LoroDoc::new()` gets a random peer id, so who made a change is not recorded anywhere. Nothing is signed; the only
guard is that the local RPC trusts the store owner's own certificate. 0056 has decided: a refs doc per branch, one root
pointer, the kernel started by a root hash. 0054 plans core plugins built from git and WASM modules in theDB, all
loaded by hash.

---

## 1. What iroh and Loro give today

### iroh

- **iroh 1.0 shipped on 2026-06-15.** It promises a stable wire protocol and stable APIs; a wire change only comes with
  a major version. The post says identity, permissions and attribution can be built on top of the key, and does not
  provide them itself. [v1 post]
- **An endpoint's identity is an Ed25519 key.** The `EndpointId` is the public half; by default a new random key is
  made at each start, and an application that wants a stable id stores the `SecretKey` and loads it. Connections are
  QUIC, end-to-end encrypted to that key. [endpoints doc] The public key type is built on `ed25519_dalek`. [iroh-base
  key.rs]
- **Access control in iroh itself is a hook, not a policy.** `EndpointHooks` (since 0.95.1) has `before_connect`
  (outgoing, before any packet) and `after_handshake` (both directions, knowing the remote `EndpointId` and the ALPN);
  a hook can reject and close the connection. [EndpointHooks, roadmap] Relays can allow or block node ids (0.30).
  [roadmap]
- **iroh-blobs (0.105.0, 2026-11-13)** serves blobs and hash sequences over a request/response protocol with BLAKE3
  verified streaming: a reader checks every chunk against the hash as it arrives, so a blob from anyone is safe to
  accept if its hash was asked for. A `HashSeq` is a blob of 32-byte hashes, and one request can fetch the sequence
  and everything it names. The crate says this line is "not yet considered production quality" and points to 0.35 for
  production. [iroh-blobs crate] BLAKE3 is a Merkle tree inside, which is what makes verified streaming possible (Bao).
  [BLAKE3 README]
- **iroh-blobs' provider can refuse readers.** Its event system has `ConnectMode::Intercept` and
  `RequestMode::Intercept`: the handler is told the client's `endpoint_id` and answers `Ok` or
  `AbortReason::Permission`; a missing handler fails closed. [iroh-blobs events.rs] So "who may download which blob" is
  ours to decide, per endpoint and per request.
- **iroh-docs (0.101.0, 2026-06-15)** is a multi-dimensional key-value store: a replica (namespace) holds entries
  identified by namespace, author and key; an entry's value is a BLAKE3 hash, size and timestamp, the content itself
  travelling as blobs. Sync is range-based set reconciliation. [iroh-docs crate]
  - **Capabilities are keys.** `Capability::Write(NamespaceSecret)` and `Capability::Read(NamespaceId)`: whoever
    holds the namespace secret may write; read is knowing the namespace id. [iroh-docs sync.rs, Capability]
  - **Every entry carries two signatures over the same bytes**: the namespace key (the write capability) and the
    author key (authorship). A remote entry is checked for namespace, both signatures, and a timestamp not too far in
    the future. The source carries a TODO that the signed bytes should include a namespace prefix: the domain
    separation we must not forget. [iroh-docs sync.rs]
  - **A `DocTicket`** is a capability (secret or public key) plus endpoint addresses: sharing a write ticket shares
    the secret itself. [DocTicket]
  - Write access is all or nothing per namespace, with no delegation, scoping, expiry or revocation short of making a
    new namespace. Values are last-writer-wins per (author, key), not a CRDT of the content.
- **iroh-gossip (0.103.0, 2026-11-16)** spreads messages to peers on a 32-byte topic (HyParView and PlumTree). Its
  docs say nothing about signing or access; the topic id is only a shared name. [iroh-gossip crate]
- **iroh-docs, -blobs and -gossip were moved out of iroh in late 2024** to their own repositories and release lines.
  [roadmap] **Willow** (see below) is being built for iroh as `iroh-willow`, "in construction" and labelled
  experimental. [iroh README, smaller-is-better post]

**What we take from iroh:** the device key (EndpointId) as the device's identity; verified streaming so blobs need
no signature of their own; `after_handshake` and the blobs provider's intercept as the two gates where a peer is let
in; HashSeq for "everything at this root". **What we leave:** iroh-docs' model. It is LWW key-value, write access is
a shared secret, and nothing can be scoped or revoked; our docs are Loro documents and our rules need more. Its
double signature (capability plus author) and its timestamp check are worth copying.

### Loro

- **A peer id is a random `u64`** ("a random u64 by default"), made anew for every `LoroDoc`, even when the same doc is
  loaded again. [PeerID] It is an identifier for causality, not an identity: nothing binds it to a key, and reusing one
  across concurrent writers corrupts history; Loro's own `peer-lease` library exists to hand out ids safely.
  [LoroDoc, peer-lease]
- **What a change records:** a change is a run of operations sharing one id (peer and counter), Lamport time, deps,
  timestamp and commit message (`ChangeMeta`, read with `get_change`). [LoroDoc 1.18, change_meta.rs] The message and
  timestamp are persisted (`set_next_commit_message`, `set_next_commit_timestamp`); recording timestamps is off by
  default and not serialized; a commit's `origin` is not persisted. [LoroDoc 1.18, CommitOptions]
- **Hooks:** `subscribe_pre_commit` runs before a local change enters the oplog and can change its message and
  timestamp. [LoroDoc 1.18, pre_commit.rs] `import` returns an `ImportStatus` whose `pending` part lists changes whose
  causal dependencies are missing. [LoroDoc 1.18]
- **Loro signs and verifies nothing.** None of `LoroDoc`'s API mentions signatures. Asked about permissions between
  untrusted peers, the maintainer answered: combine signatures to verify editors; consistency is the main guarantee and
  traceable history lets an admin detect and undo bad edits; rejecting updates can break consistency, so schema rules
  belong in the application; on a server, filter imports with an application closure, and an API that reports which
  paths an import touches was proposed. [discussion #314]
- **Loro Protocol and loro-websocket:** many rooms over one connection; `JoinRequest` carries an application-defined
  auth payload; `JoinResponseOk` answers `read` or `write`; a write from a read-only peer is refused with
  `permission_denied`; the server may also refuse invalid or oversized updates. The protocol assumes the transport
  guarantees integrity and has no signatures or authorship. [protocol.md] It is a server-trusted model: the server
  decides who joins and who writes a whole room.

**What we take from Loro:** frontiers and version vectors to name exactly which changes a version holds; the change
metadata to carry a short claim; `updates_in_range` / `updates(vv)` to cut out exactly the changes one author made, so
they can be signed and checked as a unit. **What we add:** every binding from a peer id to a key, every signature and
every permission check.

## 2. How others do it

| System | What is signed | How rights are expressed | Revocation | Concurrent edit by someone just revoked |
| --- | --- | --- | --- | --- |
| **git** | the commit object (its tree hash, parent hashes, author, committer, message): one signature covers the whole tree below | none in git; the forge decides who may push | the key is dropped from the allowed list; GitHub keeps a commit "Verified" once verified, even after the key is rotated or revoked | not a git question |
| **gitsign** (Sigstore) | the commit, with a ~10-minute certificate from Fulcio tied to an OIDC login; each signature recorded in the Rekor log | identity and OIDC issuer checked at verify time | short-lived certificates expire by themselves | n/a |
| **Secure Scuttlebutt** | every message: previous, author, sequence, timestamp, content; id is the sha256 of the signed message | none: each feed is its author's alone | none | none: one writer per feed |
| **iroh-docs** | every entry, by namespace key and author key | holding the namespace secret | none | n/a |
| **Willow + Meadowcap** | every entry, with a capability | read and write capabilities over an area (subspace, path prefix, time range), delegated and restricted step by step; owned or communal namespaces | none; capabilities given for a time range and not renewed; an owner overwrites abuse with later entries | entries outside a capability's area or time are simply not authorised |
| **UCAN 1.0** | each delegation and invocation (DAG-CBOR, Varsig, Ed25519 recommended) | issuer, audience, subject, command, policy, `nbf`/`exp`; each step may only narrow | a signed, permanent revocation naming the delegation's CID, cached by whoever controls the resource; delivery is eventual | a valid chain that avoids the revoked link still works |
| **Keyhive** (Ink & Switch) | delegations and revocations as signed certificates; sync messages signed by each node's Ed25519 key | groups and documents as principals (a document is identified by a public key); levels admin, edit, read, relay/pull | revocation is a new certificate pointing back at what it voids; authority is a function of the set of certificates, not their arrival order | an invocation (an edit) whose delegation chain contains a revoked link is voided; enforcement on backdated Automerge content was still "ongoing" in Nov 2025 |
| **Automerge** | (in Keyhive integration) every sync message, by a non-extractable local key | Keyhive's | Keyhive's | author provenance per commit was "initial work" in July 2026; ARK (automerge-repo-keyhive) is alpha |
| **NextGraph** | each commit by its author; on request, threshold signatures over the heads or a snapshot, with a certificate chain to the repo id | per-repo capabilities | key rotation | the signed heads fix what was accepted |
| **Matrix** | every event, by the sending server's Ed25519 key, plus content hashes | power levels per user and per event type; nobody may grant more than they have; creators infinite (room v12) | a ban or demotion is a state event | an event must pass auth against its own auth events and the state before it (else rejected) and against current state (else "soft-failed": kept for resolution, hidden from clients); power events are resolved first |
| **AT Protocol** | each repo commit (`did`, `data` = Merkle Search Tree root, `rev`, `prev`, `sig`), one signature covers every record; blobs by CID | one writer per repo: the account | signing key rotated in the DID document; PLC rotation keys can override a bad operation within 72 hours | n/a: one writer |
| **Peergos** | writes signed by the writing key pair of a subtree | cryptree of symmetric read keys; separate write key pairs; granting write moves an item to a new key pair | lazy re-encryption | n/a |

Short lessons for theOS:

1. **Sign the top of a Merkle structure, not every leaf.** git and AT Protocol sign one commit that names a tree by
   hash; every record and file below is covered. Our BLAKE3 hashes already make docs and blobs a Merkle DAG, so one
   signature per doc version and one per refs move covers everything reached from it.
2. **Separate the key that writes from the key that controls identity.** PLC's rotation keys versus signing keys;
   Keyhive's individual keys under groups. A device key that is stolen must be revocable by a key not on that device.
3. **Rights are signed certificates that only narrow** (UCAN, Meadowcap), with expiry, so most revocation is "not
   renewed".
4. **Authority is a function of the set of certificates** (Keyhive), so it converges whatever the arrival order.
5. **With concurrent revocation, nobody deletes history.** Matrix keeps late events but soft-fails them; Keyhive voids
   the dependent invocations; the Loro maintainer warns that rejecting updates breaks consistency. Single-writer
   pointers (AT Protocol repo, SSB feed, our main) avoid the question where it matters most.
6. **Read access is a transport question** (Meadowcap: send entries only to holders of a read capability; iroh-blobs'
   intercept), unless data is encrypted (Keyhive, Peergos), which is a later step.

## 3. The design for theOS

### 3.1 Identities

Every key is Ed25519, as in iroh, SSB, Keyhive and UCAN. Every signature is over a **domain-separated** message:
`"theos/<kind>/1" ‖ canonical bytes`, so a version signature can never be replayed as a grant (iroh-docs' own TODO).

| Identity | What it is | Where its key lives | How it changes |
| --- | --- | --- | --- |
| **Device** | the machine; its public key is its iroh `EndpointId` | made at first start, kept in the macOS Keychain (the Secure Enclave holds only P-256 keys, so an SE key may wrap the Ed25519 secret at rest); never leaves the device | a new device key is added by the person; a lost device's key is revoked by the person |
| **Person (citizen)** | who owns things; named by an **identity doc** whose id is the hash of its signed genesis record (self-certifying, as a PLC DID) | not on any one machine in daily use: the identity doc lists **rotation keys** (a recovery key on paper or a hardware key, a second device) and **signing keys** (one per device) | operations on the identity doc are signed by a rotation key and chained by `prev`; a higher-priority rotation key may override an operation within a window (PLC's 72 h) |
| **Agent** | an AI or tool session acting for a person | a key made for that session, held by the signer process (3.6), never in the agent's context | delegated by the person's device key with a grant: scope, expiry (hours), never `merge main`; expires on its own |
| **Core plugin** | a build of host code; its identity is the **BLAKE3 hash of its binary** | n/a: a hash, not a key | released by a line in `plugins.lock` in a signed git commit (SSH signing), and a signed host manifest in theDB |
| **Module** | a WASM blob; its identity is its **BLAKE3 hash** | n/a | its author signs a publish record; the person who installs it signs a grant for what it may do |

A person is not a device: the same citizen signs from a laptop and a phone with two device keys, both listed in the
identity doc, so another device trusts either. Anyone checking a signature asks: which key signed, which identity doc
lists it as a signing key at that time, and which grant lets that identity do this.

### 3.2 Signed commits for docs and blobs alike

Four signed records, each a small blob in canonical bytes (a fixed field order with a version byte; deterministic CBOR
as UCAN and AT Protocol use would do too), named by its BLAKE3 hash like everything else:

1. **A doc version** (replaces "a tag pointing at a snapshot"):
   `doc id · snapshot blob hash · parents (the version hashes it continues, one or more) · frontiers · delta blob hash ·
   peers (the Loro peer ids in the delta) · author (key) · grant (hash of the grant used) · claimed time · signature`.
   The **delta** is `export(updates_in_range(...))` of exactly the changes this author adds over the parents. The
   check is mechanical: the parents' snapshots plus the delta reproduce the snapshot's version vector; every change in
   the delta has a peer in `peers`. This binds Loro peer ids to a key the only safe way: by signing the changes
   themselves, not by trusting a `u64`. A merge-only version (no new changes) has an empty delta and is signed by
   whoever merged.
2. **A blob publish** (only for blobs that are not reached through a doc, such as a module binary or a core plugin
   build): `blob hash · size · kind · author · signature`. A blob named inside a signed doc version needs nothing more:
   the doc's signature covers its hash, and BLAKE3 covers its bytes.
3. **A refs move**: the refs doc of a branch is a doc like any other (0056), so moving a branch is a signed doc version
   of that refs doc. A **merge into main** is a version of main's refs doc whose record also names the proposal (the
   branch's refs version merged) and is signed by main's owner.
4. **A root record**: `main refs version hash · host manifest hash · seq · prev root record · signature`, signed by the
   system's owner. The kernel starts a root record's hash, not a bare doc id. One hash, one signature, the whole
   system.

**Where signatures live:** in those records, never inside the Loro change's metadata. A signature in a change's commit
message cannot cover itself or the snapshot that contains it. The commit message may carry a short pointer (the
author's key) for people reading history, nothing that is trusted.

**How a reader verifies root X down to every blob:**
1. Read root record X; check its signature against the owner's identity doc (a signing key at that seq).
2. Read main's refs version it names; check its record's signature and that its signer may move main.
3. For each doc id → version hash in the refs doc: check the version record's signature, that its grant (3.3) allows
   this author on this doc, branch and kind, and walk its parents the same way down to versions already checked
   (cache by hash: a verified hash never needs checking again).
4. Check every snapshot and delta blob by BLAKE3 (free with iroh-blobs' verified streaming).
5. Every blob a doc names by hash is checked by BLAKE3 alone. Every module or plugin hash named in a world or host
   manifest has its publish record and an install grant.

`thedb verify <root>` does exactly this, and the kernel runs the cheap part (1, 2, hashes) at every start; this also
answers 0056's "no integrity check at start".

### 3.3 Who owns and edits what

- **Every doc has an owner**, recorded in its genesis version (signed). New docs may take their id from the hash of
  that genesis record, so ownership is provable from the id (Keyhive: a document is identified by a key; PLC: an id
  from the genesis hash). Existing docs are adopted once, by a signed record of the system owner.
- **Grants are signed certificates, UCAN-shaped:** `issuer · audience (key or identity) · subject (a doc id, a kind,
  a branch, a refs doc) · command (/doc/write, /branch/write, /refs/move, /refs/merge-main, /blob/publish,
  /module/install, /module/run, /grant) · policy (e.g. kinds = shader, recipe; branch = agent-*) · nbf · exp · proofs
  (hashes of the grants it narrows) · signature`. Each grant only narrows the one it rests on. Each is a blob; a
  **grants doc** per system lists them by hash, so grants have history, sync like any doc, and a grant is valid only
  if its whole chain is.
- **Revocations are signed certificates too**, naming the grant's hash; authority is a function of the set of grants
  and revocations (Keyhive), so two devices that have the same set agree. Most revocation is expiry: agent grants live
  hours, device grants are renewed.
- **The rules for branches:**
  - **main** is single-writer: only the orchestrating owner (or a device key with `/refs/merge-main`) signs versions
    of main's refs doc. This is the AT Protocol and SSB shape: no concurrent writer, so no concurrent revocation
    problem on main.
  - **An agent** holds `/branch/write` on `agent-<name>` and `/doc/write` on the kinds it was given, until `exp`. It
    commits to its branch and proposes; it never moves main.
  - **A proposal** is a refs version of the agent's branch, signed by the agent.
- **The merge check** (in `merge_into_main`, run by the owner's process): for every doc the proposal changes, walk
  the version records from main's current head to the proposal's head; for each record check its signature, that its
  grant chain is valid **at the merge** (not expired, not revoked in the owner's grants doc as of this merge), and
  that the delta's changes touch only what the grant allows (kind; later, paths in the doc, the import-path check the
  Loro maintainer proposed). One failing record refuses the whole proposal, with the reason. Then the owner signs the
  new version of main's refs doc naming the proposal.
- **An edit made concurrently with a revocation:** history is never cut (a Loro doc must stay consistent). The merge
  check decides, in the owner's order, at the moment of merge: a change whose author's grant was revoked before the
  merge does not enter main; the proposal is refused, or the owner merges it with a signed compensating change that
  undoes that author's part. What main already holds stays, because the owner's signature over main's refs says it
  was accepted then (as GitHub keeps a verified commit verified). On docs synced between peers outside main (shared
  drafts later), we follow Matrix's soft failure: keep the change, flag it, do not build on it, and let the owner's
  next signed version decide.

### 3.4 Sync between devices

- **Who may connect:** the endpoint's `after_handshake` hook accepts a remote `EndpointId` only if it is a signing key
  of an identity this device knows and has a grant from (one's own other devices first); iroh-blobs' provider runs in
  `Intercept` mode and serves a hash only to endpoints whose grants reach a doc that names it.
- **What is exchanged, in order, on one ALPN `theos/sync/1`:**
  1. the root records and refs versions each side has (small, signed);
  2. the identity docs and grants doc (needed to check everything else);
  3. doc version records, then their deltas as Loro updates (`updates(vv)` for what the other lacks);
  4. blobs by hash through iroh-blobs.
- **What each side checks before accepting:** the root record and refs signatures; each version record's signature
  and grant; each delta reproduces the claimed version and contains only the claimed peers; BLAKE3 for every blob as it
  streams. Nothing unchecked moves a tag.
- **"The whole system at root X":** the serving device makes a HashSeq of every hash reachable from X (records,
  snapshots, deltas, blobs) and the asking device fetches it in one iroh-blobs request, then runs `thedb verify X`
  before setting its root. Verified streaming means a relay or a stranger can serve the bytes; the signatures say
  whose system it is.
- iroh-docs and Loro Protocol are not needed: the first is the wrong data model, the second trusts a server.

### 3.5 WASM modules by users and AI

- **Signed by their author:** a module blob gets a publish record (3.2). wasmsign2 can carry signatures in a custom
  section of the module, but a separate record is simpler and keeps the blob's hash the code's hash.
- **Run sandboxed:** wasmtime gives no ambient authority: a guest reaches only what the host imports (WASI's
  capability model); 0054's gateways are those imports.
- **Granted capabilities by the person who installs it:** an install is a grant
  `issuer = person · audience = module hash · command = /module/run · policy = gateways [theos:render/mesh@1, ...],
  docs it may read · exp`. The host links only the gateways named in the grant. An AI-written module is published by
  the agent's key and cannot run until the person signs its install grant; its author's signature says who wrote it,
  the install grant says who let it in.

### 3.6 What to build first, on one device

In this order, each usable alone, so sync later adds a transport and nothing is rewritten:

1. **Keys.** A device key made at first start and kept in the Keychain (its public key becomes the iroh EndpointId
   when the endpoint is turned on); a person's identity doc with genesis, one signing key (this device) and one
   recovery key written down; a small **signer** process (as ssh-agent) that holds keys and signs for callers by
   policy, so an agent's tool asks it to sign and never sees a secret key.
2. **Signed doc versions.** `commit_on` writes a version record (snapshot, parents, delta, peers, author, signature)
   and the head points at the record, not the bare snapshot. Each session uses a fresh Loro peer id, recorded in its
   records. Old heads are adopted by one signed record.
3. **Refs docs and the root record,** as 0056 decides, signed: a branch move and a merge are signed versions of a refs
   doc; the root is a signed root record; the kernel starts a root record's hash.
4. **Grants doc and the merge check.** The owner's grant to each agent (branch, kinds, expiry); `merge_into_main`
   refuses what fails. The store's owner process checks signatures before it moves any tag, so the rules hold for every
   process on this machine.
5. **`thedb verify <root>`** and a cheap check at kernel start.
6. **Publish records and install grants for modules,** when 0054's runtime lands.

Out of the first step: encryption, read access, the network, multi-writer docs between people.

## 4. Risks and open questions

- **On one machine, keys protect against mistakes, not malice.** Agents run as the same Unix user; anything that can
  read the key file can sign. The signer process and the Keychain narrow this; real isolation needs separate OS users
  or the Secure Enclave (P-256 only, so either wrap Ed25519 keys or sign with P-256 there).
- **Snapshots are not canonical across Loro versions.** We sign a snapshot blob's hash, which is fine for what we
  stored; but a second device recomputing a snapshot may get other bytes. Verification must rest on the version vector
  and the delta, not on re-deriving the same snapshot bytes.
- **The delta check costs a Loro import per version.** It is done once per hash and cached; it may matter for docs with
  many small commits (intent 0053 already questions a snapshot per commit).
- **Path-level rights inside a doc** (an agent may edit `sun.elevation` but not `meta.owner`) need a list of the paths
  a delta touches; Loro has no such API today (proposed in discussion #314). Until then, rights are per doc and kind.
- **Claimed times are untrusted.** Expiry is checked against the merger's clock at merge time, never against a claimed
  timestamp alone; iroh-docs refuses entries too far in the future, and so should we.
- **Concurrent revocation outside main** (two people editing one doc, one losing the right) is not solved here;
  Keyhive itself still lists it as ongoing. Keeping main single-writer is what makes the first years simple.
- **Recovery:** a lost recovery key plus a lost device loses the identity. Social recovery (other citizens' keys as
  rotation keys) is a later question.
- **Versions to watch:** iroh-blobs 0.10x is still "not production quality" by its own words; iroh-willow is
  experimental; Keyhive is pre-alpha and ARK alpha; Automerge's author provenance is early. None of them is a
  dependency of this design: it uses Ed25519, BLAKE3, Loro's updates and iroh's endpoint and blobs only.
- **Privacy:** a public transparency log (gitsign's Rekor) exposes identities; our records stay in our store and sync
  only to those with grants.

## 5. Sources

| URL | Used for |
| --- | --- |
| https://iroh.computer/blog/v1 | iroh 1.0 date, stability promise, identity and permissions left to applications, relays |
| https://docs.iroh.computer/concepts/endpoints | EndpointId as Ed25519 public key; storing the SecretKey for a stable id |
| https://docs.rs/iroh-base/1.0.0/src/iroh_base/key.rs.html | keys built on ed25519_dalek |
| https://docs.rs/iroh/1.0.0/iroh/endpoint/trait.EndpointHooks.html | before_connect and after_handshake hooks; rejecting connections |
| https://www.iroh.computer/roadmap | protocols moved out of iroh (2024); relay allow/block; EndpointHooks in 0.95.1 |
| https://github.com/n0-computer/iroh | iroh-willow "in construction" |
| https://iroh.computer/blog/smaller-is-better | Willow work continuing under an experimental label |
| https://docs.rs/crate/iroh-blobs/latest | 0.105.0; verified streaming; HashSeq; "not yet production quality", 0.35 recommended |
| https://docs.rs/iroh-blobs/latest/src/iroh_blobs/provider/events.rs.html | ConnectMode/RequestMode Intercept, ClientConnected endpoint_id, AbortReason::Permission, fail-closed |
| https://github.com/BLAKE3-team/BLAKE3 | BLAKE3 as a Merkle tree; Bao verified streaming; derive_key |
| https://docs.rs/crate/iroh-docs/latest | 0.101.0; replicas, namespaces, authors, entries, two signatures, set reconciliation |
| https://docs.rs/iroh-docs/latest/src/iroh_docs/sync.rs.html | SignedEntry bytes; Capability Read/Write; remote entry validation; the namespace-prefix TODO; future timestamps |
| https://docs.rs/iroh-docs/latest/iroh_docs/sync/enum.Capability.html | capability variants and merge |
| https://docs.rs/iroh-docs/latest/iroh_docs/struct.DocTicket.html | a ticket is a capability plus endpoint addresses |
| https://docs.rs/crate/iroh-gossip/latest | 0.103.0; topics; HyParView/PlumTree; no access control documented |
| https://docs.rs/loro/latest/loro/type.PeerID.html | PeerID is a random u64 |
| https://docs.rs/loro/latest/loro/struct.LoroDoc.html | loro 1.18: peer ids, commit message and timestamp, ChangeMeta, subscribe_pre_commit, export modes, ImportStatus; no signatures |
| https://docs.rs/loro/1.5.8/loro/struct.CommitOptions.html | origin not persisted; timestamp and message |
| https://docs.rs/crate/loro-internal/latest/source/src/change_meta.rs | ChangeMeta fields (id, lamport, deps, timestamp, message) |
| https://docs.rs/loro-internal/1.13.0/src/loro_internal/pre_commit.rs.html | pre-commit modifier can set message and timestamp |
| https://github.com/loro-dev/peer-lease | safe reuse of peer ids |
| https://github.com/loro-dev/loro/discussions/314 | maintainer's answer on permissions, signatures, rejecting updates, import filtering |
| https://raw.githubusercontent.com/loro-dev/protocol/main/protocol.md | Loro Protocol messages, read/write on join, permission_denied, no signatures |
| https://git-scm.com/docs/git-commit | -S / commit.gpgSign |
| https://github.blog/changelog/2022-08-23-ssh-commit-verification-now-supported/ | SSH-signed commits verified by GitHub (2022) |
| https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification | GPG/SSH/S/MIME; verification persists after key rotation or revocation |
| https://github.com/sigstore/gitsign | keyless signing, Fulcio short-lived certificates, Rekor, verify by identity and issuer, privacy |
| https://ssbc.github.io/scuttlebutt-protocol-guide/ | SSB feed, message fields, signing, sha256 ids, blobs by hash, no permissions |
| https://willowprotocol.org/ | Willow's specs: data model, Meadowcap, Confidential Sync, Drop Format |
| https://willowprotocol.org/specs/data-model/index.html | Entry fields, prefix pruning, pluggable is_authorised_write |
| https://willowprotocol.org/specs/meadowcap/index.html | owned and communal namespaces, read/write capabilities, restriction by area, no revocation, time-limited capabilities |
| https://earthstar-project.org/ | Earthstar on Willow, ed25519, v11 beta |
| https://raw.githubusercontent.com/ucan-wg/spec/main/README.md | UCAN 1.0 fields, attenuation, did:key, envelope, Ed25519 |
| https://github.com/ucan-wg/revocation | UCAN revocation: who, what, distribution, eventual delivery, alternative chains |
| https://www.inkandswitch.com/keyhive/notebook/ | Keyhive entries, principals, signed certificates, access levels, BeeKEM, pre-alpha status |
| https://www.inkandswitch.com/keyhive/notebook/01/ | convergent capabilities; documents identified by public keys; concurrent revocation left open |
| https://www.inkandswitch.com/keyhive/notebook/08/ | revocation as a certificate pointing back; authority a function of the set; voided invocations |
| https://www.inkandswitch.com/newsletter/dispatch-010 | Keyhive and Beelay open-sourced as pre-alpha (March 2025) |
| https://www.inkandswitch.com/newsletter/dispatch-014/ | Keyhive in automerge-repo: signed messages, non-extractable key, backdated revocation ongoing (Nov 2025) |
| https://automerge.org/blog/2026-july/ | Automerge author provenance: initial work |
| https://automerge.org/blog/2026-august/ | automerge-repo-keyhive (ARK) alpha |
| https://docs.nextgraph.org/en/framework/signature | per-commit author signatures; threshold signatures over heads or a snapshot |
| https://matrix.org/docs/older/stateres-v2/ | auth events, control events resolved first |
| https://spec.matrix.org/latest/server-server-api/ | the three auth checks on receipt; soft failure; server Ed25519 signing keys and hashes |
| https://spec.matrix.org/v1.19/rooms/v12/ | power levels rule: no granting above one's own; creators infinite |
| https://atproto.com/specs/repository | MST, commit fields, what is signed, verification, blobs by CID, CAR export |
| https://web.plc.directory/spec/v0.1/did-plc | rotation keys versus signing keys, chained signed operations, 72-hour override, id from genesis hash |
| https://book.peergos.org/security/cryptree.html | cryptree read keys; write key pairs; new key pair on granting write |
| https://book.peergos.org/features/sharing.html | revocation via lazy re-encryption |
| https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave | Secure Enclave: P-256 only, keys not exportable |
| https://docs.wasmtime.dev/security.html | wasmtime sandbox, no ambient authority, WASI capabilities |
| https://github.com/wasm-signatures/wasmsign2 | signatures in a WASM custom section; multiple signatures; proof of concept |
