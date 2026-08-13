import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configDir, statePath } from "../config/load.js";

export type SkillMeta = {
  id: string;
  name: string;
  description: string;
  body: string;
  path: string;
  builtin: boolean;
};

export type SkillState = {
  active: string[];
  /** Intensity / variant per skill id (e.g. caveman → full). */
  levels: Record<string, string>;
};

const CAVEMAN_LEVELS = new Set(["lite", "full", "ultra"]);

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

export function skillsDir(): string {
  return join(configDir(), "skills");
}

function bundledSkillsDir(): string {
  // dist/skills/load.js → ../../skills (repo) or alongside install root
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "skills"), // from dist/skills → repo skills/
    join(here, "..", "skills"), // fallback
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }
  return candidates[0]!;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw.trim() };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) {
    return { meta: {}, body: raw.trim() };
  }
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const meta: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const m = /^(\w+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) {
      continue;
    }
    const key = m[1]!;
    let val = m[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body };
}

function loadSkillFile(path: string, id: string, builtin: boolean): SkillMeta | undefined {
  try {
    const raw = readFileSync(path, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    if (body.length === 0) {
      return undefined;
    }
    return {
      id,
      name: meta.name?.trim() || id,
      description: meta.description?.trim() || "",
      body,
      path,
      builtin,
    };
  } catch {
    return undefined;
  }
}

/** Copy bundled skills into ~/.waytech-agent/skills if missing. */
export function ensureUserSkills(): void {
  const userDir = skillsDir();
  mkdirSync(userDir, { recursive: true });
  const bundled = bundledSkillsDir();
  if (!existsSync(bundled)) {
    return;
  }
  for (const name of readdirSync(bundled)) {
    if (!name.endsWith(".md")) {
      continue;
    }
    const dest = join(userDir, name);
    if (existsSync(dest)) {
      continue;
    }
    try {
      copyFileSync(join(bundled, name), dest);
    } catch {
      /* ignore */
    }
  }
}

export function listSkills(): SkillMeta[] {
  ensureUserSkills();
  const byId = new Map<string, SkillMeta>();

  const bundled = bundledSkillsDir();
  if (existsSync(bundled)) {
    for (const name of readdirSync(bundled)) {
      if (!name.endsWith(".md")) {
        continue;
      }
      const id = name.replace(/\.md$/i, "");
      const skill = loadSkillFile(join(bundled, name), id, true);
      if (skill) {
        byId.set(id, skill);
      }
    }
  }

  const userDir = skillsDir();
  if (existsSync(userDir)) {
    for (const name of readdirSync(userDir)) {
      if (!name.endsWith(".md")) {
        continue;
      }
      const id = name.replace(/\.md$/i, "");
      const skill = loadSkillFile(join(userDir, name), id, false);
      if (skill) {
        byId.set(id, skill); // user overrides bundled
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getSkill(id: string): SkillMeta | undefined {
  return listSkills().find((s) => s.id === id);
}

export function readSkillState(): SkillState {
  try {
    const raw = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    const o = asRecord(raw);
    const skills = asRecord(o?.skills);
    const active = Array.isArray(skills?.active)
      ? skills.active.filter((x): x is string => typeof x === "string")
      : [];
    const levelsRaw = asRecord(skills?.levels) ?? {};
    const levels: Record<string, string> = {};
    for (const [k, v] of Object.entries(levelsRaw)) {
      if (typeof v === "string") {
        levels[k] = v;
      }
    }
    return { active, levels };
  } catch {
    return { active: [], levels: {} };
  }
}

export function writeSkillState(state: SkillState): void {
  mkdirSync(configDir(), { recursive: true });
  let prev: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    prev = asRecord(raw) ?? {};
  } catch {
    prev = {};
  }
  prev.skills = {
    active: state.active,
    levels: state.levels,
  };
  writeFileSync(statePath(), `${JSON.stringify(prev, null, 2)}\n`, "utf8");
}

export function setSkillActive(id: string, on: boolean): SkillState {
  const skills = listSkills();
  if (!skills.some((s) => s.id === id)) {
    throw new Error(`Unknown skill: ${id}`);
  }
  const cur = readSkillState();
  const set = new Set(cur.active);
  if (on) {
    set.add(id);
  } else {
    set.delete(id);
  }
  const next = { ...cur, active: [...set].sort() };
  writeSkillState(next);
  return next;
}

export function setSkillLevel(id: string, level: string): SkillState {
  const cur = readSkillState();
  const next = {
    ...cur,
    levels: { ...cur.levels, [id]: level },
  };
  writeSkillState(next);
  return next;
}

export function toggleSkill(id: string): SkillState {
  const cur = readSkillState();
  return setSkillActive(id, !cur.active.includes(id));
}

/** Build system-prompt block for currently active skills. */
export function buildSkillsInject(): string {
  const { active, levels } = readSkillState();
  if (active.length === 0) {
    return "";
  }
  const available = listSkills();
  const parts: string[] = [];
  for (const id of active) {
    const skill = available.find((s) => s.id === id);
    if (!skill) {
      continue;
    }
    let levelNote = "";
    if (id === "caveman") {
      const level = levels.caveman && CAVEMAN_LEVELS.has(levels.caveman) ? levels.caveman : "full";
      levelNote = `\nActive intensity: **${level}**.`;
    } else if (levels[id]) {
      levelNote = `\nActive level: **${levels[id]}**.`;
    }
    parts.push(`### Skill: ${skill.name}${levelNote}\n\n${skill.body}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `Active skills (follow these instructions):\n\n${parts.join("\n\n")}`;
}

export function formatSkillsStatus(): string {
  const skills = listSkills();
  const { active, levels } = readSkillState();
  if (skills.length === 0) {
    return "No skills found. Add .md files under ~/.waytech-agent/skills/";
  }
  const lines = skills.map((s) => {
    const on = active.includes(s.id);
    const level = levels[s.id] ? ` [${levels[s.id]}]` : "";
    const mark = on ? "ON " : "off";
    const desc = s.description ? ` — ${s.description}` : "";
    return `${mark}  ${s.id}${level}${desc}`;
  });
  return [`Skills (${active.length} active):`, ...lines].join("\n");
}

/**
 * Handle /skill and /caveman slash lines.
 * Returns notice text for the TUI.
 */
export function handleSkillsCommand(line: string): string {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? "";
  const args = parts.slice(1);

  if (cmd === "/caveman") {
    const a0 = (args[0] ?? "on").toLowerCase();
    if (a0 === "off" || a0 === "normal") {
      setSkillActive("caveman", false);
      return "Skill caveman OFF";
    }
    if (a0 === "on" || a0 === "toggle" || args.length === 0) {
      if (a0 === "toggle") {
        const next = toggleSkill("caveman");
        return next.active.includes("caveman")
          ? `Skill caveman ON [${next.levels.caveman ?? "full"}]`
          : "Skill caveman OFF";
      }
      setSkillActive("caveman", true);
      const st = readSkillState();
      return `Skill caveman ON [${st.levels.caveman ?? "full"}]`;
    }
    if (CAVEMAN_LEVELS.has(a0)) {
      setSkillActive("caveman", true);
      setSkillLevel("caveman", a0);
      return `Skill caveman ON [${a0}]`;
    }
    return "Usage: /caveman [on|off|lite|full|ultra|toggle]";
  }

  if (cmd !== "/skill" && cmd !== "/skills") {
    return "Unknown skills command";
  }

  const sub = (args[0] ?? "list").toLowerCase();
  if (sub === "list" || sub === "ls" || sub === "status") {
    return formatSkillsStatus();
  }
  if (sub === "off" && args[1]) {
    const id = args[1].toLowerCase();
    setSkillActive(id, false);
    return `Skill ${id} OFF`;
  }
  if (sub === "on" && args[1]) {
    const id = args[1].toLowerCase();
    setSkillActive(id, true);
    return `Skill ${id} ON`;
  }
  if (sub === "add") {
    return [
      "Add a skill: create ~/.waytech-agent/skills/<id>.md",
      "Optional frontmatter:",
      "---",
      "name: my-skill",
      "description: short blurb",
      "---",
      "",
      "Then: /skill on <id>",
    ].join("\n");
  }

  // /skill caveman [on|off|lite|full|ultra|toggle]
  const id = sub;
  const skill = getSkill(id);
  if (!skill) {
    return `Unknown skill "${id}". Try /skill list`;
  }
  const action = (args[1] ?? "toggle").toLowerCase();
  if (action === "on") {
    setSkillActive(id, true);
    return `Skill ${id} ON`;
  }
  if (action === "off") {
    setSkillActive(id, false);
    return `Skill ${id} OFF`;
  }
  if (action === "toggle") {
    const next = toggleSkill(id);
    return next.active.includes(id) ? `Skill ${id} ON` : `Skill ${id} OFF`;
  }
  if (id === "caveman" && CAVEMAN_LEVELS.has(action)) {
    setSkillActive(id, true);
    setSkillLevel(id, action);
    return `Skill caveman ON [${action}]`;
  }
  return `Usage: /skill list | /skill <id> [on|off|toggle] | /caveman [lite|full|ultra|off]`;
}
