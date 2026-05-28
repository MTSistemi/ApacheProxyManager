import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const EMPTY_DB = {
  hosts: [],
  certificates: [],
  users: [],
  sessions: [],
  activity: []
};

export async function ensureStore(dbPath) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await readFile(dbPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeDb(dbPath, EMPTY_DB);
  }
}

export async function readDb(dbPath) {
  await ensureStore(dbPath);
  const raw = await readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
    certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    activity: Array.isArray(parsed.activity) ? parsed.activity : []
  };
}

export async function writeDb(dbPath, db) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

export function recordActivity(db, type, message, meta = {}) {
  db.activity = [
    {
      id: crypto.randomUUID(),
      type,
      message,
      meta,
      createdAt: new Date().toISOString()
    },
    ...(db.activity || [])
  ].slice(0, 80);
}
