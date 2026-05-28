import { getEnv, requireEnv } from "./env";

function storageConfig() {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SECRET_KEY");
  if (!key) throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

export async function uploadStorageObject(bucket: string, objectPath: string, file: File): Promise<void> {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: await file.arrayBuffer(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${detail}`);
  }
}

export async function createSignedUrl(bucket: string, objectPath: string, expiresIn = 60 * 10): Promise<string | null> {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.signedURL ? `${url}/storage/v1${data.signedURL}` : null;
}
