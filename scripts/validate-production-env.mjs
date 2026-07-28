const env = {};

for (const [key, value] of Object.entries(process.env)) {
  env[key] = value || "";
}

function value(name) {
  return String(env[name] || "").trim();
}

function hasAny(names) {
  return names.some((name) => value(name));
}

function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isHttpsUrl(raw) {
  const url = parseUrl(raw);
  return Boolean(url && url.protocol === "https:");
}

function isEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function isEmailOrNamedAddress(raw) {
  const named = raw.match(/^.+<([^<>]+)>$/);
  return isEmail((named?.[1] || raw).trim());
}

const issues = [];
const required = [
  "SUPABASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "RESEND_API_KEY",
  "LEAD_FROM_EMAIL",
  "LEAD_NOTIFY_EMAIL",
  "PUBLIC_SITE_URL",
  "PUBLIC_TURNSTILE_SITE_KEY",
  "PORTAL_BOOTSTRAP_SECRET",
];

for (const name of required) {
  if (!value(name)) issues.push(`${name} is required in production.`);
}

if (!hasAny(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"])) {
  issues.push("SUPABASE_SERVICE_ROLE_KEY is required in production.");
}

if (!hasAny(["TURNSTILE_SECRET_KEY", "CF_TURNSTILE_SECRET_KEY"])) {
  issues.push("TURNSTILE_SECRET_KEY is required in production.");
}

if (value("SUPABASE_URL") && !isHttpsUrl(value("SUPABASE_URL"))) {
  issues.push("SUPABASE_URL must be a valid https:// URL.");
}

if (value("PUBLIC_SITE_URL") && !isHttpsUrl(value("PUBLIC_SITE_URL"))) {
  issues.push("PUBLIC_SITE_URL must be a valid https:// URL.");
}

if (value("LEAD_FROM_EMAIL") && !isEmailOrNamedAddress(value("LEAD_FROM_EMAIL"))) {
  issues.push('LEAD_FROM_EMAIL must be an email address or a named address like "Name <name@example.com>".');
}

if (value("LEAD_NOTIFY_EMAIL") && !isEmail(value("LEAD_NOTIFY_EMAIL"))) {
  issues.push("LEAD_NOTIFY_EMAIL must be a valid email address.");
}

if (value("PUBLIC_TURNSTILE_SITE_KEY") && !hasAny(["TURNSTILE_SECRET_KEY", "CF_TURNSTILE_SECRET_KEY"])) {
  issues.push("TURNSTILE_SECRET_KEY must be set when PUBLIC_TURNSTILE_SITE_KEY is set.");
}

if (!value("PUBLIC_TURNSTILE_SITE_KEY") && hasAny(["TURNSTILE_SECRET_KEY", "CF_TURNSTILE_SECRET_KEY"])) {
  issues.push("PUBLIC_TURNSTILE_SITE_KEY must be set when TURNSTILE_SECRET_KEY is set.");
}

if (value("MEETING_PROVIDER_REQUIRED") === "true") {
  for (const name of ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"]) {
    if (!value(name)) issues.push(`${name} is required when MEETING_PROVIDER_REQUIRED=true.`);
  }
}

if (issues.length) {
  console.error("Production environment validation failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Production environment validation passed.");
