//! A doc whose content is a JSON object is kept as a Loro map, not as text: each key its own entry, nested objects
//! as nested maps, arrays as lists. Two branches that add the same key then merge into one key (the later write
//! wins), and two that append to a list both keep their entry; as text, the same merge once left a key twice in the
//! root doc, which no longer parsed. Read back, the map is written out as JSON with its keys in order.

use crate::{Result, err};
use loro::{Container, LoroDoc, LoroList, LoroMap, LoroValue, ValueOrContainer};
use serde_json::Value;

/// Where a doc says its content is the map `json` (in its map `file`).
const FLAG: &str = "json";

fn is_json(doc: &LoroDoc) -> bool {
    doc.get_map("file").get(FLAG).is_some()
}

/// The doc's content as text: the map written out as JSON, or its text.
pub fn read(doc: &LoroDoc) -> String {
    if is_json(doc) {
        let mut s = serde_json::to_string_pretty(&from_loro(&doc.get_map("json").get_deep_value())).unwrap_or_default();
        s.push('\n');
        return s;
    }
    doc.get_text("text").to_string()
}

/// Makes `text` the doc's content, as an edit of what it holds. Whether anything changed.
pub fn write(doc: &LoroDoc, text: &str) -> Result<bool> {
    let t = doc.get_text("text");
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(want)) => {
            let map = doc.get_map("json");
            let want = Value::Object(want);
            if is_json(doc) && from_loro(&map.get_deep_value()) == want {
                return Ok(false);
            }
            apply(&map, &want)?;
            if !is_json(doc) {
                doc.get_map("file").insert(FLAG, true).map_err(err)?;
                let n = t.len_unicode();
                if n > 0 {
                    t.delete(0, n).map_err(err)?;
                }
            }
            Ok(true)
        }
        _ => {
            if !is_json(doc) && t.to_string() == text {
                return Ok(false);
            }
            if is_json(doc) {
                doc.get_map("file").delete(FLAG).map_err(err)?;
                doc.get_map("json").clear().map_err(err)?;
            }
            t.update(text, Default::default()).map_err(err)?;
            Ok(true)
        }
    }
}

/// After a merge: a doc that is a map on one side and was still edited as text on the other (a branch made before
/// its doc became a map) has both. The text's keys are brought into the map (none is taken away), and the text goes.
pub fn heal(doc: &LoroDoc) -> Result<()> {
    let t = doc.get_text("text");
    if !is_json(doc) || t.len_unicode() == 0 {
        return Ok(());
    }
    if let Ok(v @ Value::Object(_)) = serde_json::from_str::<Value>(&t.to_string()) {
        apply_with(&doc.get_map("json"), &v, false)?;
    }
    t.delete(0, t.len_unicode()).map_err(err)
}

/// Makes the map hold the object `want`, changing only what differs.
fn apply(map: &LoroMap, want: &Value) -> Result<()> {
    apply_with(map, want, true)
}

/// As `apply`; with `exact` off, keys the map has and `want` lacks stay.
fn apply_with(map: &LoroMap, want: &Value, exact: bool) -> Result<()> {
    let Value::Object(want) = want else { return Ok(()) };
    let Value::Object(have) = from_loro(&map.get_deep_value()) else { return Ok(()) };
    for k in have.keys().filter(|k| exact && !want.contains_key(*k)) {
        map.delete(k).map_err(err)?;
    }
    for (k, v) in want {
        if have.get(k) == Some(v) {
            continue;
        }
        match v {
            Value::Object(_) => {
                let child = match map.get(k) {
                    Some(ValueOrContainer::Container(Container::Map(m))) => m,
                    _ => map.insert_container(k, LoroMap::new()).map_err(err)?,
                };
                apply_with(&child, v, exact)?;
            }
            Value::Array(a) => {
                let list = match map.get(k) {
                    Some(ValueOrContainer::Container(Container::List(l))) => l,
                    _ => map.insert_container(k, LoroList::new()).map_err(err)?,
                };
                apply_list(&list, a)?;
            }
            _ => map.insert(k, to_loro(v)).map_err(err)?,
        }
    }
    Ok(())
}

/// Makes the list hold `want`: what both ends share stays, the middle is replaced, so an entry added at the end on
/// one branch and another on a second branch are both kept.
fn apply_list(list: &LoroList, want: &[Value]) -> Result<()> {
    let have = match from_loro(&list.get_deep_value()) {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    let head = have.iter().zip(want).take_while(|(a, b)| a == b).count();
    let tail = have[head..].iter().rev().zip(want[head..].iter().rev()).take_while(|(a, b)| a == b).count();
    let gone = have.len() - head - tail;
    if gone > 0 {
        list.delete(head, gone).map_err(err)?;
    }
    for (i, v) in want[head..want.len() - tail].iter().enumerate() {
        list.insert(head + i, to_loro(v)).map_err(err)?;
    }
    Ok(())
}

fn to_loro(v: &Value) -> LoroValue {
    match v {
        Value::Null => LoroValue::Null,
        Value::Bool(b) => LoroValue::from(*b),
        Value::Number(n) => match n.as_i64() {
            Some(i) => LoroValue::from(i),
            None => LoroValue::from(n.as_f64().unwrap_or(0.0)),
        },
        Value::String(s) => LoroValue::from(s.as_str()),
        Value::Array(a) => LoroValue::from(a.iter().map(to_loro).collect::<Vec<_>>()),
        Value::Object(o) => LoroValue::from(o.iter().map(|(k, v)| (k.clone(), to_loro(v))).collect::<std::collections::HashMap<String, LoroValue>>()),
    }
}

pub(crate) fn from_loro(v: &LoroValue) -> Value {
    match v {
        LoroValue::Bool(b) => Value::Bool(*b),
        LoroValue::I64(i) => Value::from(*i),
        LoroValue::Double(f) => serde_json::Number::from_f64(*f).map(Value::Number).unwrap_or(Value::Null),
        LoroValue::String(s) => Value::String(s.to_string()),
        LoroValue::List(l) => Value::Array(l.iter().map(from_loro).collect()),
        LoroValue::Map(m) => Value::Object(m.iter().map(|(k, v)| (k.to_string(), from_loro(v))).collect()),
        _ => Value::Null,
    }
}

/// Everything a doc holds, in every container, as one JSON value: what `fresh` compares and what is searched for the
/// ids and hashes a doc names.
pub(crate) fn whole(doc: &LoroDoc) -> Value {
    from_loro(&doc.get_deep_value())
}

/// Every string in `v`: the keys and the values, at any depth.
pub(crate) fn strings(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => out.push(s.clone()),
        Value::Array(a) => a.iter().for_each(|x| strings(x, out)),
        Value::Object(o) => {
            for (k, x) in o {
                out.push(k.clone());
                strings(x, out);
            }
        }
        _ => {}
    }
}
