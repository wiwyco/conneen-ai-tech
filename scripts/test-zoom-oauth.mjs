import fs from "node:fs/promises";
import path from "node:path";

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let content = "";

  try {
    content = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function maskedState(name) {
  const value = process.env[name] || "";
  return value ? `set, length ${value.length}` : "missing";
}

async function run() {
  await loadLocalEnv();

  const accountId = requireEnv("ZOOM_ACCOUNT_ID").trim();
  const clientId = requireEnv("ZOOM_CLIENT_ID").trim();
  const clientSecret = requireEnv("ZOOM_CLIENT_SECRET").trim();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

  console.log("Zoom OAuth credential check");
  console.log(`ZOOM_ACCOUNT_ID: ${maskedState("ZOOM_ACCOUNT_ID")}`);
  console.log(`ZOOM_CLIENT_ID: ${maskedState("ZOOM_CLIENT_ID")}`);
  console.log(`ZOOM_CLIENT_SECRET: ${maskedState("ZOOM_CLIENT_SECRET")}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    console.log(`HTTP status: ${response.status}`);
    console.log("Zoom response:");
    console.log(JSON.stringify({
      error: data.error,
      reason: data.reason,
      message: data.message,
      code: data.code,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log("Access token: received");
  console.log(`Expires in: ${data.expires_in || "unknown"} seconds`);
  console.log(`Scopes: ${data.scope || "not returned"}`);
}

run().catch((error) => {
  console.error(`Zoom OAuth test failed: ${error.message}`);
  process.exitCode = 1;
});
