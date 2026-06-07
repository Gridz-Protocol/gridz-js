/**
 * Emits specs/openapi.yaml from the live route schemas. Runs after tsup build
 * (imports the built dist). Keeps the OpenAPI contract in lockstep with the code.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { buildApp } from "../dist/index.js";

const app = await buildApp();
await app.ready();
const doc = app.swagger();
const out = fileURLToPath(new URL("../../../specs/openapi.yaml", import.meta.url));
writeFileSync(out, yaml.dump(doc));
await app.close();
console.log(`wrote ${out}`);
