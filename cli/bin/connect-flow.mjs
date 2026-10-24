#!/usr/bin/env node
import { createCli } from "../src/cli.mjs";

const program = createCli();
await program.parseAsync(process.argv);
