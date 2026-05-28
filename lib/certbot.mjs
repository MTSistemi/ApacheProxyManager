export const OVH_ENDPOINTS = ["ovh-eu", "ovh-ca", "kimsufi-eu", "kimsufi-ca", "soyoustart-eu", "soyoustart-ca", "runabove-ca"];

function cleanDomains(domains) {
  return Array.from(new Set((domains || [])
    .flatMap((value) => String(value || "").split(/[\s,]+/))
    .map((value) => value.trim())
    .filter(Boolean)));
}

export function buildOvhCredentialsIni(credentials) {
  const endpoint = OVH_ENDPOINTS.includes(credentials.endpoint) ? credentials.endpoint : "ovh-eu";
  return [
    `dns_ovh_endpoint = ${endpoint}`,
    `dns_ovh_application_key = ${credentials.applicationKey || ""}`,
    `dns_ovh_application_secret = ${credentials.applicationSecret || ""}`,
    `dns_ovh_consumer_key = ${credentials.consumerKey || ""}`,
    ""
  ].join("\n");
}

export function buildCertbotArgs(payload, credentialsPath) {
  const domains = cleanDomains(payload.domains);
  const certName = String(payload.certName || domains[0] || "apache-managed-cert").trim();
  const seconds = Number(payload.propagationSeconds) || 120;
  const args = [
    "certonly",
    "--dns-ovh",
    "--dns-ovh-credentials",
    credentialsPath,
    "--dns-ovh-propagation-seconds",
    String(seconds),
    "--non-interactive",
    "--agree-tos",
    "--email",
    String(payload.email || "").trim(),
    "--cert-name",
    certName,
    "--keep-until-expiring"
  ];

  if (payload.staging) args.push("--staging");
  for (const domain of domains) args.push("-d", domain);
  return args;
}

export function validateCertificateRequest(payload) {
  const errors = [];
  const domains = cleanDomains(payload.domains);
  const credentials = payload.credentials || {};

  if (!domains.length) errors.push("Inserisci almeno un dominio.");
  if (!String(payload.email || "").includes("@")) errors.push("Email Let's Encrypt non valida.");
  if (!credentials.applicationKey) errors.push("OVH application key mancante.");
  if (!credentials.applicationSecret) errors.push("OVH application secret mancante.");
  if (!credentials.consumerKey) errors.push("OVH consumer key mancante.");

  return { valid: errors.length === 0, errors, domains };
}

export function shellQuote(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_/:=.,@%+\-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

export function formatCommand(binary, args) {
  return [binary, ...args].map(shellQuote).join(" ");
}

export function certificatePaths(certName) {
  return {
    certificateFile: `/etc/letsencrypt/live/${certName}/fullchain.pem`,
    certificateKeyFile: `/etc/letsencrypt/live/${certName}/privkey.pem`,
    caCertificateFile: `/etc/letsencrypt/live/${certName}/chain.pem`
  };
}
