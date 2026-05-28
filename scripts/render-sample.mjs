import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderApacheConfig, validateHost } from "../lib/apache.mjs";
import { readDb } from "../lib/store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = await readDb(path.join(__dirname, "..", "data", "db.json"));
const host = db.hosts[0];
const validation = validateHost(host);

console.log(JSON.stringify(validation, null, 2));
console.log("--- apache config ---");
console.log(renderApacheConfig(host, db.certificates));
