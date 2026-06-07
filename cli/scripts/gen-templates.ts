/** Emits the bundled templates as human-readable YAML under /templates. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { TEMPLATES } from "../dist/index.js";

const root = fileURLToPath(new URL("../../../templates/", import.meta.url));
for (const [name, config] of Object.entries(TEMPLATES)) {
  const dir = `${root}${name}`;
  mkdirSync(dir, { recursive: true });
  const header = `# Gridz bootstrap template: ${name}\n# Shape only — every value is null + _needs_input until you fill it.\n# Fill values, then: gridz grid validate && gridz grid build\n`;
  writeFileSync(`${dir}/gridz.yaml`, header + stringify(config));
}
console.log(`wrote ${Object.keys(TEMPLATES).length} templates`);
