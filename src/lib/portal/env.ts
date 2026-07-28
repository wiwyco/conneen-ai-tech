export function getEnv(name: string): string | undefined {
  return import.meta.env[name] || process.env[name];
}

let productionEnvChecked = false;

export class ProductionEnvError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`Production environment validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "ProductionEnvError";
    this.issues = issues;
  }
}

export function isProduction() {
  return getEnv("NODE_ENV") === "production" || getEnv("VERCEL_ENV") === "production";
}

function envValue(name: string) {
  return (getEnv(name) || "").trim();
}

function hasAny(names: string[]) {
  return names.some((name) => envValue(name));
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isHttpsUrl(value: string) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === "https:");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isEmailOrNamedAddress(value: string) {
  const named = value.match(/^.+<([^<>]+)>$/);
  return isEmail((named?.[1] || value).trim());
}

export function validateProductionEnv(): string[] {
  const issues: string[] = [];
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
    if (!envValue(name)) issues.push(`${name} is required in production.`);
  }

  if (!hasAny(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"])) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY is required in production.");
  }

  if (!hasAny(["TURNSTILE_SECRET_KEY", "CF_TURNSTILE_SECRET_KEY"])) {
    issues.push("TURNSTILE_SECRET_KEY is required in production.");
  }

  const supabaseUrl = envValue("SUPABASE_URL");
  if (supabaseUrl && !isHttpsUrl(supabaseUrl)) {
    issues.push("SUPABASE_URL must be a valid https:// URL.");
  }

  const publicSiteUrl = envValue("PUBLIC_SITE_URL");
  if (publicSiteUrl && !isHttpsUrl(publicSiteUrl)) {
    issues.push("PUBLIC_SITE_URL must be a valid https:// URL.");
  }

  const leadFromEmail = envValue("LEAD_FROM_EMAIL");
  if (leadFromEmail && !isEmailOrNamedAddress(leadFromEmail)) {
    issues.push('LEAD_FROM_EMAIL must be an email address or a named address like "Name <name@example.com>".');
  }

  const leadNotifyEmail = envValue("LEAD_NOTIFY_EMAIL");
  if (leadNotifyEmail && !isEmail(leadNotifyEmail)) {
    issues.push("LEAD_NOTIFY_EMAIL must be a valid email address.");
  }

  const turnstilePublic = envValue("PUBLIC_TURNSTILE_SITE_KEY");
  const turnstileSecret = hasAny(["TURNSTILE_SECRET_KEY", "CF_TURNSTILE_SECRET_KEY"]);
  if (turnstilePublic && !turnstileSecret) {
    issues.push("TURNSTILE_SECRET_KEY must be set when PUBLIC_TURNSTILE_SITE_KEY is set.");
  }
  if (!turnstilePublic && turnstileSecret) {
    issues.push("PUBLIC_TURNSTILE_SITE_KEY must be set when TURNSTILE_SECRET_KEY is set.");
  }

  if (envValue("MEETING_PROVIDER_REQUIRED") === "true") {
    for (const name of ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"]) {
      if (!envValue(name)) issues.push(`${name} is required when MEETING_PROVIDER_REQUIRED=true.`);
    }
  }

  return issues;
}

export function assertProductionEnv() {
  if (!isProduction() || productionEnvChecked) return;

  const issues = validateProductionEnv();
  if (issues.length) throw new ProductionEnvError(issues);
  productionEnvChecked = true;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getPublicBaseUrl(): string {
  return getEnv("PUBLIC_SITE_URL") || getEnv("VERCEL_URL") || "http://localhost:4321";
}
