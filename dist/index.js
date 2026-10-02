#!/usr/bin/env node
import { render } from "ink";
import React from "react";
import { Command } from "commander";
import { App } from "./app.js";
import { printListModels } from "./config/load.js";
import { getGpuLease } from "./gpu/lease.js";
import { friendlyLlmError, streamChat } from "./llm/stream.js";
import { routeTurn } from "./orchestrator/route.js";
import { buildSkillsInject, ensureUserSkills } from "./skills/load.js";
import { printSessionList, workspaceKey } from "./sessions/store.js";
import { useStore } from "./state/store.js";
const inkOptions = {
    alternateScreen: false,
    patchConsole: true,
    exitOnCtrlC: false,
    incrementalRendering: true,
    maxFps: 120,
    kittyKeyboard: { mode: "disabled" },
};
async function runPrint(prompt) {
    ensureUserSkills();
    const { config, modelKey, mode } = useStore.getState();
    let runKey = modelKey;
    if (modelKey === "auto") {
        const routed = await routeTurn({ config, mode, userText: prompt });
        runKey = routed.modelKey;
        console.error(`Auto → ${runKey} (${routed.reason})`);
    }
    const entry = config.models[runKey];
    if (!entry) {
        console.error(`No model "${runKey}". Check ~/.waytech-agent/config.json`);
        process.exitCode = 1;
        return;
    }
    const skills = buildSkillsInject();
    const system = [
        `You are a short helpful assistant. Working directory: ${process.cwd()}. Mode: ${mode}.`,
        skills,
    ]
        .filter((s) => s.trim().length > 0)
        .join("\n\n");
    const lease = getGpuLease(config);
    const handle = await lease.acquire(runKey);
    try {
        await streamChat({
            baseURL: entry.baseURL,
            apiKey: entry.apiKey,
            model: entry.model,
            enableThinking: entry.enableThinking === true,
            messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
            ],
            onDelta: (chunk) => {
                process.stdout.write(chunk);
            },
        });
        process.stdout.write("\n");
    }
    catch (err) {
        console.error(friendlyLlmError(err, entry.baseURL));
        process.exitCode = 1;
    }
    finally {
        await handle.release();
    }
}
const program = new Command();
program
    .name("wtagent")
    .description("Interactive coding agent for locally hosted OpenAI-compatible models. Not affiliated with Cursor.")
    .argument("[prompt]", "initial prompt (starts interactive session and sends this first)")
    .option("-p, --print <prompt>", "print mode: stream assistant text to stdout, no TUI")
    .option("--model <id>", "model id or config key")
    .option("--mode <mode>", "agent mode: plan | ask | agent")
    .option("--list-models", "list configured local models")
    .option("--workspace <dir>", "workspace directory")
    .option("--yolo", "skip run_shell approval")
    .action(async (prompt, opts) => {
    if (opts.workspace) {
        process.chdir(opts.workspace);
    }
    if (opts.listModels) {
        printListModels();
        return;
    }
    if (opts.model) {
        useStore.getState().applyFlagModel(opts.model);
    }
    if (opts.mode) {
        useStore.getState().applyFlagMode(opts.mode);
    }
    if (opts.yolo) {
        useStore.getState().applyFlagYolo(true);
    }
    if (opts.print) {
        await runPrint(opts.print);
        return;
    }
    if (prompt) {
        useStore.getState().setInitialPrompt(prompt);
    }
    render(React.createElement(App), inkOptions);
});
program
    .command("resume")
    .description("resume the latest session for this workspace")
    .option("--workspace <dir>", "workspace directory")
    .action((opts) => {
    if (opts.workspace) {
        process.chdir(opts.workspace);
    }
    if (!useStore.getState().resumeLatest()) {
        console.error(`No sessions for ${workspaceKey()}`);
        process.exitCode = 1;
        return;
    }
    render(React.createElement(App), inkOptions);
});
program
    .command("ls")
    .description("list saved sessions")
    .option("--workspace <dir>", "workspace directory")
    .action((opts) => {
    if (opts.workspace) {
        process.chdir(opts.workspace);
    }
    printSessionList();
});
await program.parseAsync();
//# sourceMappingURL=index.js.map