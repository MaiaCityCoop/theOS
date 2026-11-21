//! The agent's code, in Rhai: run with the `theos::` functions (`execute`) or over the catalogue (`search`), and
//! nothing else. No files, no network, no imports, no `eval`; limits on operations, time, call depth and sizes. What
//! the code prints comes back with its result, never on the server's own output (which is the protocol).

use crate::Session;
use crate::ops::{OPS, Op};
use rhai::{Dynamic, Engine, EvalAltResult, FuncRegistration, Module, Position};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

/// How long one script may run.
pub const TIME: Duration = Duration::from_secs(20);

/// What a script gave: its last expression, what it printed, or why it stopped.
pub struct Ran {
    pub value: Value,
    pub printed: Vec<String>,
    pub error: Option<String>,
}

/// A Rhai engine with nothing but the language, under limits; what it prints is kept in `printed`.
fn engine(printed: Rc<RefCell<Vec<String>>>) -> Engine {
    let mut e = Engine::new();
    e.set_module_resolver(rhai::module_resolvers::DummyModuleResolver::new());
    e.disable_symbol("eval");
    e.set_max_operations(10_000_000);
    e.set_max_call_levels(32);
    e.set_max_expr_depths(64, 32);
    e.set_max_string_size(8_000_000);
    e.set_max_array_size(500_000);
    e.set_max_map_size(500_000);
    let p = printed.clone();
    e.on_print(move |s| p.borrow_mut().push(s.to_string()));
    e.on_debug(move |s, _, _| printed.borrow_mut().push(s.to_string()));
    let start = Instant::now();
    e.on_progress(move |_| (start.elapsed() > TIME).then(|| Dynamic::from(format!("the script ran longer than {} seconds", TIME.as_secs()))));
    e
}

/// The `theos::` functions, one for each operation, as the agent of `session`.
fn theos(session: Rc<Session>) -> Module {
    let mut m = Module::new();
    for op in OPS {
        let s = session.clone();
        let f = FuncRegistration::new(op.name);
        match op.params.len() {
            0 => _ = f.set_into_module(&mut m, move || call(&s, op, vec![])),
            1 => _ = f.set_into_module(&mut m, move |a: Dynamic| call(&s, op, vec![a])),
            2 => _ = f.set_into_module(&mut m, move |a: Dynamic, b: Dynamic| call(&s, op, vec![a, b])),
            3 => _ = f.set_into_module(&mut m, move |a: Dynamic, b: Dynamic, c: Dynamic| call(&s, op, vec![a, b, c])),
            n => panic!("theos::{} takes {n} arguments: at most 3", op.name),
        }
    }
    m
}

/// One call of `op` from a script: its arguments as JSON, its result back as Rhai's, its error thrown.
fn call(s: &Session, op: &Op, args: Vec<Dynamic>) -> Result<Dynamic, Box<EvalAltResult>> {
    let values: Vec<Value> = args.iter().map(rhai::serde::from_dynamic::<Value>).collect::<Result<_, _>>()?;
    let out = (op.run)(s, &values).map_err(|e| Box::new(EvalAltResult::ErrorRuntime(format!("theos::{}: {e}", op.name).into(), Position::NONE)))?;
    rhai::serde::to_dynamic(&out)
}

/// The catalogue: one map for each operation.
pub fn catalogue() -> Value {
    Value::Array(OPS.iter().map(|op| json!({ "name": format!("theos::{}", op.name), "group": op.group, "signature": op.signature(), "doc": op.doc, "cap": op.cap })).collect())
}

/// Runs `code` with the `theos::` functions, as the agent of `session`.
pub fn execute(session: Rc<Session>, code: &str) -> Ran {
    let printed = Rc::new(RefCell::new(Vec::new()));
    let mut e = engine(printed.clone());
    e.register_static_module("theos", theos(session).into());
    run(&e, code, printed)
}

/// Runs `code` over `catalogue()`; it can call no operation.
pub fn search(code: &str) -> Ran {
    let printed = Rc::new(RefCell::new(Vec::new()));
    let mut e = engine(printed.clone());
    let all = rhai::serde::to_dynamic(catalogue()).unwrap_or_default();
    e.register_fn("catalogue", move || all.clone());
    run(&e, code, printed)
}

fn run(e: &Engine, code: &str, printed: Rc<RefCell<Vec<String>>>) -> Ran {
    let (value, error) = match e.eval::<Dynamic>(code) {
        Ok(d) if d.is_unit() => (Value::Null, None),
        Ok(d) => match rhai::serde::from_dynamic::<Value>(&d) {
            Ok(v) => (v, None),
            Err(err) => (Value::Null, Some(err.to_string())),
        },
        Err(err) => (Value::Null, Some(err.to_string())),
    };
    Ran { value, printed: printed.take(), error }
}
