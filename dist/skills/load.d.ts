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
export declare function skillsDir(): string;
/** Copy bundled skills into ~/.waytech-agent/skills if missing. */
export declare function ensureUserSkills(): void;
export declare function listSkills(): SkillMeta[];
export declare function getSkill(id: string): SkillMeta | undefined;
export declare function readSkillState(): SkillState;
export declare function writeSkillState(state: SkillState): void;
export declare function setSkillActive(id: string, on: boolean): SkillState;
export declare function setSkillLevel(id: string, level: string): SkillState;
export declare function toggleSkill(id: string): SkillState;
/** Build system-prompt block for currently active skills. */
export declare function buildSkillsInject(): string;
export declare function formatSkillsStatus(): string;
/**
 * Handle /skill and /caveman slash lines.
 * Returns notice text for the TUI.
 */
export declare function handleSkillsCommand(line: string): string;
