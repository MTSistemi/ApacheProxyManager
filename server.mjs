import http from "node:http";
import { createReadStream } from "node:fs";
import { access, chmod, mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";

import { apacheModuleHint, renderApacheConfig, sanitizeConfName, validateHost } from "./lib/apache.mjs";
import {
  buildOtpAuthUri,
  clearSessionCookie,
  createPasswordHash,
  createSession,
  createTotpSecret,
  getAuthContext,
  normalizeTotpSecret,
  normalizeUsername,
  removeSession,
  safeUser,
  setSessionCookie,
  setupRequired,
  validatePasswordPolicy,
  verifyPassword,
  verifyTotp
} from "./lib/auth.mjs";
import { buildCertbotArgs, buildOvhCredentialsIni, certificatePaths, formatCommand, validateCertificateRequest } from "./lib/certbot.mjs";
import { readDb, recordActivity, writeDb } from "./lib/store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4321;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const GENERATED_DIR = process.env.GENERATED_DIR || path.join(__dirname, "generated");
const SECRETS_DIR = process.env.SECRETS_DIR || path.join(__dirname, "data", "secrets");
const CERTBOT_BIN = process.env.CERTBOT_BIN || "certbot";
let lastCpuSample = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload, null, 2), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function text(res, status, payload) {
  send(res, status, payload, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error("Payload troppo grande."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHost(input, existing = {}) {
  const now = new Date().toISOString();
  const ssl = input.ssl || {};
  const logs = input.logs || {};

  return {
    id: existing.id || input.id || crypto.randomUUID(),
    enabled: input.enabled !== false,
    serverName: String(input.serverName || "").trim(),
    serverAliases: cleanList(input.serverAliases),
    serverAdmin: String(input.serverAdmin || "").trim(),
    useCanonicalName: String(input.useCanonicalName || "Off").trim(),
    documentRoot: String(input.documentRoot || "").trim(),
    enableHttp: Boolean(input.enableHttp),
    forceSsl: Boolean(input.forceSsl),
    httpPort: Number(input.httpPort) || 80,
    httpsPort: Number(input.httpsPort) || 443,
    proxyPreserveHost: input.proxyPreserveHost !== false,
    logs: {
      access: String(logs.access || "").trim(),
      error: String(logs.error || "").trim()
    },
    ssl: {
      enabled: Boolean(ssl.enabled),
      certificateFile: String(ssl.certificateFile || "").trim(),
      certificateKeyFile: String(ssl.certificateKeyFile || "").trim(),
      caCertificateFile: String(ssl.caCertificateFile || "").trim(),
      managedCertificateId: String(ssl.managedCertificateId || "").trim()
    },
    sslDirectives: Array.isArray(input.sslDirectives)
      ? input.sslDirectives.map(String).filter(Boolean)
      : String(input.sslDirectives || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    redirects: (input.redirects || []).map((redirect) => ({
      id: redirect.id || crypto.randomUUID(),
      from: String(redirect.from || "/").trim(),
      to: String(redirect.to || "").trim(),
      status: String(redirect.status || "temporary").trim()
    })).filter((redirect) => redirect.to),
    proxyRules: (input.proxyRules || []).map((rule) => ({
      id: rule.id || crypto.randomUUID(),
      path: String(rule.path || "/").trim(),
      protocol: String(rule.protocol || "http").trim(),
      targetHost: String(rule.targetHost || "").trim(),
      targetPort: Number(rule.targetPort) || 80,
      targetPath: String(rule.targetPath || rule.path || "/").trim(),
      reverse: rule.reverse !== false,
      nocanon: Boolean(rule.nocanon),
      retry: rule.retry === "" || rule.retry === undefined || rule.retry === null ? "" : Number(rule.retry),
      timeout: rule.timeout === "" || rule.timeout === undefined || rule.timeout === null ? "" : Number(rule.timeout)
    })),
    advancedDirectives: Array.isArray(input.advancedDirectives)
      ? input.advancedDirectives.join("\n")
      : String(input.advancedDirectives || ""),
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now
  };
}

function findHost(db, id) {
  return db.hosts.find((host) => host.id === id || host.serverName === id);
}

async function writeGeneratedConfig(host, db) {
  await mkdir(GENERATED_DIR, { recursive: true });
  const filename = `${sanitizeConfName(host.serverName)}.conf`;
  const localPath = path.join(GENERATED_DIR, filename);
  const content = renderApacheConfig(host, db.certificates);
  await writeFile(localPath, content, "utf8");
  return { filename, localPath, content };
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function deployApacheConfig(host, db, options = {}) {
  const generated = await writeGeneratedConfig(host, db);
  const result = {
    generatedPath: generated.localPath,
    apachePath: "",
    enabledPath: "",
    commands: [],
    output: []
  };

  const sitesAvailable = process.env.APACHE_SITES_AVAILABLE;
  const sitesEnabled = process.env.APACHE_SITES_ENABLED;
  const testCommand = process.env.APACHE_TEST_COMMAND;
  const reloadCommand = process.env.APACHE_RELOAD_COMMAND;

  if (sitesAvailable) {
    await mkdir(sitesAvailable, { recursive: true });
    result.apachePath = path.join(sitesAvailable, generated.filename);
    await writeFile(result.apachePath, generated.content, "utf8");

    if (sitesEnabled) {
      await mkdir(sitesEnabled, { recursive: true });
      result.enabledPath = path.join(sitesEnabled, generated.filename);
      if (!(await pathExists(result.enabledPath))) {
        try {
          await symlink(result.apachePath, result.enabledPath);
        } catch {
          await writeFile(result.enabledPath, generated.content, "utf8");
        }
      }
    }
  }

  if (testCommand) {
    result.commands.push(testCommand);
    result.output.push(await runShell(testCommand));
  }

  if (options.reload && reloadCommand) {
    result.commands.push(reloadCommand);
    result.output.push(await runShell(reloadCommand));
  }

  return result;
}

function runShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      windowsHide: true,
      cwd: __dirname
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = { command, code, stdout, stderr };
      if (code === 0) resolve(output);
      else reject(Object.assign(new Error(`Comando fallito: ${command}`), { status: 500, output }));
    });
  });
}

function runProcess(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      cwd: __dirname
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => reject(Object.assign(error, { status: 500, stdout, stderr })));
    child.on("close", (code) => {
      const output = { code, stdout, stderr };
      if (code === 0) resolve(output);
      else reject(Object.assign(new Error("Certbot ha restituito un errore."), { status: 500, output }));
    });
  });
}

function cpuSample() {
  return os.cpus().reduce((acc, cpu) => {
    const times = cpu.times;
    acc.idle += times.idle;
    acc.total += times.user + times.nice + times.sys + times.idle + times.irq;
    return acc;
  }, { idle: 0, total: 0 });
}

function cpuUsagePercent() {
  const current = cpuSample();
  if (!lastCpuSample) {
    lastCpuSample = current;
    return 0;
  }
  const idle = current.idle - lastCpuSample.idle;
  const total = current.total - lastCpuSample.total;
  lastCpuSample = current;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
}

async function diskUsage() {
  try {
    if (process.platform === "win32") {
      const drive = path.parse(process.cwd()).root.replace(/\\$/, "");
      const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=Get-CimInstance Win32_LogicalDisk -Filter \\"DeviceID='${drive}'\\"; [pscustomobject]@{total=[double]$d.Size;free=[double]$d.FreeSpace}|ConvertTo-Json -Compress"`;
      const output = await runShell(command);
      const parsed = JSON.parse(output.stdout.trim());
      const total = Number(parsed.total) || 0;
      const free = Number(parsed.free) || 0;
      return { total, free, used: Math.max(0, total - free), percent: total ? Math.round(((total - free) / total) * 100) : 0, path: drive };
    }

    const output = await runShell("df -Pk / | tail -1");
    const parts = output.stdout.trim().split(/\s+/);
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    const free = Number(parts[3]) * 1024;
    return { total, used, free, percent: total ? Math.round((used / total) * 100) : 0, path: parts[5] || "/" };
  } catch {
    return { total: 0, used: 0, free: 0, percent: 0, path: "", unavailable: true };
  }
}

function checkTcp(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host, port });
    let finished = false;

    const done = (online, error = "") => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ host, port, online, latencyMs: online ? Date.now() - startedAt : null, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error) => done(false, error.code || error.message));
  });
}

async function hostRuntimeStatus(host) {
  if (host.enabled === false) {
    return { id: host.id, serverName: host.serverName, status: "disabled", targets: [], routesTotal: 0, routesOnline: 0, routesOffline: 0 };
  }

  const targetMap = new Map();
  for (const rule of host.proxyRules || []) {
    if (!rule.targetHost || !rule.targetPort) continue;
    targetMap.set(`${rule.targetHost}:${rule.targetPort}`, {
      host: rule.targetHost,
      port: Number(rule.targetPort),
      protocol: rule.protocol || "http",
      paths: []
    });
  }
  for (const rule of host.proxyRules || []) {
    const key = `${rule.targetHost}:${rule.targetPort}`;
    if (targetMap.has(key)) targetMap.get(key).paths.push(rule.path);
  }

  const targets = await Promise.all(Array.from(targetMap.values()).map(async (target) => ({
    ...target,
    ...(await checkTcp(target.host, target.port))
  })));

  const routesTotal = targets.length;
  const routesOnline = targets.filter((target) => target.online).length;
  const routesOffline = routesTotal - routesOnline;
  let status = "offline";
  if (!routesTotal) status = "unknown";
  else if (routesOnline === routesTotal) status = "online";
  else if (routesOnline > 0) status = "degraded";

  return { id: host.id, serverName: host.serverName, enabled: host.enabled !== false, status, targets, routesTotal, routesOnline, routesOffline };
}

async function dashboardSnapshot(db) {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const disk = await diskUsage();
  const hosts = await Promise.all((db.hosts || []).map(hostRuntimeStatus));
  return {
    generatedAt: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      uptimeSeconds: Math.round(os.uptime()),
      cpu: {
        percent: cpuUsagePercent(),
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || ""
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        percent: totalMem ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0
      },
      disk
    },
    hosts,
    totals: {
      hosts: hosts.length,
      online: hosts.filter((host) => host.status === "online").length,
      degraded: hosts.filter((host) => host.status === "degraded").length,
      offline: hosts.filter((host) => host.status === "offline").length,
      disabled: hosts.filter((host) => host.status === "disabled").length
    }
  };
}

async function readLogTail(filePath, maxLines = 220) {
  const target = String(filePath || "").trim();
  if (!target) return { path: "", content: "", available: false, error: "Percorso log non configurato." };
  try {
    const raw = await readFile(target, "utf8");
    const lines = raw.split(/\r?\n/).slice(-maxLines).join("\n");
    return { path: target, content: lines, available: true };
  } catch (error) {
    return { path: target, content: "", available: false, error: error.code || error.message };
  }
}

async function requestOvhCertificate(payload) {
  const validation = validateCertificateRequest(payload);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.errors.join(" ")), { status: 400, validation });
  }

  await mkdir(SECRETS_DIR, { recursive: true });
  const certName = String(payload.certName || validation.domains[0]).trim();
  const safeName = sanitizeConfName(certName);
  const credentialsPath = path.join(SECRETS_DIR, `ovh-${safeName}.ini`);
  await writeFile(credentialsPath, buildOvhCredentialsIni(payload.credentials || {}), "utf8");
  try {
    await chmod(credentialsPath, 0o600);
  } catch {
    // chmod is best-effort on Windows.
  }

  const args = buildCertbotArgs({ ...payload, domains: validation.domains, certName }, credentialsPath);
  const command = formatCommand(CERTBOT_BIN, args);
  if (payload.commandOnly) {
    return { status: "command-ready", command, credentialsPath, certName, domains: validation.domains };
  }

  const output = await runProcess(CERTBOT_BIN, args);
  return {
    status: "issued",
    command,
    credentialsPath,
    certName,
    domains: validation.domains,
    output
  };
}

function publicApiRoute(req, url) {
  if (req.method === "GET" && url.pathname === "/api/health") return true;
  if (req.method === "GET" && url.pathname === "/api/bootstrap") return true;
  if (req.method === "POST" && url.pathname === "/api/setup/admin") return true;
  if (req.method === "POST" && url.pathname === "/api/auth/login") return true;
  return false;
}

function requireAuth(db, req) {
  const context = getAuthContext(db, req);
  if (!context) throw Object.assign(new Error("Accesso richiesto."), { status: 401 });
  return context;
}

function requireAdmin(context) {
  if (context.user.role !== "admin") {
    throw Object.assign(new Error("Permessi amministratore richiesti."), { status: 403 });
  }
}

function validateUsername(username) {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

function countReadyAdmins(users, replacement = null, removeId = "") {
  return users
    .map((user) => (replacement && user.id === replacement.id ? replacement : user))
    .filter((user) => user.id !== removeId)
    .filter((user) => user.role === "admin" && user.enabled !== false)
    .length;
}

async function normalizeUserPayload(payload, existing = null, options = {}) {
  const errors = [];
  const now = new Date().toISOString();
  const username = normalizeUsername(payload.username ?? existing?.username);
  const password = String(payload.password || "");
  const role = ["admin", "operator"].includes(payload.role) ? payload.role : (existing?.role || "operator");
  const totpEnabled = payload.totpEnabled !== undefined ? Boolean(payload.totpEnabled) : Boolean(existing?.totpEnabled);
  let totpSecret = payload.totpSecret
    ? normalizeTotpSecret(payload.totpSecret)
    : (existing?.totpSecret || "");

  if (!totpEnabled) totpSecret = "";

  if (!validateUsername(username)) errors.push("Username non valido: usa 3-40 caratteri tra lettere, numeri, punto, trattino e underscore.");
  if (!existing || password) errors.push(...validatePasswordPolicy(password));
  if (totpEnabled && totpSecret.length < 16) errors.push("Chiave TOTP mancante o troppo corta.");

  if (errors.length) throw Object.assign(new Error(errors.join(" ")), { status: 400, errors });

  const passwordHash = password ? await createPasswordHash(password) : existing.passwordHash;
  const user = {
    id: existing?.id || crypto.randomUUID(),
    username,
    displayName: String(payload.displayName ?? existing?.displayName ?? username).trim() || username,
    email: String(payload.email ?? existing?.email ?? "").trim(),
    role,
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : existing?.enabled !== false,
    passwordHash,
    totpSecret,
    totpEnabled,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastLoginAt: existing?.lastLoginAt || ""
  };

  return user;
}

async function handleApi(req, res, url) {
  const db = await readDb(DB_PATH);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      port: PORT,
      apacheModuleHint: apacheModuleHint(),
      generatedDir: GENERATED_DIR
    });
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    return json(res, 200, {
      setupRequired: setupRequired(db),
      appName: "Apache Proxy Manager",
      brand: {
        source: "www.metriks.ai",
        ink: "#000000",
        blue: "#1F6CF5",
        violet: "#6D29F6",
        purple: "#6319A0",
        green: "#00B383",
        soft: "#F8FFF5"
      }
    });
  }

  if (req.method === "POST" && url.pathname === "/api/setup/admin") {
    if (!setupRequired(db)) return json(res, 409, { error: "Setup iniziale gia' completato." });
    const body = await readBody(req);
    const user = await normalizeUserPayload({
      ...body,
      role: "admin",
      enabled: true,
      totpEnabled: false
    });
    db.users.push(user);
    const { token } = createSession(db, user);
    recordActivity(db, "setup", `Amministratore ${user.username} creato.`, { userId: user.id });
    await writeDb(DB_PATH, db);
    setSessionCookie(res, token);
    return json(res, 201, { user: safeUser(user), setupRequired: false });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    if (setupRequired(db)) return json(res, 428, { error: "Completa il setup iniziale." });
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    const user = db.users.find((item) => item.username === username && item.enabled !== false);
    const passwordOk = user ? await verifyPassword(body.password, user.passwordHash) : false;
    const totpOk = user?.totpEnabled ? verifyTotp(user.totpSecret, body.totpCode) : true;
    if (!user || !passwordOk || !totpOk) {
      return json(res, 401, { error: "Credenziali non valide." });
    }
    user.lastLoginAt = new Date().toISOString();
    const { token } = createSession(db, user);
    recordActivity(db, "login", `${user.username} ha effettuato l'accesso.`, { userId: user.id });
    await writeDb(DB_PATH, db);
    setSessionCookie(res, token);
    return json(res, 200, { user: safeUser(user) });
  }

  const authContext = publicApiRoute(req, url) ? null : requireAuth(db, req);

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const context = getAuthContext(db, req);
    if (context) removeSession(db, context.token);
    await writeDb(DB_PATH, db);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    return json(res, 200, { user: safeUser(authContext.user), setupRequired: false });
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    return json(res, 200, await dashboardSnapshot(db));
  }

  if (req.method === "GET" && url.pathname === "/api/logs") {
    const hostId = url.searchParams.get("hostId") || "";
    const kind = url.searchParams.get("kind") || "general";
    if (kind === "general") {
      return json(res, 200, {
        kind,
        activity: db.activity || [],
        generatedAt: new Date().toISOString()
      });
    }

    const host = hostId ? findHost(db, hostId) : null;
    if (!host) return json(res, 404, { error: "Host non trovato." });
    const logPath = kind === "error" ? host.logs?.error : host.logs?.access;
    return json(res, 200, {
      kind,
      host: { id: host.id, serverName: host.serverName },
      ...(await readLogTail(logPath))
    });
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return json(res, 200, {
      hosts: db.hosts,
      certificates: db.certificates,
      users: db.users.map(safeUser),
      activity: db.activity,
      currentUser: safeUser(authContext.user),
      environment: {
        generatedDir: GENERATED_DIR,
        apacheSitesAvailable: process.env.APACHE_SITES_AVAILABLE || "",
        apacheSitesEnabled: process.env.APACHE_SITES_ENABLED || "",
        apacheTestCommand: process.env.APACHE_TEST_COMMAND || "",
        apacheReloadCommand: process.env.APACHE_RELOAD_COMMAND || "",
        certbotBin: CERTBOT_BIN
      },
      apacheModuleHint: apacheModuleHint()
    });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    requireAdmin(authContext);
    return json(res, 200, { users: db.users.map(safeUser) });
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    requireAdmin(authContext);
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    if (db.users.some((user) => user.username === username)) {
      return json(res, 409, { error: "Username gia' esistente." });
    }
    const user = await normalizeUserPayload({ ...body, username, totpEnabled: false });
    db.users.push(user);
    recordActivity(db, "user-created", `Utente ${user.username} creato.`, { userId: user.id });
    await writeDb(DB_PATH, db);
    return json(res, 201, { user: safeUser(user) });
  }

  if (parts[1] === "users" && parts.length === 5 && parts[3] === "totp" && parts[4] === "prepare" && req.method === "POST") {
    requireAdmin(authContext);
    const id = decodeURIComponent(parts[2]);
    const existing = db.users.find((user) => user.id === id);
    if (!existing) return json(res, 404, { error: "Utente non trovato." });
    const body = await readBody(req);
    const username = normalizeUsername(body.username || existing.username);
    const previewUser = { ...existing, username };
    const totpSecret = createTotpSecret();
    return json(res, 200, {
      totpSecret,
      otpAuthUri: buildOtpAuthUri(previewUser, totpSecret)
    });
  }

  if (parts[1] === "users" && parts.length === 3) {
    requireAdmin(authContext);
    const id = decodeURIComponent(parts[2]);
    const existing = db.users.find((user) => user.id === id);
    if (!existing) return json(res, 404, { error: "Utente non trovato." });

    if (req.method === "PUT") {
      const body = await readBody(req);
      const requestedUsername = normalizeUsername(body.username);
      if (db.users.some((user) => user.id !== id && user.username === requestedUsername)) {
        return json(res, 409, { error: "Username gia' esistente." });
      }
      const incomingSecret = body.totpSecret ? normalizeTotpSecret(body.totpSecret) : "";
      const enablingOrChangingTotp = body.totpEnabled === true
        && incomingSecret
        && (!existing.totpEnabled || incomingSecret !== existing.totpSecret);

      if (enablingOrChangingTotp && !verifyTotp(incomingSecret, body.totpCode)) {
        return json(res, 400, { error: "Codice 2FA non valido. La configurazione non e' stata salvata." });
      }

      if (body.totpEnabled === true && !incomingSecret && !existing.totpSecret) {
        return json(res, 400, { error: "Prepara prima un QR code 2FA e verifica il codice generato." });
      }

      const updated = await normalizeUserPayload({
        ...body,
        username: requestedUsername,
        totpSecret: incomingSecret || existing.totpSecret,
        totpEnabled: body.totpEnabled
      }, existing);
      if (countReadyAdmins(db.users, updated) === 0) {
        return json(res, 400, { error: "Deve rimanere almeno un amministratore attivo." });
      }
      db.users = db.users.map((user) => user.id === id ? updated : user);
      if (updated.enabled === false) db.sessions = db.sessions.filter((session) => session.userId !== updated.id);
      recordActivity(db, "user-updated", `Utente ${updated.username} aggiornato.`, { userId: updated.id });
      await writeDb(DB_PATH, db);
      return json(res, 200, { user: safeUser(updated) });
    }

    if (req.method === "DELETE") {
      if (existing.id === authContext.user.id) return json(res, 400, { error: "Non puoi eliminare l'utente con cui sei collegato." });
      if (countReadyAdmins(db.users, null, existing.id) === 0) {
        return json(res, 400, { error: "Deve rimanere almeno un amministratore attivo." });
      }
      db.users = db.users.filter((user) => user.id !== existing.id);
      db.sessions = db.sessions.filter((session) => session.userId !== existing.id);
      recordActivity(db, "user-deleted", `Utente ${existing.username} eliminato.`, { userId: existing.id });
      await writeDb(DB_PATH, db);
      return json(res, 200, { ok: true });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/preview") {
    const body = await readBody(req);
    const host = normalizeHost(body);
    const validation = validateHost(host);
    return json(res, validation.valid ? 200 : 422, {
      validation,
      config: renderApacheConfig(host, db.certificates)
    });
  }

  if (parts[1] === "hosts" && parts.length === 2 && req.method === "POST") {
    const body = await readBody(req);
    const host = normalizeHost(body);
    const validation = validateHost(host);
    if (!validation.valid) return json(res, 422, { validation });
    db.hosts.push(host);
    recordActivity(db, "host-created", `Host ${host.serverName} creato.`, { hostId: host.id });
    await writeDb(DB_PATH, db);
    return json(res, 201, { host, validation });
  }

  if (parts[1] === "hosts" && parts.length >= 3) {
    const id = decodeURIComponent(parts[2]);
    const host = findHost(db, id);
    if (!host) return json(res, 404, { error: "Host non trovato." });

    if (req.method === "GET" && parts.length === 4 && parts[3] === "config") {
      return text(res, 200, renderApacheConfig(host, db.certificates));
    }

    if (req.method === "PUT" && parts.length === 3) {
      const body = await readBody(req);
      const updated = normalizeHost(body, host);
      const validation = validateHost(updated);
      if (!validation.valid) return json(res, 422, { validation });
      db.hosts = db.hosts.map((item) => item.id === host.id ? updated : item);
      recordActivity(db, "host-updated", `Host ${updated.serverName} aggiornato.`, { hostId: updated.id });
      await writeDb(DB_PATH, db);
      return json(res, 200, { host: updated, validation });
    }

    if (req.method === "DELETE" && parts.length === 3) {
      db.hosts = db.hosts.filter((item) => item.id !== host.id);
      recordActivity(db, "host-deleted", `Host ${host.serverName} eliminato.`, { hostId: host.id });
      await writeDb(DB_PATH, db);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && parts.length === 4 && parts[3] === "duplicate") {
      const clone = normalizeHost({
        ...host,
        id: crypto.randomUUID(),
        serverName: `copy.${host.serverName}`
      });
      db.hosts.push(clone);
      recordActivity(db, "host-duplicated", `Host ${host.serverName} duplicato.`, { hostId: clone.id });
      await writeDb(DB_PATH, db);
      return json(res, 201, { host: clone });
    }

    if (req.method === "POST" && parts.length === 4 && parts[3] === "deploy") {
      const body = await readBody(req);
      const validation = validateHost(host);
      if (!validation.valid) return json(res, 422, { validation });
      const deployed = await deployApacheConfig(host, db, { reload: body.reload === true });
      recordActivity(db, "host-deployed", `Config ${host.serverName} esportata.`, { hostId: host.id, deployed });
      await writeDb(DB_PATH, db);
      return json(res, 200, { deployed, validation });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/certificates/ovh") {
    const body = await readBody(req);
    const result = await requestOvhCertificate(body);
    if (result.status === "command-ready") {
      recordActivity(db, "certificate-command", `Comando certbot ${result.certName} generato.`, { command: result.command });
      await writeDb(DB_PATH, db);
      return json(res, 200, { result });
    }

    const paths = certificatePaths(result.certName);
    const cert = {
      id: crypto.randomUUID(),
      name: result.certName,
      provider: "ovh",
      domains: result.domains,
      email: String(body.email || "").trim(),
      status: result.status,
      certificateFile: paths.certificateFile,
      certificateKeyFile: paths.certificateKeyFile,
      caCertificateFile: paths.caCertificateFile,
      command: result.command,
      credentialsPath: result.credentialsPath,
      createdAt: new Date().toISOString()
    };
    db.certificates.unshift(cert);
    recordActivity(db, "certificate", `Certificato ${cert.name}: ${cert.status}.`, { certificateId: cert.id });
    await writeDb(DB_PATH, db);
    return json(res, result.status === "issued" ? 201 : 200, { certificate: cert, result });
  }

  return json(res, 404, { error: "Endpoint non trovato." });
}

async function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!target.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");

  try {
    await access(target);
    const ext = path.extname(target);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    createReadStream(target).pipe(res);
  } catch {
    const index = path.join(PUBLIC_DIR, "index.html");
    res.writeHead(200, { "content-type": MIME_TYPES[".html"], "cache-control": "no-cache" });
    createReadStream(index).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    const status = error.status || 500;
    json(res, status, {
      error: error.message || "Errore interno.",
      details: error.validation || error.output || undefined
    });
  }
});

server.listen(PORT, () => {
  console.log(`Apache Proxy Manager listening on http://localhost:${PORT}`);
});
