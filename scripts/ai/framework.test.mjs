import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTask, doctor, handoff, hookPayload } from "./control-room.mjs";
import {
  atomic,
  context,
  eligible,
  hash,
  install,
  json,
  loadConfig,
  mergeManaged,
  snapshot,
  validateTask,
  verifyStructure,
  within,
} from "./core.mjs";

const cli = fileURLToPath(new URL("./control-room.mjs", import.meta.url));
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "coach framework ü ")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const init = spawnSync("git", ["init", "--quiet"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(init.status, 0, init.stderr);
  const put = (p, s) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), s);
  };
  put(".gitignore", ".codex/local/\nignored.txt\nnode_modules/\n");
  put("src/space ü.txt", "navigation\nsecond navigation\nthird navigation\n");
  put("runner.mjs", 'console.log("ok")');
  const command = {
    runtime: "node",
    args: ["runner.mjs"],
    entry: "runner.mjs",
    cwd: ".",
    timeoutMs: 5000,
    reviewed: true,
    parser: "exit",
    evidence: "runner.mjs",
  };
  put(
    ".codex/project.json",
    json({
      schemaVersion: 1,
      name: "fixture",
      scopes: ["."],
      commands: { smoke: command, "framework-tests": command },
    }),
  );
  return { root, put, command };
}
function invoke(root, args, cwd = root) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true,
  });
}
function run(t, script, changes = {}) {
  const f = fixture(t);
  f.put("runner.mjs", script);
  const c = loadConfig(f.root);
  Object.assign(c.commands.smoke, changes);
  f.put(".codex/project.json", json(c));
  const r = invoke(f.root, ["check", "smoke"]);
  return { ...f, process: r, result: JSON.parse(r.stdout) };
}
test("root and subdirectory invocation; paths with spaces and Unicode", (t) => {
  const { root } = fixture(t);
  assert.equal(invoke(root, ["doctor"]).status, 0);
  assert.equal(invoke(root, ["doctor"], path.join(root, "src")).status, 0);
  assert.equal(
    JSON.parse(invoke(root, ["context", "--file", "src/space ü.txt"]).stdout).lines.length,
    4,
  );
});
test("invalid options, types, unknown commands and traversal fail", (t) => {
  const { root } = fixture(t);
  for (const args of [
    ["bad"],
    ["context", "--limit", "NaN"],
    ["context", "--term"],
    ["context", "--scope", "../"],
    ["check", "unknown"],
    ["doctor", "--repair"],
  ])
    assert.notEqual(invoke(root, args).status, 0);
  for (const p of ["../escape", "C:\\elsewhere", "a/../../b", "/tmp/a", "a:stream"])
    assert.throws(() => within(root, p));
  assert.throws(() => context(root, { terms: [7] }));
});
test("optional capabilities and missing command dependency are explicit", (t) => {
  const { root, put } = fixture(t);
  const c = loadConfig(root);
  c.commands.smoke.entry = "missing.mjs";
  c.commands.smoke.args = ["missing.mjs"];
  put(".codex/project.json", json(c));
  assert.equal(doctor(root).commands.find((c) => c.id === "smoke").available, false);
  assert.match(doctor(root).capabilities.hooks, /manually/);
  const r = invoke(root, ["check", "smoke"]);
  assert.notEqual(r.status, 0);
  assert.equal(JSON.parse(r.stdout).status, "BLOCKED");
});
test("sensitive/generated/binary/large/ignored paths excluded; ranges and pagination expand retrieval", (t) => {
  const { root, put } = fixture(t);
  for (const p of [
    ".env",
    ".env.local",
    ".npmrc",
    "secrets/password.txt",
    "credentials.json",
    "artifacts/screen.txt",
    "dist/generated.js",
    ".codex/local/private.txt",
    ".codex/tasks/done.json",
    "ignored.txt",
  ])
    put(p, "navigation private");
  put("src/binary.bin", "\0navigation");
  put("src/huge.txt", "navigation".repeat(130000));
  const r = context(root, { terms: ["navigation"], limit: 1 });
  assert.deepEqual(
    r.candidates.map((c) => c.path),
    ["src/space ü.txt"],
  );
  assert.equal(r.excludedLargeOrBinary, 2);
  assert.throws(() => context(root, { file: ".env", allowIgnored: true }));
  assert.throws(() => context(root, { file: "ignored.txt" }));
  assert.equal(context(root, { file: "ignored.txt", allowIgnored: true }).totalLines, 1);
  put("src/two.txt", "navigation");
  assert.equal(context(root, { terms: ["navigation"], limit: 1 }).truncated, true);
  assert.equal(context(root, { terms: ["navigation"], limit: 1, offset: 1 }).candidates.length, 1);
  assert.equal(context(root, { file: "src/space ü.txt", start: 2, lines: 1 }).truncated, true);
});
test("symlink/junction managed write and retrieval escapes rejected where supported", (t) => {
  const { root } = fixture(t),
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "coach outside "));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  try {
    fs.symlinkSync(
      outside,
      path.join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (e) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(e.code)) {
      t.skip(`Symlink not supported: ${e.code}`);
      return;
    }
    throw e;
  }
  assert.throws(() => atomic(root, "escape/user.txt", "no"));
  assert.throws(() => context(root, { file: "escape/user.txt", allowIgnored: true }));
  assert.equal(fs.existsSync(path.join(outside, "user.txt")), false);
});
test("atomic artifact collision preserves preexisting user sentinel", (t) => {
  const { root, put } = fixture(t);
  put("sentinel.txt", "user work");
  assert.throws(() => atomic(root, "sentinel.txt", "replacement"));
  assert.equal(fs.readFileSync(path.join(root, "sentinel.txt"), "utf8"), "user work");
});
test("nonzero exit and stderr captured with compact evidence and full local logs", (t) => {
  const {
    root,
    result,
    process: p,
  } = run(t, 'console.log("a".repeat(5000)); console.error("specific failure"); process.exit(3)');
  assert.equal(p.status, 1);
  assert.equal(result.status, "FAIL");
  assert.equal(result.exitCode, 3);
  assert.match(result.summary, /specific failure/);
  assert.ok(result.summary.length <= 2200);
  assert.ok(fs.statSync(path.join(root, result.artifacts.stdout)).size > 5000);
  assert.match(
    fs.readFileSync(path.join(root, result.artifacts.stderr), "utf8"),
    /specific failure/,
  );
});
test("timeout is BLOCKED, never PASS", (t) => {
  const { result, process: p } = run(t, "setInterval(() => {},1000)", { timeoutMs: 80 });
  assert.equal(p.status, 1);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.error, "ETIMEDOUT");
});
test("zero tests, malformed reports, and failed reports cannot pass", (t) => {
  for (const [script, parser, status] of [
    ['console.log("# tests 0\\n# pass 0\\n# fail 0")', "tap", "BLOCKED"],
    ['console.log("not json")', "vitest-json", "UNKNOWN"],
    [
      "console.log(JSON.stringify({numTotalTests:2,numPassedTests:1,numFailedTests:1}))",
      "vitest-json",
      "FAIL",
    ],
    ['console.log("# tests 1\\n# pass 1\\n# fail 0")', "tap", "PASS"],
  ])
    assert.equal(run(t, script, { parser }).result.status, status);
});
test("source modified during validation invalidates a zero-exit check", (t) => {
  const { result } = run(t, 'import fs from "node:fs";fs.writeFileSync("src/new.txt","changed")');
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.stale, true);
});
test("registry rejects unreviewed commands and source is fingerprinted before and after dirty edits", (t) => {
  const { root, put } = fixture(t);
  const before = snapshot(root);
  put("src/space ü.txt", "dirty changed");
  assert.notEqual(snapshot(root).fingerprint, before.fingerprint);
  const c = loadConfig(root);
  c.commands.smoke.reviewed = false;
  put(".codex/project.json", json(c));
  assert.throws(() => loadConfig(root));
});
test("task schema, baseline delta, skipped checks, acceptance and stale evidence", (t) => {
  const { root, put } = fixture(t);
  const created = createTask(root, { id: "sample", request: "Keep behavior; adjust navigation." });
  assert.throws(() => createTask(root, { id: "sample", request: "overwrite" }));
  const task = JSON.parse(fs.readFileSync(path.join(root, created.task), "utf8"));
  task.validation = ["smoke"];
  put(created.task, json(task));
  assert.equal(handoff(root, created.task).checks[0].status, "SKIPPED");
  put("src/space ü.txt", "requested change");
  assert.equal(invoke(root, ["check", "smoke"]).status, 0);
  assert.equal(handoff(root, created.task).status, "implemented-unverified");
  task.acceptance = [
    {
      text: "Requested change",
      status: "met",
      evidence: "Human inspected requested navigation outcome.",
    },
  ];
  put(created.task, json(task));
  const fresh = handoff(root, created.task);
  assert.equal(fresh.status, "verified");
  assert.equal(fresh.affectedPaths.length, 1);
  const evidence = fs.readFileSync(path.join(root, fresh.checks[0].artifacts.stdout));
  fs.unlinkSync(path.join(root, fresh.checks[0].artifacts.stdout));
  assert.equal(handoff(root, created.task).checks[0].status, "UNKNOWN");
  put(fresh.checks[0].artifacts.stdout, "tampered");
  assert.equal(handoff(root, created.task).checks[0].status, "UNKNOWN");
  put(fresh.checks[0].artifacts.stdout, evidence);
  assert.equal(handoff(root, created.task).artifact, fresh.artifact);
  put("src/space ü.txt", "later edit");
  assert.equal(handoff(root, created.task).checks[0].stale, true);
  assert.equal(handoff(root, created.task).status, "implemented-unverified");
  task.role = "unbounded-worker";
  assert.throws(() => validateTask(root, task));
});
test("rerun/merge preserves unmanaged sentinel, rejects customization without partial writes", (t) => {
  const { root, put } = fixture(t);
  put("AGENTS.md", "User rules\r\n");
  const bundle = {
    version: "2.0.0",
    files: [
      { path: "AGENTS.md", section: "router", content: "Managed router" },
      { path: ".codex/README.md", content: "Help\n" },
    ],
  };
  assert.equal(install(root, bundle).changed.length, 2);
  const before = snapshot(root).fingerprint;
  assert.equal(install(root, bundle).changed.length, 0);
  assert.equal(snapshot(root).fingerprint, before);
  assert.ok(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8").startsWith("User rules\r\n"));
  put(".codex/README.md", "User customization\n");
  bundle.files[0].content = "Next router";
  assert.throws(() => install(root, bundle));
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /Managed router/);
  assert.equal(
    fs.readFileSync(path.join(root, ".codex/README.md"), "utf8"),
    "User customization\n",
  );
  assert.throws(() =>
    install(root, { version: "2.0.0", files: [{ path: "src/product.ts", content: "no" }] }),
  );
  assert.equal(mergeManaged("old", "new", hash("old")).text, "new");
});
test("manifest, configuration and knowledge-map targets are verified", (t) => {
  const { root, put } = fixture(t);
  install(root, {
    version: "2.0.0",
    files: [{ path: ".codex/MAP.md", content: "[source](../src/space ü.txt)\n" }],
  });
  assert.equal(verifyStructure(root).knowledgeLinks, 1);
  put("src/space ü.txt", "changed");
  assert.equal(verifyStructure(root).status, "PASS");
  fs.unlinkSync(path.join(root, "src/space ü.txt"));
  assert.throws(() => verifyStructure(root));
});
test("SessionStart handler validates payload, bounds context and stays read-only", (t) => {
  const { root } = fixture(t),
    before = snapshot(root).fingerprint;
  const payload = {
    session_id: "fixture",
    cwd: path.join(root, "src"),
    hook_event_name: "SessionStart",
    source: "startup",
  };
  const output = hookPayload(root, payload);
  assert.ok(output.hookSpecificOutput.additionalContext.length < 600);
  assert.equal(snapshot(root).fingerprint, before);
  assert.throws(() => hookPayload(root, { ...payload, source: "wrong" }));
  const p = spawnSync(process.execPath, [cli, "hook-session-start"], {
    cwd: root,
    input: json(payload),
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  assert.equal(p.status, 0, p.stderr);
  assert.equal(JSON.parse(p.stdout).hookSpecificOutput.hookEventName, "SessionStart");
});

test("path aliases cannot bypass private exclusions; profile source participates in fingerprints", (t) => {
  const { root, put } = fixture(t);
  for (const p of [
    ".codex/LOCAL/out.txt",
    ".codex//local/out.txt",
    ".codex/./local/out.txt",
    ".NPMRC",
    "./.codex/tasks/done.json",
  ])
    assert.equal(eligible(p), false, p);
  put("src/main/profiles/profile-store.ts", "profile source");
  assert.equal(
    context(root, { terms: ["profile source"] }).candidates[0].path,
    "src/main/profiles/profile-store.ts",
  );
  const before = snapshot(root).fingerprint;
  put("src/main/profiles/profile-store.ts", "profile changed");
  assert.notEqual(snapshot(root).fingerprint, before);
});
test("handoff preserves investigation intent without claiming implementation", (t) => {
  const { root } = fixture(t);
  const created = createTask(root, {
    id: "investigate",
    request: "Explain the issue",
    mode: "investigation",
  });
  const result = handoff(root, created.task);
  assert.equal(result.mode, "investigation");
  assert.equal(result.status, "in-progress");
  assert.deepEqual(result.nonGoals, []);
  assert.deepEqual(result.requiredChanges, []);
});
test("missing Git fails clearly rather than producing empty successful context", (t) => {
  const { root } = fixture(t);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "path"),
  );
  env.PATH = "";
  const p = spawnSync(process.execPath, [cli, "context"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /Git discovery failed/);
});
test("reviewed command resolves its entry point for an independent subproject cwd", (t) => {
  const { root, put } = fixture(t),
    c = loadConfig(root);
  c.commands.smoke.cwd = "src";
  put(".codex/project.json", json(c));
  assert.equal(invoke(root, ["check", "smoke"]).status, 0);
});
test("installed portable hook launcher works from a subdirectory without writes", (t) => {
  const { root, put } = fixture(t);
  put("scripts/ai/control-room.mjs", fs.readFileSync(cli));
  put("scripts/ai/core.mjs", fs.readFileSync(new URL("./core.mjs", import.meta.url)));
  const config = JSON.parse(
    fs.readFileSync(new URL("../../.codex/hooks.json", import.meta.url), "utf8"),
  );
  const command = config.hooks.SessionStart[0].hooks[0].command;
  assert.ok(command.startsWith('node -e "') && command.endsWith('"'));
  const input = json({
    session_id: "launcher",
    cwd: path.join(root, "src"),
    hook_event_name: "SessionStart",
    source: "startup",
  });
  const before = snapshot(root).fingerprint;
  const p = spawnSync(process.execPath, ["-e", command.slice(9, -1)], {
    cwd: path.join(root, "src"),
    input,
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  assert.equal(p.status, 0, p.stderr);
  assert.equal(JSON.parse(p.stdout).hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(snapshot(root).fingerprint, before);
});

test("managed hashes tolerate Git line-ending conversion without rerun churn", () => {
  const first = mergeManaged(null, "one\ntwo\n");
  const rerun = mergeManaged("one\r\ntwo\r\n", "one\ntwo\n", first.hash);
  assert.equal(rerun.changed, false);
  assert.equal(rerun.hash, first.hash);
  assert.equal(rerun.text, "one\r\ntwo\r\n");
});
