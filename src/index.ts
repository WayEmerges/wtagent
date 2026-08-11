#!/usr/bin/env node
import { render } from "ink";
import React from "react";
import { Command } from "commander";
import { App } from "./app.js";
import { printListModels } from "./config/load.js";
import { friendlyLlmError, streamChat } from "./llm/stream.js";
import { printSessionList, workspaceKey } from "./sessions/store.js";
import { useStore } from "./state/store.js";

async function runPrint(prompt: string): Promise<void> {
  const { config, modelKey, mode } = useStore.getState();
  const entry = config.models[modelKey];
  if (!entry) {
    console.error(`No model "${modelKey}". Check ~/.waytech-agent/config.json`);
    process.exitCode = 1;
    return;
  }
  try {
    await streamChat({
      baseURL: entry.baseURL,
      apiKey: entry.apiKey,
      model: entry.model,
      messages: [
        {
          role: "system",
          content: `You are a short helpful assistant. Working directory: ${process.cwd()}. Mode: ${mode}.`,
        },
        { role: "user", content: prompt },
      ],
      onDelta: (chunk) => {
        process.stdout.write(chunk);
      },
    });
    process.stdout.write("\n");
  } catch (err) {
    console.error(friendlyLlmError(err, entry.baseURL));
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("wtagent")
  .description(
    "Interactive coding agent for locally hosted OpenAI-compatible models. Not affiliated with Cursor.",
  )
  .argument("[prompt]", "initial prompt (starts interactive session and sends this first)")
  .option("-p, --print <prompt>", "print mode: stream assistant text to stdout, no TUI")
  .option("--model <id>", "model id or config key")
  .option("--mode <mode>", "agent mode: plan | ask | agent")
  .option("--list-models", "list configured local models")
  .option("--workspace <dir>", "workspace directory")
  .option("--yolo", "skip run_shell approval")
  .action(
    async (
      prompt: string | undefined,
      opts: {
        print?: string;
        listModels?: boolean;
        model?: string;
        mode?: string;
        workspace?: string;
        yolo?: boolean;
      },
    ) => {
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
      render(React.createElement(App), {
        alternateScreen: false,
        patchConsole: true,
        kittyKeyboard: { mode: "disabled" },
      });
    },
  );

program
  .command("resume")
  .description("resume the latest session for this workspace")
  .option("--workspace <dir>", "workspace directory")
  .action((opts: { workspace?: string }) => {
    if (opts.workspace) {
      process.chdir(opts.workspace);
    }
    if (!useStore.getState().resumeLatest()) {
      console.error(`No sessions for ${workspaceKey()}`);
      process.exitCode = 1;
      return;
    }
    render(React.createElement(App), {
      alternateScreen: false,
      patchConsole: true,
      kittyKeyboard: { mode: "disabled" },
    });
  });

program
  .command("ls")
  .description("list saved sessions")
  .option("--workspace <dir>", "workspace directory")
  .action((opts: { workspace?: string }) => {
    if (opts.workspace) {
      process.chdir(opts.workspace);
    }
    printSessionList();
  });

await program.parseAsync();
