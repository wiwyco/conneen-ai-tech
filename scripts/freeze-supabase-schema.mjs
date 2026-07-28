import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const supabaseDir = path.join(root, "supabase");
const migrationsDir = path.join(supabaseDir, "migrations");
const freezePath = path.join(supabaseDir, "schema_freeze.sql");
const manifestPath = path.join(supabaseDir, "schema_manifest.json");

const migrations = [
  {
    version: "20260517000000",
    name: "diagnostic_leads",
    source: "diagnostic_leads.sql",
  },
  {
    version: "20260526000000",
    name: "client_portal_base",
    source: "client_portal.sql",
  },
  {
    version: "20260526000100",
    name: "client_portal_meeting_automation",
    source: "client_portal_meeting_automation_migration.sql",
  },
  {
    version: "20260601000000",
    name: "client_portal_permissions",
    source: "client_portal_permissions_migration.sql",
  },
  {
    version: "20260727000000",
    name: "website_analytics",
    source: "website_analytics.sql",
  },
];

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function normalizeSql(text) {
  return text.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

function migrationFileName(item) {
  return `${item.version}_${item.name}.sql`;
}

async function readSource(item) {
  const sourcePath = path.join(supabaseDir, item.source);
  const sql = normalizeSql(await fs.readFile(sourcePath, "utf8"));
  return { sourcePath, sql };
}

function frozenSql(item, sql) {
  return [
    `-- Frozen migration: ${item.version}_${item.name}`,
    `-- Source: supabase/${item.source}`,
    "",
    sql,
  ].join("\n");
}

async function buildArtifacts() {
  await fs.mkdir(migrationsDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const manifest = {
    generatedAt,
    note: "Frozen Supabase schema/migration manifest. Run npm run check:supabase-freeze before deployment.",
    migrations: [],
  };
  const combinedParts = [
    "-- Conneen AI Supabase schema freeze.",
    "-- Re-run this whole file in the Supabase SQL editor to apply the current ordered schema/migrations.",
    `-- Generated at: ${generatedAt}`,
    "",
  ];

  for (const item of migrations) {
    const { sql } = await readSource(item);
    const filename = migrationFileName(item);
    const outputSql = frozenSql(item, sql);
    const outputPath = path.join(migrationsDir, filename);

    await fs.writeFile(outputPath, outputSql, "utf8");
    combinedParts.push(`-- =========================================================================`);
    combinedParts.push(`-- ${filename}`);
    combinedParts.push(`-- =========================================================================`);
    combinedParts.push(sql);
    combinedParts.push("");

    manifest.migrations.push({
      version: item.version,
      name: item.name,
      source: `supabase/${item.source}`,
      frozen: `supabase/migrations/${filename}`,
      sourceSha256: sha256(sql),
      frozenSha256: sha256(outputSql),
    });
  }

  const combinedSql = normalizeSql(combinedParts.join("\n"));
  await fs.writeFile(freezePath, combinedSql, "utf8");
  manifest.combined = {
    file: "supabase/schema_freeze.sql",
    sha256: sha256(combinedSql),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function checkArtifacts() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const issues = [];

  for (const item of migrations) {
    const listed = manifest.migrations.find((entry) => entry.version === item.version && entry.name === item.name);
    if (!listed) {
      issues.push(`Missing manifest entry for ${item.version}_${item.name}.`);
      continue;
    }

    const { sql } = await readSource(item);
    const outputPath = path.join(root, listed.frozen);
    const frozen = normalizeSql(await fs.readFile(outputPath, "utf8"));
    const expectedFrozen = frozenSql(item, sql);

    if (sha256(sql) !== listed.sourceSha256) {
      issues.push(`${listed.source} changed after freeze.`);
    }
    if (sha256(frozen) !== listed.frozenSha256) {
      issues.push(`${listed.frozen} changed after freeze.`);
    }
    if (frozen !== expectedFrozen) {
      issues.push(`${listed.frozen} no longer matches ${listed.source}.`);
    }
  }

  const combined = normalizeSql(await fs.readFile(freezePath, "utf8"));
  if (sha256(combined) !== manifest.combined?.sha256) {
    issues.push("supabase/schema_freeze.sql changed after freeze.");
  }

  if (issues.length) {
    console.error("Supabase schema freeze check failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    console.error("Run npm run freeze:supabase to refresh the frozen artifacts.");
    process.exit(1);
  }

  console.log("Supabase schema freeze check passed.");
}

if (process.argv.includes("--check")) {
  await checkArtifacts();
} else {
  await buildArtifacts();
  console.log("Supabase schema freeze written.");
}
