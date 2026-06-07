#!/usr/bin/env node
import { Command } from "commander";
import * as c from "./commands.js";
import type { CmdResult } from "./commands.js";

const program = new Command();
program.name("gridz").description("Cryptographically-attested social graphs.").version("0.1.0");
program.option("--json", "output raw JSON");

function emit(result: CmdResult): void {
  if (program.opts().json) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else {
    process.stdout.write(`${result.ok ? "✓" : "✗"} ${JSON.stringify(result)}\n`);
  }
  if (result.ok === false) process.exitCode = 1;
}

program
  .command("init")
  .requiredOption("-t, --template <name>", "template name")
  .option("-o, --out <path>", "output path", "gridz.yaml")
  .option("--force", "overwrite an existing config")
  .action((o) => emit(c.initCmd({ template: o.template, out: o.out, force: o.force })));

const grid = program.command("grid");
grid.command("validate [path]").action((p) => emit(c.validateCmd({ path: p ?? "gridz.yaml" })));
grid
  .command("build [path]")
  .option("-o, --out <path>", "output grid", "grid.json")
  .action(async (p, o) => emit(await c.buildCmd({ path: p ?? "gridz.yaml", out: o.out })));
grid.command("verify <path>").action(async (p) => emit(await c.verifyCmd({ path: p })));

const cell = program.command("cell");
cell
  .command("add <key> <value>")
  .option("--widget <type>")
  .option("--size <size>")
  .option("-c, --config <path>", "config path", "gridz.yaml")
  .action((k, v, o) => emit(c.cellAddCmd({ path: o.config, key: k, value: v, widget: o.widget, size: o.size })));

const identity = program.command("identity");
identity.command("whoami").action(async () => emit(await c.whoamiCmd({ env: process.env })));

program
  .command("publish")
  .requiredOption("--sink <name>")
  .option("--grid <path>", "grid path", "grid.json")
  .option("--to <target>")
  .action(async (o) => emit(await c.publishCmd({ grid: o.grid, sink: o.sink })));

const sink = program.command("sink");
sink.command("list").action(() => emit(c.sinkListCmd()));
sink.command("test <name>").action(async (n) => emit(await c.sinkTestCmd({ name: n })));

program.command("schema <key>").action((k) => emit(c.schemaCmd({ key: k })));

program.parseAsync().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
