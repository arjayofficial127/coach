import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomic,
  commandEntry,
  context,
  delta,
  fileHash,
  findRoot,
  hash,
  insist,
  install,
  json,
  loadConfig,
  readJson,
  runCheck,
  snapshot,
  VERSION,
  validateTask,
  verifyStructure,
  within,
} from "./core.mjs";

const help = `Local-first Control Room ${VERSION} (Node >=24, Git; no network/model calls)
node scripts/ai/control-room.mjs doctor
node scripts/ai/control-room.mjs context --scope src/renderer --term navigation [--limit 15 --offset 0]
node scripts/ai/control-room.mjs context --file src/renderer/lattice-app.tsx --start 1 --lines 60
node scripts/ai/control-room.mjs context --task .codex/tasks/ID.json
node scripts/ai/control-room.mjs check framework-tests
node scripts/ai/control-room.mjs task --id ID --request "Original request" [--scope src --mode implementation]
node scripts/ai/control-room.mjs handoff --task .codex/tasks/ID.json
node scripts/ai/control-room.mjs verify-framework
node scripts/ai/control-room.mjs install --from .codex/local/bundle.json
Run from subdirectories using the relative/absolute path to this entry point.
Check accepts only configured command IDs. Task and handoff produce evidence, not agents.`;
function options(argv, allowed) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    insist(allowed.includes(name), `Unknown option: ${name}`);
    if (name === "--allow-ignored") {
      result.allowIgnored = true;
      continue;
    }
    const value = argv[++i];
    insist(typeof value === "string" && !value.startsWith("--"), `Missing value for ${name}`);
    const key = name.slice(2);
    if (key === "term") {
      result.terms ??= [];
      result.terms.push(value);
    } else {
      insist(!Object.hasOwn(result, key), `Duplicate option: ${name}`);
      result[key] = ["limit", "offset", "start", "lines"].includes(key) ? Number(value) : value;
    }
  }
  return result;
}
export function doctor(root) {
  const c = loadConfig(root);
  const gitVersion = spawnSync("git", ["--version"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  return {
    framework: VERSION,
    discovery: {
      gitRequired: true,
      gitAvailable: !gitVersion.error && gitVersion.status === 0,
      gitVersion: gitVersion.status === 0 ? gitVersion.stdout.trim() : null,
      cache: "none",
    },
    root,
    scope: c.scopes,
    platform: `${process.platform}/${process.arch}`,
    runtime: {
      node: process.version,
      required: ">=24",
      available: Number(process.versions.node.split(".")[0]) >= 24,
    },
    commands: Object.entries(c.commands).map(([id, v]) => ({
      id,
      configured: true,
      reviewed: true,
      available: fs.existsSync(commandEntry(root, v.entry)),
      tested: "Inspect .codex/local/checks; availability is not success.",
    })),
    paths: {
      map: fs.existsSync(within(root, ".codex/MAP.md")),
      manifest: fs.existsSync(within(root, ".codex/framework-manifest.json")),
    },
    instructions: {
      rootRouter: fs.existsSync(within(root, "AGENTS.md")),
      overrideShadowsRouter: fs.existsSync(within(root, "AGENTS.override.md")),
      skillPresent: fs.existsSync(within(root, ".agents/skills/control-room/SKILL.md")),
      discovery:
        "Client-dependent; invoke $control-room. Restart/reopen task if absent; manual WORKFLOW.md fallback.",
    },
    capabilities: {
      nativeDelegation:
        "Available and exercised in bootstrap session; helper cannot attest future client tools.",
      cliAdapter: "Not installed; no authentication/model invocation required.",
      hooks: fs.existsSync(within(root, ".codex/hooks.json"))
        ? "Configured SessionStart; requires user /hooks review/trust. Payload tested locally; native firing unverified."
        : "Unavailable/unconfigured: manually call doctor and context.",
      browser:
        "Browser tool exposed in bootstrap session; Electron runtime/visual journey not tested.",
      modelUsage: "Unknown per-task aggregate; no transcript scraping or inferred token totals.",
    },
    automation:
      "No automatic tests, writes, commits, model calls or background processes. SessionStart hook is read-only after trust.",
  };
}
export function createTask(root, o) {
  const config = loadConfig(root);
  const t = {
    schemaVersion: 1,
    id: o.id,
    scope: o.scope ?? ".",
    role: "controller",
    mode: o.mode ?? "implementation",
    status: "in-progress",
    risk: "micro",
    originalRequest: o.request,
    goal: o.request,
    assumptions: [],
    requiredChanges: [],
    protectedBehavior: [],
    nonGoals: [],
    acceptance: [
      {
        text: "Assess the requested outcome against concrete evidence.",
        status: "open",
        evidence: "",
      },
    ],
    validation: [],
    pointers: [],
    visualInputs: [],
    blockingQuestions: [],
    dependencies: [],
    retrievalGaps: [],
    baseline: null,
  };
  validateTask(root, t, config);
  const taskPath = `.codex/tasks/${t.id}.json`,
    baselinePath = `.codex/local/baselines/${t.id}.json`;
  insist(
    !fs.existsSync(within(root, taskPath)) && !fs.existsSync(within(root, baselinePath)),
    "Task/baseline collision: select a new ID or retrieve existing task",
  );
  const state = snapshot(root);
  atomic(
    root,
    baselinePath,
    json({
      schemaVersion: 1,
      taskId: t.id,
      root: hash(root),
      started: new Date().toISOString(),
      ...state,
    }),
  );
  t.baseline = baselinePath;
  atomic(root, taskPath, json(t));
  return {
    task: taskPath,
    baseline: baselinePath,
    status: "in-progress",
    next: "Review goal, acceptance, risk, validation IDs and protected behavior before meaningful implementation.",
  };
}
export function handoff(root, taskPath) {
  const task = validateTask(root, readJson(root, taskPath));
  insist(task.baseline, "Task has no baseline");
  const baseline = readJson(root, task.baseline);
  insist(
    baseline.schemaVersion === 1 &&
      baseline.taskId === task.id &&
      baseline.root === hash(root) &&
      baseline.files &&
      baseline.fingerprint === hash(json(baseline.files)),
    "Invalid/foreign baseline",
  );
  const current = snapshot(root),
    config = loadConfig(root),
    checksDir = within(root, ".codex/local/checks");
  const records = fs.existsSync(checksDir)
    ? fs
        .readdirSync(checksDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({
          ...readJson(root, `.codex/local/checks/${f}`),
          record: `.codex/local/checks/${f}`,
        }))
    : [];
  const checks = task.validation.map((id) => {
    const record = records
      .filter((r) => r.commandId === id && r.started >= baseline.started)
      .sort((a, b) => b.started.localeCompare(a.started))[0];
    if (!record)
      return {
        commandId: id,
        status: "SKIPPED",
        reason: "No check recorded after this task baseline",
      };
    const stale =
      record.stale ||
      record.fingerprint !== current.fingerprint ||
      record.commandHash !== hash(json(config.commands[id]));
    let intact = false;
    try {
      intact = ["stdout", "stderr"].every(
        (kind) =>
          typeof record.artifacts?.[kind] === "string" &&
          /^\.codex\/local\/checks\/[a-z0-9-]+\.(stdout|stderr)\.log$/.test(
            record.artifacts[kind],
          ) &&
          fileHash(within(root, record.artifacts[kind])) === record.artifactHashes?.[kind],
      );
    } catch {
      intact = false;
    }
    return {
      commandId: id,
      status:
        intact && ["PASS", "FAIL", "SKIPPED", "BLOCKED", "UNKNOWN"].includes(record.status)
          ? record.status
          : "UNKNOWN",
      stale,
      evidenceIntact: intact,
      record: record.record,
      artifacts: record.artifacts,
    };
  });
  const outstanding = task.acceptance.filter((a) => a.status !== "met");
  const confirmed =
    checks.length > 0 &&
    checks.every((r) => r.status === "PASS" && !r.stale) &&
    outstanding.length === 0 &&
    task.blockingQuestions.length === 0;
  const status = task.blockingQuestions.length
    ? "blocked"
    : confirmed
      ? "verified"
      : task.mode === "implementation"
        ? "implemented-unverified"
        : "in-progress";
  const result = {
    schemaVersion: 1,
    taskId: task.id,
    originalRequest: task.originalRequest,
    goal: task.goal,
    scope: task.scope,
    mode: task.mode,
    requiredChanges: task.requiredChanges,
    nonGoals: task.nonGoals,
    status,
    baseline: task.baseline,
    fingerprint: current.fingerprint,
    affectedPaths: delta(baseline.files, current.files),
    checks,
    outstandingAcceptance: outstanding,
    assumptions: task.assumptions,
    protectedBehavior: task.protectedBehavior,
    blockingQuestions: task.blockingQuestions,
    retrievalGaps: task.retrievalGaps,
    usage: {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      allAgentsTotal: null,
      source: "Not supplied by client; no savings claimed.",
    },
    uncertainty: [
      "Criterion evidence is attributed human/agent assessment, not independently proven by this helper.",
      "Excluded private/generated paths are outside the source fingerprint; hash reviewed build inputs separately when relevant.",
    ],
  };
  const target = `.codex/local/handoffs/${task.id}-${current.fingerprint.slice(0, 12)}-${hash(json(result)).slice(0, 12)}.json`;
  if (!fs.existsSync(within(root, target))) atomic(root, target, json(result));
  else
    insist(
      fs.readFileSync(within(root, target), "utf8") === json(result),
      "Handoff artifact collision",
    );
  return { ...result, artifact: target };
}
export function hookPayload(root, input) {
  insist(
    input &&
      input.hook_event_name === "SessionStart" &&
      typeof input.session_id === "string" &&
      typeof input.cwd === "string" &&
      ["startup", "resume", "clear", "compact"].includes(input.source),
    "Invalid SessionStart payload",
  );
  insist(findRoot(input.cwd) === root, "Hook cwd belongs to another project");
  loadConfig(root);
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Local-first Control Room ${VERSION}: use node scripts/ai/control-room.mjs doctor and context for focused discovery. Read .codex/WORKFLOW.md only when relevant. Preserve existing dirty work and AGENTS.md instructions. This hook does not validate or complete tasks; run reviewed checks and handoff at task boundaries.`,
    },
  };
}
export async function main(argv = process.argv.slice(2), selectedRoot) {
  try {
    const [command, ...args] = argv;
    if (!command || command === "--help") {
      console.log(help);
      return;
    }
    insist(Number(process.versions.node.split(".")[0]) >= 24, "Node >=24 required");
    const root = selectedRoot ?? findRoot();
    let result;
    switch (command) {
      case "doctor":
        insist(args.length === 0, "doctor takes no arguments");
        result = doctor(root);
        break;
      case "context": {
        const o = options(args, [
          "--scope",
          "--term",
          "--limit",
          "--offset",
          "--file",
          "--start",
          "--lines",
          "--allow-ignored",
          "--task",
        ]);
        if (o.task) {
          const t = validateTask(root, readJson(root, o.task));
          o.scope ??= t.scope;
          result = {
            ...context(root, o),
            task: {
              id: t.id,
              originalRequest: t.originalRequest,
              goal: t.goal,
              acceptance: t.acceptance,
              pointers: t.pointers,
              retrievalGaps: t.retrievalGaps,
            },
          };
        } else result = context(root, o);
        break;
      }
      case "check":
        insist(args.length === 1, "check needs one reviewed command ID");
        result = runCheck(root, args[0]);
        break;
      case "task":
        result = createTask(root, options(args, ["--id", "--request", "--scope", "--mode"]));
        break;
      case "handoff": {
        const o = options(args, ["--task"]);
        insist(o.task, "--task required");
        result = handoff(root, o.task);
        break;
      }
      case "install": {
        const o = options(args, ["--from"]);
        insist(o.from, "--from required");
        result = install(root, readJson(root, o.from));
        break;
      }
      case "verify-framework": {
        insist(args.length === 0, "verify-framework takes no arguments");
        const structure = verifyStructure(root);
        const syntax = [
          "scripts/ai/core.mjs",
          "scripts/ai/control-room.mjs",
          "scripts/ai/framework.test.mjs",
        ].map((file) => {
          const p = spawnSync(process.execPath, ["--check", within(root, file)], {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
            timeout: 10000,
          });
          insist(!p.error && p.status === 0, `Syntax failure ${file}: ${p.stderr}`);
          return file;
        });
        const tests = runCheck(root, "framework-tests");
        result = {
          status: tests.status,
          structure,
          syntax,
          tests,
          testedPlatform: process.platform,
          otherPlatforms: "NOT RUN",
          nativeHookFiring: "NOT RUN: requires user trust",
        };
        break;
      }
      case "hook-session-start": {
        insist(args.length === 0, "hook takes stdin only");
        const buffers = [];
        let bytes = 0;
        for await (const chunk of process.stdin) {
          bytes += chunk.length;
          insist(bytes <= 16384, "Hook payload too large");
          buffers.push(chunk);
        }
        result = hookPayload(root, JSON.parse(Buffer.concat(buffers).toString("utf8")));
        break;
      }
      default:
        throw new Error(`Unknown operation: ${command}`);
    }
    console.log(json(result).trimEnd());
    if (["FAIL", "BLOCKED", "UNKNOWN"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    console.error(json({ status: "BLOCKED", error: error.message }).trimEnd());
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
