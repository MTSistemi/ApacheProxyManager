const state = {
  hosts: [],
  certificates: [],
  users: [],
  activity: [],
  environment: {},
  apacheModuleHint: "",
  dashboard: null,
  currentUser: null,
  activeHostId: "",
  activeTab: "dashboard",
  selectedUserId: "",
  userTotpSecret: "",
  userOtpAuthUri: "",
  previewTimer: null,
  dashboardTimer: null,
  logsTimer: null,
  theme: localStorage.getItem("apm-theme") || "light"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function iconFallback(name) {
  const map = {
    plus: "+",
    copy: "Copy",
    "trash-2": "Del",
    save: "Save",
    "refresh-cw": "Refresh",
    upload: "Export",
    terminal: "Cmd",
    "shield-check": "SSL",
    "log-in": "In",
    "log-out": "Out",
    check: "OK",
    moon: "Dark",
    sun: "Light",
    x: "X"
  };
  return map[name] || "";
}

function renderIcons() {
  $$("[data-icon]").forEach((node) => {
    node.setAttribute("data-lucide", node.dataset.icon);
    if (!window.lucide) node.textContent = iconFallback(node.dataset.icon);
  });
  if (window.lucide) window.lucide.createIcons();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.error || "Errore API.";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function showNotice(message, type = "success") {
  const notice = $("#notice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    notice.hidden = true;
  }, 5200);
}

function showAuthNotice(message, type = "error") {
  const notice = $("#authNotice");
  if (!notice) return window.alert(message);
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showAuthNotice.timer);
  showAuthNotice.timer = window.setTimeout(() => {
    notice.hidden = true;
  }, 5200);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function statusLabel(status) {
  const map = {
    online: "Online",
    offline: "Offline",
    degraded: "Parziale",
    disabled: "Disabilitato",
    unknown: "Non configurato"
  };
  return map[status] || status || "-";
}

function applyTheme(theme = state.theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("apm-theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
  const dark = state.theme === "dark";
  const darkInput = $("#darkModeInput");
  const toggle = $("#themeToggleButton");
  if (darkInput) darkInput.checked = dark;
  if (toggle) {
    toggle.innerHTML = `<span data-icon="${dark ? "sun" : "moon"}"></span>${dark ? "Light" : "Dark"}`;
    renderIcons();
  }
}

function showSetup() {
  $("#appShell").hidden = true;
  $("#authScreen").hidden = false;
  $("#authNotice").hidden = true;
  $("#setupPanel").hidden = false;
  $("#loginPanel").hidden = true;
  renderIcons();
}

function showLogin() {
  stopDashboardPolling();
  $("#appShell").hidden = true;
  $("#authScreen").hidden = false;
  $("#authNotice").hidden = true;
  $("#setupPanel").hidden = true;
  $("#loginPanel").hidden = false;
  $("#loginUsernameInput").focus();
  renderIcons();
}

function showApp() {
  $("#authScreen").hidden = true;
  $("#appShell").hidden = false;
  startDashboardPolling();
  renderIcons();
}

function activeHost() {
  return state.hosts.find((host) => host.id === state.activeHostId) || state.hosts[0];
}

function activeUser() {
  return state.users.find((user) => user.id === state.selectedUserId);
}

function splitList(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function certOptions(selectedId) {
  const options = ['<option value="">File manuali</option>'];
  for (const cert of state.certificates) {
    const selected = cert.id === selectedId ? " selected" : "";
    options.push(`<option value="${escapeHtml(cert.id)}"${selected}>${escapeHtml(cert.name)} (${escapeHtml(cert.status)})</option>`);
  }
  return options.join("");
}

function renderHostList() {
  const list = $("#hostList");
  list.innerHTML = state.hosts.map((host) => `
    <button class="host-item ${host.id === state.activeHostId ? "active" : ""}" type="button" data-host-id="${escapeHtml(host.id)}">
      <span>
        <strong>${escapeHtml(host.serverName || "nuovo-host.local")}</strong>
        <span>${escapeHtml((host.proxyRules || []).length)} route / ${host.ssl?.enabled ? "SSL" : "HTTP"}</span>
      </span>
      <i class="status-dot ${host.enabled ? "on" : ""}"></i>
    </button>
  `).join("");
}

function renderMetrics() {
  const hosts = state.hosts || [];
  const ajpRoutes = hosts.flatMap((host) => host.proxyRules || []).filter((rule) => rule.protocol === "ajp").length;
  const sslHosts = hosts.filter((host) => host.ssl?.enabled).length;
  const enabled = hosts.filter((host) => host.enabled).length;
  const online = state.dashboard?.totals?.online ?? "-";
  $("#metrics").innerHTML = `
    <div class="metric"><span>Host attivi</span><strong>${enabled}</strong></div>
    <div class="metric"><span>Host online</span><strong>${online}</strong></div>
    <div class="metric"><span>Route AJP</span><strong>${ajpRoutes}</strong></div>
    <div class="metric"><span>SSL</span><strong>${sslHosts}</strong></div>
  `;
}

function fillHostForm(host) {
  if (!host) return;
  $("#pageTitle").textContent = host.serverName || "Nuovo VirtualHost";
  $("#enabledInput").checked = host.enabled !== false;
  $("#serverNameInput").value = host.serverName || "";
  $("#serverAliasesInput").value = (host.serverAliases || []).join(" ");
  $("#serverAdminInput").value = host.serverAdmin || "";
  $("#documentRootInput").value = host.documentRoot || "";
  $("#httpPortInput").value = host.httpPort || 80;
  $("#httpsPortInput").value = host.httpsPort || 443;
  $("#enableHttpInput").checked = Boolean(host.enableHttp);
  $("#forceSslInput").checked = Boolean(host.forceSsl);
  $("#proxyPreserveHostInput").checked = host.proxyPreserveHost !== false;
  $("#accessLogInput").value = host.logs?.access || "";
  $("#errorLogInput").value = host.logs?.error || "";
  $("#sslEnabledInput").checked = Boolean(host.ssl?.enabled);
  $("#managedCertificateInput").innerHTML = certOptions(host.ssl?.managedCertificateId || "");
  $("#certificateFileInput").value = host.ssl?.certificateFile || "";
  $("#certificateKeyFileInput").value = host.ssl?.certificateKeyFile || "";
  $("#caCertificateFileInput").value = host.ssl?.caCertificateFile || "";
  $("#sslDirectivesInput").value = Array.isArray(host.sslDirectives)
    ? host.sslDirectives.join("\n")
    : (host.sslDirectives || "");
  renderRedirectRows(host.redirects || []);
  renderProxyRows(host.proxyRules || []);
  schedulePreview();
}

function renderRedirectRows(redirects) {
  $("#redirectRows").innerHTML = redirects.map((redirect) => `
    <tr data-redirect-id="${escapeHtml(redirect.id || uid("redirect"))}">
      <td><input data-field="from" value="${escapeHtml(redirect.from || "/")}"></td>
      <td><input data-field="to" value="${escapeHtml(redirect.to || "")}"></td>
      <td>
        <select data-field="status">
          ${["temporary", "permanent", "temp", "seeother", "gone"].map((status) => `
            <option value="${status}" ${status === (redirect.status || "temporary") ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </td>
      <td>
        <button class="ghost-button icon-only" type="button" data-remove-redirect aria-label="Elimina redirect">
          <span data-icon="x"></span>
        </button>
      </td>
    </tr>
  `).join("");
  renderIcons();
}

function renderProxyRows(rules) {
  $("#proxyRows").innerHTML = rules.map((rule) => `
    <tr data-rule-id="${escapeHtml(rule.id || uid("proxy"))}">
      <td><input data-field="path" value="${escapeHtml(rule.path || "/")}"></td>
      <td>
        <select data-field="protocol">
          ${["ajp", "http", "https", "ws", "wss"].map((protocol) => `
            <option value="${protocol}" ${protocol === (rule.protocol || "http") ? "selected" : ""}>${protocol}</option>
          `).join("")}
        </select>
      </td>
      <td><input data-field="targetHost" value="${escapeHtml(rule.targetHost || "")}"></td>
      <td><input class="narrow" data-field="targetPort" type="number" min="1" max="65535" value="${escapeHtml(rule.targetPort || 80)}"></td>
      <td><input data-field="targetPath" value="${escapeHtml(rule.targetPath || rule.path || "/")}"></td>
      <td><label class="check"><input data-field="reverse" type="checkbox" ${rule.reverse !== false ? "checked" : ""}> Reverse</label></td>
      <td>
        <button class="ghost-button icon-only" type="button" data-remove-proxy aria-label="Elimina proxy">
          <span data-icon="x"></span>
        </button>
      </td>
    </tr>
  `).join("");
  renderIcons();
}

function collectRedirects() {
  return $$("#redirectRows tr").map((row) => ({
    id: row.dataset.redirectId || uid("redirect"),
    from: $('[data-field="from"]', row).value.trim() || "/",
    to: $('[data-field="to"]', row).value.trim(),
    status: $('[data-field="status"]', row).value
  })).filter((redirect) => redirect.to);
}

function collectProxyRules() {
  return $$("#proxyRows tr").map((row) => ({
    id: row.dataset.ruleId || uid("proxy"),
    path: $('[data-field="path"]', row).value.trim() || "/",
    protocol: $('[data-field="protocol"]', row).value,
    targetHost: $('[data-field="targetHost"]', row).value.trim(),
    targetPort: Number($('[data-field="targetPort"]', row).value || 80),
    targetPath: $('[data-field="targetPath"]', row).value.trim() || "/",
    reverse: $('[data-field="reverse"]', row).checked,
    nocanon: false,
    retry: "",
    timeout: ""
  }));
}

function collectHostFromForm() {
  const current = activeHost() || {};
  return {
    ...current,
    enabled: $("#enabledInput").checked,
    serverName: $("#serverNameInput").value.trim(),
    serverAliases: splitList($("#serverAliasesInput").value),
    serverAdmin: $("#serverAdminInput").value.trim(),
    useCanonicalName: current.useCanonicalName || "Off",
    documentRoot: $("#documentRootInput").value.trim(),
    enableHttp: $("#enableHttpInput").checked,
    forceSsl: $("#forceSslInput").checked,
    httpPort: Number($("#httpPortInput").value || 80),
    httpsPort: Number($("#httpsPortInput").value || 443),
    proxyPreserveHost: $("#proxyPreserveHostInput").checked,
    logs: {
      access: $("#accessLogInput").value.trim(),
      error: $("#errorLogInput").value.trim()
    },
    ssl: {
      enabled: $("#sslEnabledInput").checked,
      managedCertificateId: $("#managedCertificateInput").value,
      certificateFile: $("#certificateFileInput").value.trim(),
      certificateKeyFile: $("#certificateKeyFileInput").value.trim(),
      caCertificateFile: $("#caCertificateFileInput").value.trim()
    },
    sslDirectives: $("#sslDirectivesInput").value,
    redirects: collectRedirects(),
    proxyRules: collectProxyRules(),
    advancedDirectives: current.advancedDirectives || ""
  };
}

function schedulePreview() {
  if (!state.currentUser) return;
  window.clearTimeout(state.previewTimer);
  state.previewTimer = window.setTimeout(updatePreview, 180);
}

async function updatePreview() {
  const host = collectHostFromForm();
  try {
    const payload = await api("/api/preview", {
      method: "POST",
      body: JSON.stringify(host)
    });
    $("#configPreview").textContent = payload.config;
    if (payload.validation?.warnings?.length && state.activeTab === "config") {
      showNotice(payload.validation.warnings.join(" "), "warn");
    }
  } catch (error) {
    $("#configPreview").textContent = error.payload?.config || "";
    showNotice(error.message, "error");
  }
}

function renderCertificates() {
  const list = $("#certificateList");
  if (!state.certificates.length) {
    list.innerHTML = '<div class="activity-item"><strong>Nessun certificato</strong><span>OVH DNS-01</span></div>';
    return;
  }
  list.innerHTML = state.certificates.map((cert) => `
    <div class="cert-card">
      <strong>${escapeHtml(cert.name)}</strong>
      <span>${escapeHtml(cert.provider)} / ${escapeHtml(cert.status)} / ${escapeHtml((cert.domains || []).join(", "))}</span>
      <code>${escapeHtml(cert.certificateFile || "")}</code>
      <code>${escapeHtml(cert.certificateKeyFile || "")}</code>
    </div>
  `).join("");
}

function resourceCard(label, value, detail, percent, accent = "var(--accent)") {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="resource-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail || "")}</small>
      <div class="meter"><i style="width:${safePercent}%; background:${accent}"></i></div>
    </div>
  `;
}

function renderDashboard() {
  const dashboard = state.dashboard;
  if (!dashboard) {
    $("#resourceGrid").innerHTML = resourceCard("CPU", "-", "In attesa dati", 0);
    $("#dashboardHostRows").innerHTML = "";
    return;
  }

  const system = dashboard.system || {};
  $("#dashboardUpdatedAt").textContent = dashboard.generatedAt
    ? `Aggiornato ${new Date(dashboard.generatedAt).toLocaleTimeString()}`
    : "-";
  $("#resourceGrid").innerHTML = [
    resourceCard("CPU", `${system.cpu?.percent ?? 0}%`, `${system.cpu?.cores ?? "-"} core`, system.cpu?.percent, "var(--blue)"),
    resourceCard("RAM", `${system.memory?.percent ?? 0}%`, `${formatBytes(system.memory?.used)} / ${formatBytes(system.memory?.total)}`, system.memory?.percent, "var(--accent)"),
    resourceCard("Disco", system.disk?.unavailable ? "-" : `${system.disk?.percent ?? 0}%`, system.disk?.unavailable ? "Non disponibile" : `${formatBytes(system.disk?.used)} / ${formatBytes(system.disk?.total)}`, system.disk?.percent, "var(--accent-alt)"),
    resourceCard("Uptime", `${Math.floor((system.uptimeSeconds || 0) / 3600)}h`, system.hostname || "", 100, "var(--indigo)")
  ].join("");

  $("#dashboardHostRows").innerHTML = (dashboard.hosts || []).map((host) => {
    const detail = (host.targets || []).map((target) => {
      const label = `${target.protocol}://${target.host}:${target.port}`;
      return `${label} ${target.online ? `${target.latencyMs}ms` : target.error || "offline"}`;
    }).join(" | ") || "Nessun backend configurato";
    return `
      <tr>
        <td><strong>${escapeHtml(host.serverName)}</strong></td>
        <td><span class="status-badge ${escapeHtml(host.status)}">${escapeHtml(statusLabel(host.status))}</span></td>
        <td>${escapeHtml(`${host.routesOnline}/${host.routesTotal}`)}</td>
        <td>${escapeHtml(detail)}</td>
      </tr>
    `;
  }).join("");
  renderMetrics();
}

function renderUsers() {
  const rows = $("#userRows");
  rows.innerHTML = state.users.map((user) => `
    <tr data-user-id="${escapeHtml(user.id)}" class="${user.id === state.selectedUserId ? "active" : ""}">
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${escapeHtml(user.displayName || "")}</td>
      <td>${user.role === "admin" ? "Admin" : "Operatore"}</td>
      <td>${user.enabled ? "Attivo" : "Disabilitato"}</td>
      <td>${user.totpEnabled ? "Attiva" : "No"}</td>
      <td>${user.lastLoginAt ? escapeHtml(new Date(user.lastLoginAt).toLocaleString()) : "-"}</td>
    </tr>
  `).join("");
}

function renderActivity() {
  const list = $("#activityList");
  if (!state.activity.length) {
    list.innerHTML = '<div class="activity-item"><strong>Nessuna attivita</strong><span></span></div>';
    return;
  }
  list.innerHTML = state.activity.map((item) => `
    <div class="activity-item">
      <strong>${escapeHtml(item.message)}</strong>
      <span>${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
    </div>
  `).join("");
}

function renderLogSelectors() {
  const select = $("#logHostSelect");
  if (!select) return;
  const current = select.value || activeHost()?.id || "";
  select.innerHTML = state.hosts.map((host) => `
    <option value="${escapeHtml(host.id)}" ${host.id === current ? "selected" : ""}>${escapeHtml(host.serverName)}</option>
  `).join("");
}

async function updateLogs() {
  if (!state.currentUser) return;
  try {
    const general = await api("/api/logs?kind=general");
    state.activity = general.activity || state.activity;
    renderActivity();

    renderLogSelectors();
    const hostId = $("#logHostSelect").value || activeHost()?.id || "";
    const kind = $("#logKindSelect").value || "access";
    if (!hostId) {
      $("#virtualHostLogPreview").textContent = "Nessun host selezionato.";
      return;
    }
    const hostLog = await api(`/api/logs?hostId=${encodeURIComponent(hostId)}&kind=${encodeURIComponent(kind)}`);
    $("#virtualHostLogPreview").textContent = hostLog.available
      ? hostLog.content || "Log vuoto."
      : `${hostLog.path || "Log"} non disponibile: ${hostLog.error}`;
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function renderSettings() {
  $("#settingsGeneratedDir").value = state.environment.generatedDir || "";
  $("#settingsCertbotBin").value = state.environment.certbotBin || "";
  $("#settingsList").innerHTML = [
    ["Sites available", state.environment.apacheSitesAvailable || "Non configurato"],
    ["Sites enabled", state.environment.apacheSitesEnabled || "Non configurato"],
    ["Config test", state.environment.apacheTestCommand || "Non configurato"],
    ["Reload", state.environment.apacheReloadCommand || "Non configurato"],
    ["Moduli", state.apacheModuleHint || ""]
  ].map(([label, value]) => `
    <div class="activity-item">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `).join("");
}

function renderCurrentUser() {
  const user = state.currentUser;
  $("#currentUserPill").textContent = user ? `${user.displayName || user.username} / ${user.role}` : "";
  const isAdmin = user?.role === "admin";
  $$(".admin-only").forEach((node) => {
    node.hidden = !isAdmin;
  });
  if (!isAdmin && state.activeTab === "users") setActiveTab("host");
  $$(".host-action").forEach((node) => {
    node.hidden = !["host", "routes", "config"].includes(state.activeTab);
  });
}

async function drawQrCode(uri) {
  const canvas = $("#userQrCanvas");
  canvas.hidden = !uri;
  if (!uri) return;

  if (window.QRCode?.toCanvas) {
    try {
      await window.QRCode.toCanvas(canvas, uri, {
        width: 196,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#ffffff"
        }
      });
    } catch {
      canvas.hidden = true;
      $("#userTotpStatus").textContent = "QR non generato: usa l'URI otpauth qui sotto.";
    }
  } else {
    canvas.hidden = true;
    $("#userTotpStatus").textContent = "Libreria QR non caricata: usa l'URI otpauth qui sotto.";
  }
}

function fillUserForm(user = null) {
  const isNew = !user;
  $("#userFormTitle").textContent = isNew ? "Nuovo utente" : `Utente ${user.username}`;
  $("#userUsernameInput").value = user?.username || "";
  $("#userDisplayNameInput").value = user?.displayName || "";
  $("#userEmailInput").value = user?.email || "";
  $("#userRoleInput").value = user?.role || "operator";
  $("#userEnabledInput").checked = user?.enabled !== false;
  $("#userPasswordInput").value = "";
  $("#userPasswordInput").placeholder = isNew ? "" : "Lascia vuoto per non cambiarla";
  $("#deleteUserButton").disabled = isNew || user?.id === state.currentUser?.id;
  $("#enableUserTotpButton").disabled = isNew || user?.totpEnabled || Boolean(state.userTotpSecret);
  $("#regenerateUserTotpButton").disabled = isNew;
  $("#confirmUserTotpButton").disabled = isNew || !state.userTotpSecret;
  $("#disableUserTotpButton").disabled = isNew || !user?.totpEnabled;
  $("#userTotpCodeInput").disabled = isNew || !state.userTotpSecret;

  if (isNew) {
    $("#userTotpStatus").textContent = "Salva l'utente, poi abilita la 2FA da questo pannello.";
    $("#userTotpSecretInput").value = "";
    $("#userOtpUriInput").value = "";
    $("#userTotpCodeInput").value = "";
    drawQrCode("");
    return;
  }

  if (state.userTotpSecret && state.userOtpAuthUri) {
    $("#userTotpStatus").textContent = "Scansiona il QR, inserisci il codice generato e premi Conferma 2FA.";
    $("#userTotpSecretInput").value = state.userTotpSecret;
    $("#userOtpUriInput").value = state.userOtpAuthUri;
    $("#userTotpCodeInput").value = "";
    drawQrCode(state.userOtpAuthUri);
    return;
  }

  $("#userTotpStatus").textContent = user.totpEnabled
    ? "2FA attiva. Rigenera il QR solo se devi associare un nuovo dispositivo."
    : "2FA non attiva.";
  $("#userTotpSecretInput").value = "";
  $("#userOtpUriInput").value = "";
  $("#userTotpCodeInput").value = "";
  drawQrCode("");
}

function renderAll() {
  renderHostList();
  renderMetrics();
  renderDashboard();
  renderCertificates();
  renderUsers();
  renderActivity();
  renderLogSelectors();
  renderSettings();
  renderCurrentUser();
  $("#moduleHint").textContent = state.apacheModuleHint || "a2enmod proxy proxy_ajp ssl";
  fillHostForm(activeHost());
  fillUserForm(activeUser());
  applyTheme(state.theme);
  renderIcons();
}

async function loadState(preferredHostId) {
  const payload = await api("/api/state");
  state.hosts = payload.hosts || [];
  state.certificates = payload.certificates || [];
  state.users = payload.users || [];
  state.activity = payload.activity || [];
  state.environment = payload.environment || {};
  state.apacheModuleHint = payload.apacheModuleHint || "";
  state.currentUser = payload.currentUser || state.currentUser;
  if (!state.hosts.length) createDraftHost();
  state.activeHostId = preferredHostId || state.activeHostId || state.hosts[0]?.id || "";
  if (!state.selectedUserId || !state.users.some((user) => user.id === state.selectedUserId)) {
    state.selectedUserId = state.users[0]?.id || "";
  }
  renderAll();
}

async function loadDashboard() {
  if (!state.currentUser) return;
  try {
    state.dashboard = await api("/api/dashboard");
    renderDashboard();
  } catch (error) {
    if (error.status === 401 || error.status === 428) showLogin();
  }
}

function startDashboardPolling() {
  window.clearInterval(state.dashboardTimer);
  loadDashboard();
  state.dashboardTimer = window.setInterval(loadDashboard, 5000);
}

function stopDashboardPolling() {
  window.clearInterval(state.dashboardTimer);
  window.clearInterval(state.logsTimer);
}

function createDraftHost() {
  const host = {
    id: uid("draft"),
    draft: true,
    enabled: true,
    serverName: "nuovo.dominio.it",
    serverAliases: [],
    serverAdmin: "admin@dominio.it",
    useCanonicalName: "Off",
    documentRoot: "/var/www/html",
    enableHttp: true,
    forceSsl: true,
    httpPort: 80,
    httpsPort: 443,
    proxyPreserveHost: true,
    logs: {
      access: "/var/log/apache2/nuovo.dominio.it_access.log",
      error: "/var/log/apache2/nuovo.dominio.it_error.log"
    },
    ssl: {
      enabled: true,
      certificateFile: "",
      certificateKeyFile: "",
      caCertificateFile: "",
      managedCertificateId: ""
    },
    sslDirectives: "SSLProtocol all -SSLv2\nSSLCipherSuite ALL:!ADH:!EXPORT:!SSLv2:RC4+RSA:+HIGH:+MEDIUM:+LOW",
    redirects: [],
    proxyRules: [
      {
        id: uid("proxy"),
        path: "/app",
        protocol: "ajp",
        targetHost: "app.internal.local",
        targetPort: 8009,
        targetPath: "/app",
        reverse: true
      }
    ],
    advancedDirectives: ""
  };
  state.hosts.unshift(host);
  state.activeHostId = host.id;
}

async function saveHost() {
  const current = activeHost();
  const host = collectHostFromForm();
  const isDraft = Boolean(current?.draft);
  const body = { ...host };
  if (isDraft) delete body.id;
  const saved = await api(isDraft ? "/api/hosts" : `/api/hosts/${encodeURIComponent(host.id)}`, {
    method: isDraft ? "POST" : "PUT",
    body: JSON.stringify(body)
  });
  showNotice(`Host ${saved.host.serverName} salvato.`);
  await loadState(saved.host.id);
}

async function duplicateHost() {
  const host = activeHost();
  if (!host || host.draft) return;
  const payload = await api(`/api/hosts/${encodeURIComponent(host.id)}/duplicate`, { method: "POST" });
  showNotice(`Host duplicato: ${payload.host.serverName}.`);
  await loadState(payload.host.id);
}

async function deleteHost() {
  const host = activeHost();
  if (!host) return;
  if (host.draft) {
    state.hosts = state.hosts.filter((item) => item.id !== host.id);
    state.activeHostId = state.hosts[0]?.id || "";
    if (!state.hosts.length) createDraftHost();
    renderAll();
    return;
  }
  if (!window.confirm(`Eliminare ${host.serverName}?`)) return;
  await api(`/api/hosts/${encodeURIComponent(host.id)}`, { method: "DELETE" });
  showNotice(`Host ${host.serverName} eliminato.`);
  await loadState();
}

async function deployHost() {
  const host = activeHost();
  if (!host || host.draft) {
    showNotice("Salva l'host prima di esportare.", "warn");
    return;
  }
  const result = await api(`/api/hosts/${encodeURIComponent(host.id)}/deploy`, {
    method: "POST",
    body: JSON.stringify({ reload: false })
  });
  showNotice(`Config esportata in ${result.deployed.generatedPath}.`);
  await loadState(host.id);
}

function collectCertificatePayload(commandOnly) {
  return {
    commandOnly,
    certName: $("#certNameInput").value.trim(),
    email: $("#certEmailInput").value.trim(),
    domains: splitList($("#certDomainsInput").value),
    propagationSeconds: Number($("#propagationInput").value || 120),
    staging: $("#certStagingInput").checked,
    credentials: {
      endpoint: $("#ovhEndpointInput").value,
      applicationKey: $("#applicationKeyInput").value.trim(),
      applicationSecret: $("#applicationSecretInput").value.trim(),
      consumerKey: $("#consumerKeyInput").value.trim()
    }
  };
}

async function certificateAction(commandOnly) {
  if (!commandOnly && !window.confirm("Avviare certbot per richiedere il certificato?")) return;
  const result = await api("/api/certificates/ovh", {
    method: "POST",
    body: JSON.stringify(collectCertificatePayload(commandOnly))
  });
  if (commandOnly) {
    showNotice(`Comando pronto: ${result.result.command}`);
  } else {
    showNotice(`Certificato ${result.certificate.name} richiesto.`);
  }
  await loadState(state.activeHostId);
}

function newUserDraft() {
  state.selectedUserId = "";
  state.userTotpSecret = "";
  state.userOtpAuthUri = "";
  renderUsers();
  fillUserForm();
}

function collectUserPayload(existing = null) {
  const password = $("#userPasswordInput").value;
  const payload = {
    username: $("#userUsernameInput").value.trim(),
    displayName: $("#userDisplayNameInput").value.trim(),
    email: $("#userEmailInput").value.trim(),
    role: $("#userRoleInput").value,
    enabled: $("#userEnabledInput").checked,
    totpEnabled: Boolean(existing?.totpEnabled)
  };
  if (password) payload.password = password;
  return payload;
}

async function saveUser(event) {
  event?.preventDefault();
  const existing = activeUser();
  const payload = collectUserPayload(existing);

  const response = await api(existing ? `/api/users/${encodeURIComponent(existing.id)}` : "/api/users", {
    method: existing ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });

  showNotice(`Utente ${response.user.username} salvato.`);
  state.selectedUserId = response.user.id;
  state.userTotpSecret = "";
  state.userOtpAuthUri = "";
  await loadState(state.activeHostId);
}

async function deleteUser() {
  const user = activeUser();
  if (!user) return;
  if (!window.confirm(`Eliminare ${user.username}?`)) return;
  await api(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
  showNotice(`Utente ${user.username} eliminato.`);
  state.selectedUserId = "";
  state.userTotpSecret = "";
  state.userOtpAuthUri = "";
  await loadState(state.activeHostId);
}

async function prepareUserTotp() {
  const user = activeUser();
  if (!user) {
    showNotice("Salva l'utente prima di configurare la 2FA.", "warn");
    return;
  }
  const response = await api(`/api/users/${encodeURIComponent(user.id)}/totp/prepare`, {
    method: "POST",
    body: JSON.stringify({
      username: $("#userUsernameInput").value.trim() || user.username
    })
  });

  state.userTotpSecret = response.totpSecret;
  state.userOtpAuthUri = response.otpAuthUri;
  fillUserForm(user);
}

async function confirmUserTotp() {
  const user = activeUser();
  if (!user || !state.userTotpSecret) {
    showNotice("Genera prima il QR code 2FA.", "warn");
    return;
  }
  const totpCode = $("#userTotpCodeInput").value.trim();
  if (!/^\d{6}$/.test(totpCode)) {
    showNotice("Inserisci il codice a 6 cifre generato dall'app Authenticator.", "warn");
    return;
  }
  const payload = {
    ...collectUserPayload(user),
    totpEnabled: true,
    totpSecret: state.userTotpSecret,
    totpCode
  };
  const response = await api(`/api/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  state.selectedUserId = response.user.id;
  state.userTotpSecret = "";
  state.userOtpAuthUri = "";
  showNotice(`2FA verificata e salvata per ${response.user.username}.`);
  await loadState(state.activeHostId);
}

async function disableUserTotp() {
  const user = activeUser();
  if (!user) return;
  const payload = {
    ...collectUserPayload(user),
    totpEnabled: false
  };
  const response = await api(`/api/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  state.selectedUserId = response.user.id;
  state.userTotpSecret = "";
  state.userOtpAuthUri = "";
  showNotice(`2FA disabilitata per ${response.user.username}.`);
  await loadState(state.activeHostId);
}

function setActiveTab(tab) {
  if (tab === "users" && state.currentUser?.role !== "admin") tab = "host";
  state.activeTab = tab;
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
  const titles = {
    dashboard: "Dashboard",
    host: "Hosts",
    routes: "Route",
    config: "Config",
    certs: "Certificati",
    users: "Utenti",
    settings: "Impostazioni",
    logs: "Logs"
  };
  $("#pageTitle").textContent = titles[tab] || "Apache Proxy Manager";
  $$(".host-action").forEach((node) => {
    node.hidden = !["host", "routes", "config"].includes(tab);
  });
  if (tab === "dashboard") loadDashboard();
  if (tab === "config") updatePreview();
  if (tab === "logs") updateLogs();
  if (tab === "settings") renderSettings();
}

function withButtonLoading(button, task) {
  return async (event) => {
    event?.preventDefault();
    const original = button.innerHTML;
    const isAuthAction = Boolean(button.closest("#authScreen"));
    button.disabled = true;
    button.textContent = "Attendere";
    try {
      await task(event);
    } catch (error) {
      if (error.status === 401 || error.status === 428) showLogin();
      if (isAuthAction) showAuthNotice(error.message, "error");
      else showNotice(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      renderIcons();
    }
  };
}

async function submitSetup(event) {
  event.preventDefault();
  const password = $("#setupPasswordInput").value;
  if (password !== $("#setupPasswordConfirmInput").value) {
    showAuthNotice("Le password non coincidono.");
    return;
  }
  const response = await api("/api/setup/admin", {
    method: "POST",
    body: JSON.stringify({
      username: $("#setupUsernameInput").value.trim(),
      displayName: $("#setupDisplayNameInput").value.trim(),
      email: $("#setupEmailInput").value.trim(),
      password
    })
  });
  state.currentUser = response.user;
  showApp();
  await loadState();
}

async function submitLogin(event) {
  event.preventDefault();
  const response = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: $("#loginUsernameInput").value.trim(),
      password: $("#loginPasswordInput").value,
      totpCode: $("#loginTotpInput").value.trim()
    })
  });
  state.currentUser = response.user;
  $("#loginPasswordInput").value = "";
  $("#loginTotpInput").value = "";
  showApp();
  await loadState();
}

async function logout() {
  stopDashboardPolling();
  await api("/api/auth/logout", { method: "POST" });
  state.currentUser = null;
  showLogin();
}

function bindEvents() {
  applyTheme(state.theme);
  $("#setupPanel").addEventListener("submit", withButtonLoading($("#setupButton"), submitSetup));
  $("#loginPanel").addEventListener("submit", withButtonLoading($("#loginButton"), submitLogin));
  $("#logoutButton").addEventListener("click", withButtonLoading($("#logoutButton"), logout));
  $("#themeToggleButton").addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
  $("#darkModeInput").addEventListener("change", () => applyTheme($("#darkModeInput").checked ? "dark" : "light"));
  $("#refreshDashboardButton").addEventListener("click", loadDashboard);
  $("#refreshLogsButton").addEventListener("click", updateLogs);
  $("#logHostSelect").addEventListener("change", updateLogs);
  $("#logKindSelect").addEventListener("change", updateLogs);

  $("#newHostButton").addEventListener("click", () => {
    createDraftHost();
    renderAll();
  });

  $("#hostList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-host-id]");
    if (!button) return;
    state.activeHostId = button.dataset.hostId;
    renderAll();
  });

  $("#saveButton").addEventListener("click", withButtonLoading($("#saveButton"), saveHost));
  $("#duplicateButton").addEventListener("click", withButtonLoading($("#duplicateButton"), duplicateHost));
  $("#deleteButton").addEventListener("click", withButtonLoading($("#deleteButton"), deleteHost));
  $("#deployButton").addEventListener("click", withButtonLoading($("#deployButton"), deployHost));
  $("#refreshPreviewButton").addEventListener("click", updatePreview);
  $("#certCommandButton").addEventListener("click", withButtonLoading($("#certCommandButton"), () => certificateAction(true)));
  $("#certRequestButton").addEventListener("click", withButtonLoading($("#certRequestButton"), () => certificateAction(false)));

  $("#newUserButton").addEventListener("click", newUserDraft);
  $("#userForm").addEventListener("submit", withButtonLoading($("#saveUserButton"), saveUser));
  $("#deleteUserButton").addEventListener("click", withButtonLoading($("#deleteUserButton"), deleteUser));
  $("#enableUserTotpButton").addEventListener("click", withButtonLoading($("#enableUserTotpButton"), prepareUserTotp));
  $("#regenerateUserTotpButton").addEventListener("click", withButtonLoading($("#regenerateUserTotpButton"), prepareUserTotp));
  $("#confirmUserTotpButton").addEventListener("click", withButtonLoading($("#confirmUserTotpButton"), confirmUserTotp));
  $("#disableUserTotpButton").addEventListener("click", withButtonLoading($("#disableUserTotpButton"), disableUserTotp));
  $("#userRows").addEventListener("click", (event) => {
    const row = event.target.closest("[data-user-id]");
    if (!row) return;
    state.selectedUserId = row.dataset.userId;
    state.userTotpSecret = "";
    state.userOtpAuthUri = "";
    renderUsers();
    fillUserForm(activeUser());
  });

  $$(".tab").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));

  $("#hostForm").addEventListener("input", schedulePreview);
  $("#hostForm").addEventListener("change", schedulePreview);
  document.addEventListener("input", (event) => {
    if (event.target.closest("#redirectRows") || event.target.closest("#proxyRows")) schedulePreview();
  });
  document.addEventListener("change", (event) => {
    if (event.target.closest("#redirectRows") || event.target.closest("#proxyRows")) schedulePreview();
  });

  $("#addRedirectButton").addEventListener("click", () => {
    const host = collectHostFromForm();
    host.redirects.push({
      id: uid("redirect"),
      from: "/",
      to: `https://${host.serverName || "dominio.it"}/`,
      status: "temporary"
    });
    renderRedirectRows(host.redirects);
    schedulePreview();
  });

  $("#addProxyButton").addEventListener("click", () => {
    const host = collectHostFromForm();
    host.proxyRules.push({
      id: uid("proxy"),
      path: "/app",
      protocol: "ajp",
      targetHost: "app.internal.local",
      targetPort: 8009,
      targetPath: "/app",
      reverse: true
    });
    renderProxyRows(host.proxyRules);
    schedulePreview();
  });

  $("#redirectRows").addEventListener("click", (event) => {
    if (!event.target.closest("[data-remove-redirect]")) return;
    event.target.closest("tr").remove();
    schedulePreview();
  });

  $("#proxyRows").addEventListener("click", (event) => {
    if (!event.target.closest("[data-remove-proxy]")) return;
    event.target.closest("tr").remove();
    schedulePreview();
  });
}

async function init() {
  renderIcons();
  bindEvents();
  const bootstrap = await api("/api/bootstrap");
  if (bootstrap.setupRequired) {
    showSetup();
    return;
  }
  try {
    const me = await api("/api/auth/me");
    state.currentUser = me.user;
    showApp();
    await loadState();
  } catch {
    showLogin();
  }
}

init().catch((error) => showAuthNotice(error.message));
