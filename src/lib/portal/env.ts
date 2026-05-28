export function getEnv(name: string): string | undefined {
  return import.meta.env[name] || process.env[name];
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getPublicBaseUrl(): string {
  return getEnv("PUBLIC_SITE_URL") || getEnv("VERCEL_URL") || "http://localhost:4321";
}
