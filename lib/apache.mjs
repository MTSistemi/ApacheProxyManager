const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;

export const PROXY_PROTOCOLS = ["ajp", "http", "https", "ws", "wss"];

export function sanitizeConfName(serverName) {
  return String(serverName || "host")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "host";
}

export function quoteApache(value) {
  const text = String(value ?? "");
  if (!text) return '""';
  if (/^[^\s"\\]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function cleanPath(path, fallback = "/") {
  const value = String(path || fallback).trim();
  return value.startsWith("/") ? value : `/${value}`;
}

function cleanLines(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((line) => line.trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function targetUrl(rule) {
  const protocol = PROXY_PROTOCOLS.includes(rule.protocol) ? rule.protocol : "http";
  const host = String(rule.targetHost || "").trim();
  const port = Number(rule.targetPort);
  const path = cleanPath(rule.targetPath || rule.path || "/");
  const portPart = Number.isFinite(port) && port > 0 ? `:${port}` : "";
  return `${protocol}://${host}${portPart}${path}`;
}

function renderProxyRule(rule) {
  const sourcePath = cleanPath(rule.path);
  const target = targetUrl(rule);
  const options = [];

  if (rule.nocanon) options.push("nocanon");
  if (rule.retry !== "" && rule.retry !== undefined && rule.retry !== null) {
    options.push(`retry=${Number(rule.retry) || 0}`);
  }
  if (rule.timeout !== "" && rule.timeout !== undefined && rule.timeout !== null) {
    options.push(`timeout=${Number(rule.timeout) || 0}`);
  }

  const suffix = options.length ? ` ${options.join(" ")}` : "";
  const lines = [`  ProxyPass ${quoteApache(sourcePath)} ${quoteApache(target)}${suffix}`];
  if (rule.reverse !== false && !["ws", "wss"].includes(rule.protocol)) {
    lines.push(`  ProxyPassReverse ${quoteApache(sourcePath)} ${quoteApache(target)}`);
  }
  return lines;
}

function renderRedirect(redirect) {
  const from = cleanPath(redirect.from || "/");
  const to = String(redirect.to || "").trim();
  if (!to) return [];

  const status = String(redirect.status || "temporary").trim().toLowerCase();
  const statusPart = ["permanent", "temp", "temporary", "seeother", "gone"].includes(status)
    ? (status === "temporary" ? "" : ` ${status}`)
    : "";

  return [`  Redirect${statusPart} ${quoteApache(from)} ${quoteApache(to)}`];
}

function sslCertificateLines(host, certificates = []) {
  const ssl = host.ssl || {};
  const managed = certificates.find((cert) => cert.id && cert.id === ssl.managedCertificateId);
  const certFile = ssl.certificateFile || managed?.certificateFile;
  const keyFile = ssl.certificateKeyFile || managed?.certificateKeyFile;
  const chainFile = ssl.caCertificateFile || managed?.caCertificateFile;

  const lines = ["  SSLEngine on"];
  for (const directive of cleanLines(host.sslDirectives)) {
    lines.push(`  ${directive}`);
  }
  if (certFile) lines.push(`  SSLCertificateFile ${quoteApache(certFile)}`);
  if (keyFile) lines.push(`  SSLCertificateKeyFile ${quoteApache(keyFile)}`);
  if (chainFile) lines.push(`  SSLCACertificateFile ${quoteApache(chainFile)}`);
  return lines;
}

function renderHostBody(host, certificates) {
  const lines = [];
  lines.push(`  ServerName ${host.serverName}`);

  const aliases = Array.isArray(host.serverAliases) ? host.serverAliases.filter(Boolean) : [];
  if (aliases.length) lines.push(`  ServerAlias ${aliases.join(" ")}`);

  if (host.useCanonicalName) lines.push(`  UseCanonicalName ${host.useCanonicalName}`);
  if (host.serverAdmin) lines.push(`  ServerAdmin ${quoteApache(host.serverAdmin)}`);
  if (host.documentRoot) lines.push(`  DocumentRoot ${quoteApache(host.documentRoot)}`);
  if (host.proxyPreserveHost !== false) lines.push("  ProxyPreserveHost On");

  const accessLog = host.logs?.access;
  const errorLog = host.logs?.error;
  if (accessLog) lines.push(`  CustomLog ${quoteApache(accessLog)} combined`);
  if (errorLog) lines.push(`  ErrorLog ${quoteApache(errorLog)}`);

  if (host.ssl?.enabled) lines.push(...sslCertificateLines(host, certificates));

  const redirects = Array.isArray(host.redirects) ? host.redirects : [];
  if (redirects.length) lines.push("");
  for (const redirect of redirects) {
    lines.push(...renderRedirect(redirect));
  }

  const proxyRules = Array.isArray(host.proxyRules) ? host.proxyRules : [];
  if (proxyRules.length) lines.push("");
  for (const rule of proxyRules) {
    lines.push(...renderProxyRule(rule));
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();

  const advanced = cleanLines(host.advancedDirectives);
  if (advanced.length) {
    lines.push("");
    for (const directive of advanced) lines.push(`  ${directive}`);
  }

  return lines;
}

function renderSslHost(host, certificates) {
  const httpsPort = Number(host.httpsPort) || 443;
  const lines = [`<VirtualHost *:${httpsPort}>`];
  lines.push(...renderHostBody(host, certificates));
  lines.push("</VirtualHost>");
  return lines.join("\n");
}

function renderHttpHost(host) {
  const httpPort = Number(host.httpPort) || 80;
  const lines = [`<VirtualHost *:${httpPort}>`];
  lines.push(`  ServerName ${host.serverName}`);
  const aliases = Array.isArray(host.serverAliases) ? host.serverAliases.filter(Boolean) : [];
  if (aliases.length) lines.push(`  ServerAlias ${aliases.join(" ")}`);
  if (host.serverAdmin) lines.push(`  ServerAdmin ${quoteApache(host.serverAdmin)}`);

  if (host.forceSsl && host.ssl?.enabled) {
    lines.push("  RewriteEngine On");
    lines.push("  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]");
  } else {
    if (host.documentRoot) lines.push(`  DocumentRoot ${quoteApache(host.documentRoot)}`);
    for (const rule of Array.isArray(host.proxyRules) ? host.proxyRules : []) {
      lines.push(...renderProxyRule(rule));
    }
  }

  lines.push("</VirtualHost>");
  return lines.join("\n");
}

export function renderApacheConfig(host, certificates = []) {
  const blocks = [];
  if (host.enableHttp) blocks.push(renderHttpHost(host));
  if (host.ssl?.enabled || !host.enableHttp) blocks.push(renderSslHost(host, certificates));
  return `${blocks.join("\n\n")}\n`;
}

export function validateHost(host) {
  const errors = [];
  const warnings = [];

  if (!host.serverName || !HOST_RE.test(host.serverName)) {
    errors.push("ServerName non valido.");
  }

  if (host.ssl?.enabled) {
    const hasManaged = Boolean(host.ssl.managedCertificateId);
    if (!hasManaged && !host.ssl.certificateFile) errors.push("SSL attivo ma manca SSLCertificateFile.");
    if (!hasManaged && !host.ssl.certificateKeyFile) errors.push("SSL attivo ma manca SSLCertificateKeyFile.");
  }

  for (const [index, rule] of (host.proxyRules || []).entries()) {
    if (!cleanPath(rule.path).startsWith("/")) errors.push(`Proxy rule ${index + 1}: path non valido.`);
    if (!PROXY_PROTOCOLS.includes(rule.protocol)) errors.push(`Proxy rule ${index + 1}: protocollo non supportato.`);
    if (!rule.targetHost) errors.push(`Proxy rule ${index + 1}: host target mancante.`);
    const port = Number(rule.targetPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push(`Proxy rule ${index + 1}: porta target non valida.`);
    }
  }

  if ((host.proxyRules || []).some((rule) => rule.protocol === "ajp")) {
    warnings.push("AJP richiede mod_proxy e mod_proxy_ajp abilitati in Apache.");
  }

  if (host.forceSsl && !host.enableHttp) {
    warnings.push("Force SSL e' attivo, ma il VirtualHost HTTP non e' abilitato.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function apacheModuleHint() {
  return "a2enmod ssl proxy proxy_ajp proxy_http proxy_wstunnel rewrite headers";
}
