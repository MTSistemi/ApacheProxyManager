import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "apm_session";
const ISSUER = "Apache Proxy Manager";

export function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    enabled: user.enabled !== false,
    totpEnabled: Boolean(user.totpEnabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || ""
  };
}

export function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export function validatePasswordPolicy(password) {
  const errors = [];
  const value = String(password || "");
  if (value.length < 10) errors.push("La password deve contenere almeno 10 caratteri.");
  if (!/[A-Z]/.test(value)) errors.push("La password deve includere una lettera maiuscola.");
  if (!/[a-z]/.test(value)) errors.push("La password deve includere una lettera minuscola.");
  if (!/[0-9]/.test(value)) errors.push("La password deve includere un numero.");
  return errors;
}

export async function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = await scrypt(String(password), salt, 64);
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(derived);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function normalizeTotpSecret(secret) {
  return String(secret || "")
    .replace(/[\s=-]+/g, "")
    .toUpperCase();
}

export function base32Decode(secret) {
  const clean = normalizeTotpSecret(secret);
  let bits = 0;
  let value = 0;
  const output = [];

  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw Object.assign(new Error("Chiave TOTP non valida."), { status: 400 });
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

export function createTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function buildOtpAuthUri(user, secret) {
  const label = encodeURIComponent(`${ISSUER}:${user.username}`);
  const params = new URLSearchParams({
    secret: normalizeTotpSecret(secret),
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateTotp(secret, timestamp = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret, token, windowSize = 1) {
  const clean = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const actual = Buffer.from(clean);
  for (let offset = -windowSize; offset <= windowSize; offset += 1) {
    const expectedCode = generateTotp(secret, Date.now() + offset * 30_000);
    const expected = Buffer.from(expectedCode);
    if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) return true;
  }
  return false;
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    cookies[key] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

export function pruneExpiredSessions(db) {
  const now = Date.now();
  db.sessions = (db.sessions || []).filter((session) => Date.parse(session.expiresAt) > now);
}

export function createSession(db, user) {
  pruneExpiredSessions(db);
  const token = crypto.randomBytes(32).toString("base64url");
  const session = {
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: hashSessionToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  };
  db.sessions.push(session);
  return { token, session };
}

export function getAuthContext(db, req) {
  pruneExpiredSessions(db);
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = (db.sessions || []).find((item) => item.tokenHash === tokenHash);
  if (!session) return null;
  const user = (db.users || []).find((item) => item.id === session.userId && item.enabled !== false);
  if (!user) return null;
  return { user, session, token };
}

export function setSessionCookie(res, token) {
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  res.setHeader("Set-Cookie", cookie.join("; "));
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function removeSession(db, token) {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  db.sessions = (db.sessions || []).filter((session) => session.tokenHash !== tokenHash);
}

export function setupRequired(db) {
  return !(db.users || []).some((user) => user.role === "admin" && user.enabled !== false);
}
