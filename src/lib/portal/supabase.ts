import { requireEnv } from "./env";
import { getEnv } from "./env";

type QueryValue = string | number | boolean | null | undefined;

export type SupabaseQuery = Record<string, QueryValue>;

function getSupabaseConfig() {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SECRET_KEY");
  if (!key) throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

function buildUrl(table: string, query: SupabaseQuery = {}) {
  const { url } = getSupabaseConfig();
  const apiUrl = new URL(`${url}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) apiUrl.searchParams.set(key, String(value));
  }

  return apiUrl;
}

async function supabaseFetch<T>(table: string, init: RequestInit, query?: SupabaseQuery): Promise<T> {
  const { key } = getSupabaseConfig();
  const response = await fetch(buildUrl(table, query), {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase ${table} request failed (${response.status}): ${detail}`);
  }

  if (response.status === 204) return null as T;
  return response.json().catch(() => null) as Promise<T>;
}

export async function selectRows<T>(
  table: string,
  query: SupabaseQuery = {},
  options: { single?: boolean } = {}
): Promise<T[]> {
  const rows = await supabaseFetch<T[]>(table, { method: "GET" }, query);
  if (options.single) return Array.isArray(rows) ? rows.slice(0, 1) : [];
  return Array.isArray(rows) ? rows : [];
}

export async function selectOne<T>(table: string, query: SupabaseQuery = {}): Promise<T | null> {
  const rows = await selectRows<T>(table, { limit: 1, ...query });
  return rows[0] || null;
}

export async function insertRow<T>(table: string, payload: Record<string, unknown>): Promise<T> {
  const rows = await supabaseFetch<T[]>(
    table,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
  );
  return rows[0];
}

export async function updateRows<T>(
  table: string,
  query: SupabaseQuery,
  payload: Record<string, unknown>
): Promise<T[]> {
  return supabaseFetch<T[]>(
    table,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
    query
  );
}

export async function deleteRows(table: string, query: SupabaseQuery): Promise<void> {
  await supabaseFetch<null>(table, { method: "DELETE", headers: { Prefer: "return=minimal" } }, query);
}

export function eq(value: string): string {
  return `eq.${value}`;
}

export function isNull(): string {
  return "is.null";
}

export function notNull(): string {
  return "not.is.null";
}

export function order(column: string, ascending = false): string {
  return `${column}.${ascending ? "asc" : "desc"}`;
}
