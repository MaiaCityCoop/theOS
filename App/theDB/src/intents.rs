//! Intents (intent 0059): every piece of work, by a person or an agent, as one doc of kind `intent`: its title, why,
//! when it is done, a task board, the line its work happens on, the versions it brings, and what became of it:
//! draft → building → checked → proposal → merged | refused.
//!
//! An agent opens an intent on its line, works there, ticks its tasks and marks it ready: the versions its line changed
//! are taken as they are now, and the intent waits for a person (proposal). A person accepts it in theOS (the host's
//! key and, in a store with a person, Touch ID) or refuses it; either way the closed intent is kept on main as history.
//! An intent is one doc wherever it is: on its line while it is worked on, on main once closed or when a person opens
//! it there; every line's are listed together, like issues, not bound to where they live.
//!
//! An intent whose checks fail goes back to building with the reason. Docs of the earlier kind `proposal` read as
//! intents (open: proposal).

use crate::{Hash, Result, TheDB, err, sql};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Where an intent is.
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum State {
    /// Being written: its why, when it is done, its tasks.
    Draft,
    /// Worked on, on its line.
    Building,
    /// Its checks passed (the kernel's runner, intent 0059's step 3).
    Checked,
    /// Waiting for a person.
    Proposal,
    Merged,
    Refused,
}

impl State {
    pub fn is_open(self) -> bool {
        !matches!(self, State::Merged | State::Refused)
    }

    pub fn name(self) -> &'static str {
        match self {
            State::Draft => "draft",
            State::Building => "building",
            State::Checked => "checked",
            State::Proposal => "proposal",
            State::Merged => "merged",
            State::Refused => "refused",
        }
    }
}

/// One task on an intent's board.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Task {
    pub text: String,
    #[serde(default)]
    pub done: bool,
}

/// An intent.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Intent {
    pub title: String,
    #[serde(default)]
    pub why: String,
    /// When it is done, in words.
    #[serde(default)]
    pub done_when: String,
    #[serde(default)]
    pub tasks: Vec<Task>,
    /// The line its work happens on; none until an agent takes it up.
    #[serde(default)]
    pub line: Option<String>,
    /// Doc id → the version on the line when it became a proposal.
    #[serde(default)]
    pub docs: BTreeMap<String, String>,
    pub state: State,
    /// Why it went back to building (a failed check, a refusal's word).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The person's signature of the accept (`access`): set when it is merged in a store with a person.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval: Option<crate::access::Approval>,
}

/// A doc of the earlier kind `proposal`, read as an intent.
#[derive(serde::Deserialize)]
struct Legacy {
    branch: String,
    note: String,
    docs: BTreeMap<String, String>,
    state: String,
    #[serde(default)]
    approval: Option<crate::access::Approval>,
}

/// What a person signs to accept an intent.
pub(crate) const ACCEPT: &str = "theDB accept";

/// What the person's signature of accepting intent `id` covers: its id, its line, and each doc with the version it
/// brings.
pub(crate) fn accept_fields(id: &str, i: &Intent) -> Vec<Vec<u8>> {
    let mut f = vec![id.as_bytes().to_vec(), i.line.clone().unwrap_or_default().into_bytes()];
    for (doc, version) in &i.docs {
        f.push(doc.as_bytes().to_vec());
        f.push(version.as_bytes().to_vec());
    }
    f
}

impl TheDB {
    /// A new intent, in draft, on `line` (made by an agent there; `None`: on main, opened by a person). Returns its id.
    pub fn intent_new(&self, line: Option<&str>, title: &str, why: &str, done_when: &str) -> Result<String> {
        if title.trim().is_empty() {
            return Err("an intent needs a title".into());
        }
        let i = Intent {
            title: title.into(),
            why: why.into(),
            done_when: done_when.into(),
            tasks: vec![],
            line: line.map(str::to_string),
            docs: BTreeMap::new(),
            state: State::Draft,
            reason: None,
            approval: None,
        };
        let id = crate::new_id();
        self.save_intent(&id, &i)?;
        Ok(id)
    }

    /// Every intent on every line and on main, each once, with its id, newest first.
    pub fn intents(&self) -> Result<Vec<(String, Intent)>> {
        let mut out = Vec::new();
        let mut seen = std::collections::BTreeSet::new();
        // read first and the store's lock let go: each intent is read with the lock again
        let heads = sql::intent_heads(&self.sql())?;
        for (id, _) in heads {
            if seen.insert(id.clone())
                && let Ok(i) = self.intent(&id)
            {
                out.push((id, i));
            }
        }
        Ok(out)
    }

    /// Intent `id`, where it is now.
    pub fn intent(&self, id: &str) -> Result<Intent> {
        let at = self.intent_branch(id)?;
        let on = (at != crate::MAIN).then_some(at.as_str());
        read(&self.doc_seen(on, id)?).ok_or_else(|| format!("{id} is no intent"))
    }

    /// Where intent `id` is read: main once it is closed there; else its newest version, on a line or on main.
    fn intent_branch(&self, id: &str) -> Result<String> {
        let at: Vec<String> = sql::intent_heads(&self.sql())?.into_iter().filter(|(i, _)| i == id).map(|(_, b)| b).collect();
        if at.iter().any(|b| b == crate::MAIN) && self.doc_seen(None, id).ok().and_then(|d| read(&d)).is_some_and(|i| !i.state.is_open()) {
            return Ok(crate::MAIN.into());
        }
        at.into_iter().next().ok_or_else(|| format!("no intent {id}"))
    }

    /// Keeps intent `id` where it belongs: on its line while open, on main when it has none; a closed one on its line
    /// (if it is still there) and on main, as main's history.
    fn save_intent(&self, id: &str, i: &Intent) -> Result<()> {
        let at = self.intent_branch(id).ok();
        let (seen, edit);
        let doc: &loro::LoroDoc = match &at {
            Some(b) => {
                seen = self.doc_seen((b != crate::MAIN).then_some(b.as_str()), id)?;
                &seen
            }
            None => {
                edit = self.edit(id)?;
                &edit
            }
        };
        let meta = doc.get_map("meta");
        meta.insert("kind", "intent").map_err(err)?;
        meta.insert("name", i.title.as_str()).map_err(err)?;
        doc.get_map("intent").insert("it", serde_json::to_string(i).map_err(err)?).map_err(err)?;
        let line = i.line.as_deref().filter(|l| self.branches().is_ok_and(|b| b.iter().any(|x| x == l)));
        if i.state.is_open() {
            return self.commit_on(line, id, doc).map(|_| ());
        }
        if let Some(l) = line {
            self.commit_on(Some(l), id, doc)?;
        }
        self.commit_on(None, id, doc).map(|_| ())
    }

    /// An agent takes up intent `id` on its `line`.
    pub fn intent_take(&self, id: &str, line: &str) -> Result<()> {
        let mut i = self.intent(id)?;
        if !i.state.is_open() {
            return Err(format!("the intent is {} already", i.state.name()));
        }
        if i.line.as_deref().is_some_and(|l| l != line) {
            return Err(format!("the intent is worked on {} already", i.line.unwrap_or_default()));
        }
        i.line = Some(line.into());
        if i.state == State::Draft {
            i.state = State::Building;
        }
        self.save_intent(id, &i)
    }

    /// Adds a task to intent `id`'s board. Returns its number (from 1).
    pub fn intent_task(&self, id: &str, text: &str) -> Result<usize> {
        let mut i = self.open_intent(id)?;
        i.tasks.push(Task { text: text.into(), done: false });
        self.save_intent(id, &i)?;
        Ok(i.tasks.len())
    }

    /// Ticks (or unticks) task `n` (from 1) of intent `id`.
    pub fn intent_tick(&self, id: &str, n: usize, done: bool) -> Result<()> {
        let mut i = self.open_intent(id)?;
        let t = i.tasks.get_mut(n.wrapping_sub(1)).ok_or_else(|| format!("no task {n}"))?;
        t.done = done;
        self.save_intent(id, &i)
    }

    /// Moves intent `id` to draft or building, the states its agent sets; `reason` says why when it goes back.
    pub fn intent_state(&self, id: &str, state: State, reason: Option<&str>) -> Result<()> {
        if !matches!(state, State::Draft | State::Building) {
            return Err(format!("an intent becomes {} by its checks, `ready` or a person, not by hand", state.name()));
        }
        let mut i = self.open_intent(id)?;
        i.state = state;
        i.reason = reason.map(str::to_string);
        self.save_intent(id, &i)
    }

    /// Intent `id` is ready: the versions its line changed are taken as they are now, and it waits for a person.
    pub fn intent_ready(&self, id: &str) -> Result<()> {
        let mut i = self.open_intent(id)?;
        if i.state == State::Proposal {
            return Err("the intent waits for a person already".into());
        }
        let line = i.line.clone().ok_or("the intent has no line: an agent takes it up first")?;
        let mut docs = BTreeMap::new();
        for (doc, h) in self.changed_on(&line)? {
            if !matches!(self.meta_of(&self.doc_at(h)?).0.as_str(), "intent" | "proposal") {
                docs.insert(doc, h.to_hex().to_string());
            }
        }
        if docs.is_empty() {
            return Err(format!("the line {line} changes nothing"));
        }
        i.docs = docs;
        i.state = State::Proposal;
        i.reason = None;
        self.save_intent(id, &i)
    }

    /// An intent for what `line` changes, ready at once: how the host proposes its builds. Returns its id.
    pub fn propose(&self, line: &str, title: &str) -> Result<String> {
        let id = self.intent_new(Some(line), title, "", "")?;
        self.intent_ready(&id)?;
        Ok(id)
    }

    fn open_intent(&self, id: &str) -> Result<Intent> {
        let i = self.intent(id)?;
        if !i.state.is_open() {
            return Err(format!("the intent is {} already", i.state.name()));
        }
        Ok(i)
    }

    /// Accepts intent `id`: its versions, merged with what main holds now, become main's. A person accepts it in
    /// theOS; it is signed by the host or the master, never by an agent. In a store with a person (`access`), the
    /// person at this Mac signs it too, by Touch ID or the login password, and the signature is kept in the intent:
    /// whoever reads the host's key from the Keychain still cannot accept. One merge at a time.
    pub fn accept(&self, id: &str) -> Result<()> {
        let mut i = self.intent(id)?;
        if i.state != State::Proposal {
            return Err(format!("the intent is {}, not a proposal", i.state.name()));
        }
        self.is_master_or_host()?;
        let _lock = Lock::take(&self.dir().join("merge.lock"))?;
        let versions: Vec<(String, Hash)> = i.docs.iter().map(|(d, v)| Ok((d.clone(), v.parse().map_err(err)?))).collect::<Result<_>>()?;
        // what Loro would settle silently is refused out loud: the agent syncs its line, settles it, proposes again
        let conflicts = self.conflicts(&versions)?;
        if !conflicts.is_empty() {
            return Err(format!("the intent conflicts with main ({}): {}", conflicts.len(), conflicts.iter().map(|c| c.to_string()).collect::<Vec<_>>().join("; ")));
        }
        if !self.persons()?.is_empty() {
            let fields = accept_fields(id, &i);
            let a = self.approve(ACCEPT, &fields, &format!("accept “{}” into main", i.title))?;
            if !self.approved(&a, ACCEPT, &fields)? {
                return Err("the person's signature does not hold".into());
            }
            i.approval = Some(a);
        }
        self.merge_into_main(&versions)?;
        i.state = State::Merged;
        self.save_intent(id, &i)
    }

    /// Refuses intent `id`: main stays as it is; the line keeps its work.
    pub fn refuse(&self, id: &str) -> Result<()> {
        let mut i = self.open_intent(id)?;
        self.is_master_or_host()?;
        i.state = State::Refused;
        self.save_intent(id, &i)
    }
}

fn read(doc: &loro::LoroDoc) -> Option<Intent> {
    let text = |map: &str| doc.get_map(map).get("it")?.into_value().ok()?.into_string().ok().map(|s| s.to_string());
    if let Some(t) = text("intent") {
        return serde_json::from_str(&t).ok();
    }
    let l: Legacy = serde_json::from_str(&text("proposal")?).ok()?;
    Some(Intent {
        title: l.note,
        why: String::new(),
        done_when: String::new(),
        tasks: vec![],
        line: Some(l.branch),
        docs: l.docs,
        state: match l.state.as_str() {
            "Merged" => State::Merged,
            "Refused" => State::Refused,
            _ => State::Proposal,
        },
        reason: None,
        approval: l.approval,
    })
}

/// A lock held while it lives: a file made only if it does not exist. A holder whose process is gone is no holder.
struct Lock(PathBuf);

impl Lock {
    fn take(path: &Path) -> Result<Lock> {
        for _ in 0..2 {
            match std::fs::OpenOptions::new().write(true).create_new(true).open(path) {
                Ok(mut f) => {
                    use std::io::Write;
                    let _ = write!(f, "{}", std::process::id());
                    return Ok(Lock(path.into()));
                }
                Err(_) => {
                    let pid = std::fs::read_to_string(path).unwrap_or_default();
                    let alive = std::process::Command::new("kill").args(["-0", pid.trim()]).status().is_ok_and(|s| s.success());
                    if alive {
                        return Err(format!("another merge runs (process {}); one at a time", pid.trim()));
                    }
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        Err("the merge lock could not be taken".into())
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

impl TheDB {
    /// Brings every intent of the store in `dir` (one composted or archived) onto this store's main, as it stood there:
    /// the history of what was proposed, accepted and refused. Intents this store has are left as they are. Returns
    /// how many came.
    pub fn intents_from(&self, dir: &Path) -> Result<usize> {
        let old = TheDB::open_on(dir, None)?;
        let have: std::collections::BTreeSet<String> = self.intents()?.into_iter().map(|(id, _)| id).collect();
        let mut n = 0;
        for (id, _) in old.intents()? {
            if have.contains(&id) {
                continue;
            }
            let at = old.intent_branch(&id)?;
            let doc = old.doc_seen((at != crate::MAIN).then_some(at.as_str()), &id)?;
            self.commit_on(None, &id, &doc)?;
            n += 1;
        }
        Ok(n)
    }
}
