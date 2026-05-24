#!/usr/bin/env node
import process from "node:process";
import React from "react";
import { render } from "ink";
import meow from "meow";
import App from "./App.js";

const cli = meow(
  `
  Usage
    $ aethera-tui [options]

  Options
    --base-url    Backend API URL (default: http://127.0.0.1:8000)
    --help        Show help
    --version     Show version
`,
  {
    importMeta: import.meta,
    flags: {
      baseUrl: {
        type: "string",
        default: "http://127.0.0.1:8000",
      },
    },
  },
);

if (!process.stdin.isTTY) {
  console.log("TUI requires an interactive terminal — skipping");
  process.exit(0);
}

// Safety net: if setRawMode throws (non-TTY edge case), catch and exit
const origSetRawMode = process.stdin.setRawMode.bind(process.stdin);
process.stdin.setRawMode = (mode) => {
  try {
    return origSetRawMode(mode);
  } catch {
    console.log("TUI requires an interactive terminal — skipping");
    process.exit(0);
  }
};

render(<App baseUrl={cli.flags.baseUrl} />);
