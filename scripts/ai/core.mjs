import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const VERSION = "2.0.0";
export const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export function insist(condition, message) {
  if (!condition) throw new Error(message);
}
export function relative(value) {
  insist(
    typeof value === "string" && value.length > 0 && value.length < 2048,
    "Expected relative path",
  );
  const p = value.replaceAll("\\", "/");
  insist(
    !path.isAbsolute(p) &&
      !p.includes(":") &&
      ![...p].some((c) => c.charCodeAt(0) < 32) &&
      !p.split("/").includes(".."),
    "Unsafe path",
  );
  const canonical = path.posix.normalize(p).replace(/\/$/, "") || ".";
  insist(
    canonical === "." ||
      canonical
        .split("/")
        .every(
          (part) => !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part),
        ),
    "Ambiguous platform path",
  );
  return canonical;
}
export function within(root, value) {
  const rel = relative(value),
    target = path.resolve(root, rel);
  insist(target === root || target.startsWith(`${root}${path.sep}`), "Path outside project");
  let current = root;
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) || fs.lstatSync(current, { throwIfNoEntry: false })) {
      insist(!fs.lstatSync(current).isSymbolicLink(), "Symlink/junction path rejected");
    }
  }
  return target;
}
export function findRoot(start = process.cwd()) {
  let current = fs.realpathSync(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".codex/project.json"))) return current;
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    insist(parent !== current, "No selected repository/framework root found");
    current = parent;
  }
}
export function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(within(root, rel), "utf8"));
}
export function atomic(root, rel, content, { replace = false } = {}) {
  const target = within(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = within(root, `${relative(rel)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, content, { flag: "wx" });
    within(root, rel);
    if (replace) fs.renameSync(temp, target);
    else {
      fs.linkSync(temp, target);
      fs.unlinkSync(temp);
    }
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  insist(
    !result.error && result.status === 0,
    `Git discovery failed: ${result.error?.code ?? result.stderr?.slice(0, 300)}`,
  );
  return result.stdout;
}
const excluded =
  /(^|\/)(node_modules|\.git|\.pnpm-store|dist|build|out|release|coverage|artifacts|\.cache|\.vite|\.next|\.package-source|\.coach|browser-profiles?|exports?|dumps?|private|secrets?|credentials?)(\/|$)|^profiles?(\/|$)|(^|\/)\.env(?:\.|$)|(^|\/)(?:auth\.json|credentials\.json|secrets?\.json|tokens?\.json|id_rsa|id_ed25519)(?:$|\.)|\.(?:pem|key|p12|pfx|sqlite|db|log|map)$/i;
export function eligible(rel) {
  rel = relative(rel);
  return (
    !excluded.test(rel) &&
    !/^\.codex\/(local|tasks)(\/|$)/i.test(rel) &&
    !/(^|\/)(\.npmrc|\.netrc|\.pypirc)$/i.test(rel)
  );
}
export function inventory(root) {
  return [
    ...new Set(
      git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(Boolean),
    ),
  ]
    .filter(eligible)
    .filter((p) => {
      try {
        return fs.lstatSync(within(root, p), { throwIfNoEntry: false })?.isFile();
      } catch (error) {
        if (error.message.includes("Symlink")) return false;
        throw error;
      }
    })
    .sort();
}
export function fileHash(file) {
  const digest = crypto.createHash("sha256"),
    fd = fs.openSync(file, "r"),
    buffer = Buffer.alloc(65536);
  try {
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return digest.digest("hex");
}
export function snapshot(root) {
  const files = Object.fromEntries(inventory(root).map((p) => [p, fileHash(within(root, p))]));
  return { fingerprint: hash(json(files)), files };
}
export function delta(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((p) => before[p] !== after[p])
    .map((p) => ({
      path: p,
      change: !(p in before) ? "added" : !(p in after) ? "deleted" : "modified",
    }));
}
export function commandEntry(root, rel) {
  const lexical = path.resolve(root, relative(rel));
  if (!fs.existsSync(lexical)) return within(root, rel);
  const resolved = fs.realpathSync(lexical);
  insist(
    resolved.startsWith(root + path.sep) && fs.statSync(resolved).isFile(),
    "Command entry escapes repository or is not a file",
  );
  return resolved;
}
export function loadConfig(root) {
  const c = readJson(root, ".codex/project.json");
  insist(
    c.schemaVersion === 1 && typeof c.name === "string" && Array.isArray(c.scopes),
    "Invalid project schema",
  );
  insist(
    c.commands && typeof c.commands === "object" && !Array.isArray(c.commands),
    "Invalid command registry",
  );
  for (const s of c.scopes) {
    insist(typeof s === "string", "Invalid scope");
    within(root, s);
  }
  for (const [id, v] of Object.entries(c.commands)) {
    insist(
      /^[a-z][a-z0-9-]{0,60}$/.test(id) && v && v.runtime === "node" && v.reviewed === true,
      `Unreviewed/invalid command: ${id}`,
    );
    insist(
      Array.isArray(v.args) &&
        v.args.length > 0 &&
        v.args.every((a) => typeof a === "string" && !a.includes("\0")),
      `Invalid argv: ${id}`,
    );
    within(root, v.cwd);
    commandEntry(root, v.entry);
    within(root, v.evidence);
    insist(["exit", "tap", "vitest-json"].includes(v.parser), `Invalid parser: ${id}`);
    insist(
      Number.isInteger(v.timeoutMs) && v.timeoutMs >= 10 && v.timeoutMs <= 600000,
      `Invalid timeout: ${id}`,
    );
    insist(v.args.includes(v.entry), `Entry absent from argv: ${id}`);
  }
  return c;
}
export function validateTask(root, t, config = loadConfig(root)) {
  insist(
    t && t.schemaVersion === 1 && /^[a-z0-9][a-z0-9-]{0,60}$/.test(t.id),
    "Invalid task schema/id",
  );
  insist(["controller", "worker"].includes(t.role), "Invalid role");
  insist(
    ["discussion", "investigation", "planning", "implementation"].includes(t.mode),
    "Invalid action mode",
  );
  insist(["micro", "feature", "critical"].includes(t.risk), "Invalid risk");
  insist(
    [
      "in-progress",
      "blocked",
      "implemented-unverified",
      "verified",
      "awaiting-user-review",
    ].includes(t.status),
    "Invalid task status",
  );
  for (const key of ["originalRequest", "goal"])
    insist(
      typeof t[key] === "string" && t[key].length > 0 && t[key].length <= 16000,
      `Invalid ${key}`,
    );
  within(root, t.scope);
  for (const key of [
    "assumptions",
    "requiredChanges",
    "protectedBehavior",
    "nonGoals",
    "validation",
    "pointers",
    "blockingQuestions",
    "dependencies",
    "retrievalGaps",
  ]) {
    insist(
      Array.isArray(t[key]) && t[key].every((v) => typeof v === "string" && v.length <= 4000),
      `Invalid ${key}`,
    );
  }
  insist(
    t.validation.every((id) => Object.hasOwn(config.commands, id)),
    "Unknown validation ID",
  );
  for (const p of t.pointers) within(root, p);
  insist(Array.isArray(t.acceptance) && t.acceptance.length > 0, "Acceptance criteria required");
  for (const a of t.acceptance) {
    insist(
      typeof a.text === "string" &&
        a.text.length > 0 &&
        ["open", "met", "unmet"].includes(a.status) &&
        typeof a.evidence === "string",
      "Invalid acceptance criterion",
    );
    insist(
      a.status !== "met" || a.evidence.trim().length > 0,
      "Met criterion needs attributed evidence",
    );
  }
  insist(Array.isArray(t.visualInputs), "Invalid visual inputs");
  for (const v of t.visualInputs) {
    insist(
      ["current", "desired", "approved", "historical"].includes(v.kind) &&
        typeof v.state === "string",
      "Label visual input",
    );
    within(root, v.path);
  }
  insist(
    t.baseline === null ||
      (typeof t.baseline === "string" &&
        /^\.codex\/local\/baselines\/[a-z0-9-]+\.json$/.test(t.baseline)),
    "Invalid baseline",
  );
  return t;
}
export function context(
  root,
  {
    scope = ".",
    terms = [],
    limit = 15,
    offset = 0,
    file,
    start = 1,
    lines = 60,
    allowIgnored = false,
  } = {},
) {
  insist(
    Array.isArray(terms) &&
      terms.every((t) => typeof t === "string" && t.length <= 200) &&
      terms.length <= 20,
    "Invalid search terms",
  );
  for (const [name, value, max] of [
    ["limit", limit, 100],
    ["offset", offset, 100000],
    ["start", start, 1000000],
    ["lines", lines, 200],
  ])
    insist(
      Number.isInteger(value) && value >= (name === "offset" ? 0 : 1) && value <= max,
      `Invalid ${name}`,
    );
  scope = relative(scope);
  within(root, scope);
  const paths = inventory(root);
  if (file) {
    file = relative(file);
    insist(eligible(file), "Sensitive/generated/private file excluded");
    insist(
      paths.includes(file) || allowIgnored,
      "File ignored or unavailable; explicit --allow-ignored permits non-secret text only",
    );
    const target = within(root, file);
    insist(fs.statSync(target).size <= 1024 * 1024, "Source range requires text file <= 1 MiB");
    const content = fs.readFileSync(target, "utf8");
    insist(!content.includes("\0"), "Binary excluded");
    const all = content.split(/\r?\n/);
    return {
      file,
      start,
      lines: all
        .slice(start - 1, start - 1 + lines)
        .map((s, i) => `${start + i}: ${s.slice(0, 300)}`),
      truncated:
        start - 1 + lines < all.length ||
        all.slice(start - 1, start - 1 + lines).some((s) => s.length > 300),
      totalLines: all.length,
    };
  }
  const lower = terms.map((t) => t.toLowerCase()),
    matches = [];
  let excludedLargeOrBinary = 0;
  for (const p of paths.filter((p) => scope === "." || p === scope || p.startsWith(`${scope}/`))) {
    const target = within(root, p);
    if (fs.statSync(target).size > 1024 * 1024) {
      excludedLargeOrBinary++;
      continue;
    }
    const body = fs.readFileSync(target, "utf8");
    if (body.includes("\0")) {
      excludedLargeOrBinary++;
      continue;
    }
    const hits = body
      .split(/\r?\n/)
      .map((line, i) => ({
        line: i + 1,
        text: line.slice(0, 200),
        truncated: line.length > 200,
        hit: lower.some((t) => line.toLowerCase().includes(t)),
      }))
      .filter((v) => v.hit);
    const score =
      lower.reduce((n, t) => n + (p.toLowerCase().includes(t) ? 10 : 0), 0) +
      Math.min(hits.length, 9);
    if (!lower.length || score)
      matches.push({
        path: p,
        score,
        matches: hits.slice(0, 2).map(({ line, text, truncated }) => ({ line, text, truncated })),
        furtherLineMatches: Math.max(0, hits.length - 2),
      });
  }
  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const config = loadConfig(root);
  return {
    scope,
    candidates: matches.slice(offset, offset + limit),
    total: matches.length,
    offset,
    truncated: offset + limit < matches.length,
    nextOffset: offset + limit < matches.length ? offset + limit : null,
    excludedLargeOrBinary,
    knowledgeMap: ".codex/MAP.md",
    commands: Object.entries(config.commands).map(([id, c]) => ({ id, evidence: c.evidence })),
    dirtyWork: git(root, ["status", "--porcelain=v1", "--untracked-files=normal"]).trim()
      ? "Present: preserve existing work; capture task baseline before edits."
      : "None",
    caveat:
      "Ranked candidates, not a dependency graph. Expand scope/ranges when needed; completed tasks/private artifacts excluded.",
  };
}
export function runCheck(root, id) {
  const config = loadConfig(root),
    command = config.commands[id];
  insist(command, "Unknown reviewed command ID");
  const before = snapshot(root),
    runId = `${id}-${crypto.randomUUID()}`,
    base = `.codex/local/checks/${runId}`;
  const started = new Date().toISOString(),
    startMs = performance.now();
  const argv = command.args.map((arg) =>
    arg === command.entry ? commandEntry(root, command.entry) : arg,
  );
  const record = {
    schemaVersion: 1,
    id: runId,
    commandId: id,
    command: [process.execPath, ...argv],
    cwd: command.cwd,
    started,
    fingerprint: before.fingerprint,
    commandHash: hash(json(command)),
    artifacts: { stdout: `${base}.stdout.log`, stderr: `${base}.stderr.log` },
  };
  atomic(root, record.artifacts.stdout, "");
  atomic(root, record.artifacts.stderr, "");
  const out = fs.openSync(within(root, record.artifacts.stdout), "a"),
    err = fs.openSync(within(root, record.artifacts.stderr), "a");
  let result;
  try {
    if (!fs.existsSync(commandEntry(root, command.entry)))
      result = { status: null, error: { code: "ENOENT" } };
    else
      result = spawnSync(process.execPath, argv, {
        cwd: within(root, command.cwd),
        stdio: ["ignore", out, err],
        timeout: command.timeoutMs,
        windowsHide: true,
        shell: false,
      });
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }
  record.ended = new Date().toISOString();
  record.elapsedMs = Math.round(performance.now() - startMs);
  record.exitCode = result.status;
  record.error = result.error?.code ?? null;
  record.signal = result.signal ?? null;
  const log = (rel) => {
    const target = within(root, rel),
      size = fs.statSync(target).size,
      cap = 8 * 1024 * 1024;
    const fd = fs.openSync(target, "r"),
      buffer = Buffer.alloc(Math.min(size, cap));
    try {
      fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - cap));
    } finally {
      fs.closeSync(fd);
    }
    return { text: buffer.toString("utf8"), size, truncated: size > cap };
  };
  const outLog = log(record.artifacts.stdout),
    errLog = log(record.artifacts.stderr),
    stdout = outLog.text,
    stderr = errLog.text;
  record.artifactHashes = Object.fromEntries(
    Object.entries(record.artifacts).map(([kind, rel]) => [kind, fileHash(within(root, rel))]),
  );
  record.status = result.error ? "BLOCKED" : result.status === 0 ? "PASS" : "FAIL";
  if (record.status === "PASS" && command.parser !== "exit") {
    try {
      insist(!outLog.truncated, "Report exceeds parser limit; full artifact retained");
      if (command.parser === "tap") {
        const tests = /^# tests (\d+)$/m.exec(stdout),
          passes = /^# pass (\d+)$/m.exec(stdout),
          fail = /^# fail (\d+)$/m.exec(stdout);
        insist(tests && passes && fail, "Unrecognized TAP summary");
        record.tests = {
          total: Number(tests[1]),
          passed: Number(passes[1]),
          failed: Number(fail[1]),
        };
      } else {
        const report = JSON.parse(stdout);
        insist(
          Number.isInteger(report.numTotalTests) &&
            Number.isInteger(report.numPassedTests) &&
            Number.isInteger(report.numFailedTests),
          "Invalid Vitest report",
        );
        record.tests = {
          total: report.numTotalTests,
          passed: report.numPassedTests,
          failed: report.numFailedTests,
        };
      }
      insist(
        Object.values(record.tests).every((n) => Number.isInteger(n) && n >= 0) &&
          record.tests.passed + record.tests.failed <= record.tests.total,
        "Inconsistent test counts",
      );
      if (record.tests.failed > 0) record.status = "FAIL";
      else if (record.tests.total === 0 || record.tests.passed === 0) record.status = "BLOCKED";
    } catch {
      record.status = "UNKNOWN";
      record.error = "Result parser failed; inspect full logs";
    }
  }
  record.stale = before.fingerprint !== snapshot(root).fingerprint;
  if (record.stale && record.status === "PASS") record.status = "UNKNOWN";
  record.outputBytes = outLog.size + errLog.size;
  record.summary =
    record.status === "PASS"
      ? "Selected command passed; acceptance criteria still require assessment."
      : (stderr || stdout).slice(-2200) || record.error || "Command failed without output";
  atomic(root, `${base}.json`, json(record));
  return { ...record, record: `${base}.json` };
}
export const markers = (section) => ({
  start:
    section === "ignore" ? "# local-first:ignore:start" : `<!-- local-first:${section}:start -->`,
  end: section === "ignore" ? "# local-first:ignore:end" : `<!-- local-first:${section}:end -->`,
});
export function owned(text, section) {
  if (!section) return text;
  const m = markers(section),
    a = text.indexOf(m.start),
    b = text.indexOf(m.end);
  if (a < 0 && b < 0) return null;
  insist(
    a >= 0 && b > a && text.indexOf(m.start, a + 1) < 0 && text.indexOf(m.end, b + 1) < 0,
    "Invalid/duplicate managed markers",
  );
  return text.slice(a, b + m.end.length);
}
const managedHash = (value) => hash(value.replaceAll("\r\n", "\n"));
export function mergeManaged(existing, incoming, previousHash, section) {
  const next = section
    ? `${markers(section).start}\n${incoming.trim()}\n${markers(section).end}`
    : incoming;
  const current = existing === null ? null : owned(existing, section);
  if (current !== null && managedHash(current) === managedHash(next))
    return { text: existing, hash: managedHash(next), changed: false };
  insist(
    current === null || (previousHash && managedHash(current) === previousHash),
    "Customized managed content: merge required",
  );
  if (!section) return { text: next, hash: managedHash(next), changed: existing !== next };
  const text =
    current === null
      ? `${existing ?? ""}${existing?.endsWith("\n") || !existing ? "" : "\n"}\n${next}\n`
      : existing.replace(current, next);
  return { text, hash: managedHash(next), changed: text !== existing };
}
function managedPath(p, section) {
  p = relative(p);
  insist(
    eligible(p) &&
      p !== ".codex/framework-manifest.json" &&
      (section
        ? ["AGENTS.md", ".gitignore"].includes(p) &&
          (p === "AGENTS.md" ? section === "router" : section === "ignore")
        : /^(scripts\/ai\/|\.codex\/(?:README\.md|PROJECT\.md|MAP\.md|WORKFLOW\.md|project\.json|hooks\.json|biome\.json)$|\.agents\/skills\/control-room\/SKILL\.md$)/.test(
            p,
          )),
    "Unowned install target",
  );
  return p;
}
export function install(root, bundle) {
  insist(
    bundle && bundle.version === VERSION && Array.isArray(bundle.files) && bundle.files.length > 0,
    "Invalid bundle",
  );
  const manifestPath = ".codex/framework-manifest.json";
  const previous = fs.existsSync(within(root, manifestPath))
    ? readJson(root, manifestPath)
    : { files: [] };
  const seen = new Set(),
    planned = [];
  for (const file of bundle.files) {
    const p = managedPath(file.path, file.section);
    insist(!seen.has(p) && typeof file.content === "string", "Duplicate/invalid bundle file");
    seen.add(p);
    const target = within(root, p),
      old = previous.files.find((v) => v.path === p);
    insist(!old || old.section === file.section, "Managed ownership type changed");
    const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    const merged = mergeManaged(existing, file.content, old?.sha256, file.section);
    planned.push({ file, p, merged });
  }
  // Preflight all conflicts before writing. No deletion or silent adoption of edited content.
  const entries = previous.files.filter((v) => !seen.has(v.path));
  for (const { file, p, merged } of planned) {
    if (merged.changed) atomic(root, p, merged.text, { replace: fs.existsSync(within(root, p)) });
    entries.push({
      path: p,
      ...(file.section ? { section: file.section } : {}),
      sha256: merged.hash,
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = json({
    framework: "local-first-control-room",
    version: VERSION,
    files: entries,
  }).replaceAll("\n", "\r\n");
  if (
    !fs.existsSync(within(root, manifestPath)) ||
    fs.readFileSync(within(root, manifestPath), "utf8") !== manifest
  )
    atomic(root, manifestPath, manifest, { replace: fs.existsSync(within(root, manifestPath)) });
  return {
    status: "PASS",
    changed: planned.filter((v) => v.merged.changed).map((v) => v.p),
    managedFiles: entries.length,
  };
}
export function verifyStructure(root) {
  loadConfig(root);
  const manifest = readJson(root, ".codex/framework-manifest.json");
  insist(
    manifest.version === VERSION && Array.isArray(manifest.files) && manifest.files.length > 0,
    "Invalid manifest",
  );
  const seen = new Set();
  for (const file of manifest.files) {
    managedPath(file.path, file.section);
    insist(!seen.has(file.path), "Duplicate manifest path");
    seen.add(file.path);
    const content = owned(fs.readFileSync(within(root, file.path), "utf8"), file.section);
    insist(
      content !== null && managedHash(content) === file.sha256,
      `Managed customization/conflict: ${file.path}`,
    );
  }
  const map = fs.readFileSync(within(root, ".codex/MAP.md"), "utf8");
  const links = [...map.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)];
  insist(links.length > 0, "Knowledge map has no targets");
  for (const [, target] of links) {
    const p = path.relative(root, path.resolve(root, ".codex", target));
    insist(fs.existsSync(within(root, p)), `Missing knowledge target: ${target}`);
  }
  insist(
    git(root, ["check-ignore", ".codex/local/probe.json"]).trim() === ".codex/local/probe.json",
    "Local artifact ignore missing",
  );
  const ignored = spawnSync(
    "git",
    [
      "check-ignore",
      "--no-index",
      ".codex/PROJECT.md",
      "scripts/ai/control-room.mjs",
      ".agents/skills/control-room/SKILL.md",
    ],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  insist(ignored.status === 1, "Portable framework guidance is incorrectly ignored");
  return {
    status: "PASS",
    managedFiles: seen.size,
    knowledgeLinks: links.length,
    ignoredArtifacts: true,
  };
}
