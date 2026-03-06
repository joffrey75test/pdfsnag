import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function parseArgs(argv) {
  const opts = {
    tenant: "tenant_demo",
    projectId: `proj_${randomUUID()}`,
    projectName: "Projet GED Demo",
    db: "snag_db",
    applyLocal: false,
    applyRemote: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tenant") opts.tenant = argv[++i];
    else if (arg === "--project-id") opts.projectId = argv[++i];
    else if (arg === "--project-name") opts.projectName = argv[++i];
    else if (arg === "--db") opts.db = argv[++i];
    else if (arg === "--apply-local") opts.applyLocal = true;
    else if (arg === "--apply-remote") opts.applyRemote = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  if (!opts.tenant || !opts.projectId || !opts.projectName || !opts.db) {
    throw new Error("Missing required options.");
  }

  return opts;
}

function printHelp() {
  console.log(`Usage:
  node scripts/bootstrap-ged-tokens.mjs [options]

Options:
  --tenant <tenant_id>        Tenant id (default: tenant_demo)
  --project-id <project_id>   Project id (default: generated uuid)
  --project-name <name>       Project name (default: Projet GED Demo)
  --db <database_name>        D1 database name (default: snag_db)
  --apply-local               Execute SQL on local D1
  --apply-remote              Execute SQL on remote D1
  --help                      Show this help
`);
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function sha256Hex(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function run() {
  const opts = parseArgs(process.argv.slice(2));

  const actorWriteId = `actor_${randomUUID()}`;
  const actorReadId = `actor_${randomUUID()}`;
  const tokenWriteId = `tok_${randomUUID()}`;
  const tokenReadId = `tok_${randomUUID()}`;

  const rawWriteToken = randomBytes(32).toString("hex");
  const rawReadToken = randomBytes(32).toString("hex");

  const writeHash = sha256Hex(rawWriteToken);
  const readHash = sha256Hex(rawReadToken);

  const tenant = sqlEscape(opts.tenant);
  const projectId = sqlEscape(opts.projectId);
  const projectName = sqlEscape(opts.projectName);

  const sql = `INSERT OR IGNORE INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenant}', '${projectName}');

INSERT INTO actors (id, tenant_id, type, label)
VALUES
  ('${sqlEscape(actorWriteId)}', '${tenant}', 'token', 'bootstrap-write-token'),
  ('${sqlEscape(actorReadId)}', '${tenant}', 'token', 'bootstrap-read-token');

INSERT INTO project_tokens (id, tenant_id, project_id, token_hash, scope, name, actor_id)
VALUES
  ('${sqlEscape(tokenWriteId)}', '${tenant}', '${projectId}', '${writeHash}', 'write', 'bootstrap-write', '${sqlEscape(actorWriteId)}'),
  ('${sqlEscape(tokenReadId)}', '${tenant}', '${projectId}', '${readHash}', 'read', 'bootstrap-read', '${sqlEscape(actorReadId)}');
`;

  console.log("\n=== GED Bootstrap (one-time secrets) ===");
  console.log(`tenant_id: ${opts.tenant}`);
  console.log(`project_id: ${opts.projectId}`);
  console.log("\nWRITE token (show once):");
  console.log(rawWriteToken);
  console.log("\nREAD token (show once):");
  console.log(rawReadToken);
  console.log("\nDo not store raw tokens in DB. Only hashes are inserted.");

  if (!opts.applyLocal && !opts.applyRemote) {
    console.log("\nSQL to execute:");
    console.log(sql);
    console.log("\nRun locally (from saved SQL file):");
    console.log(`npx wrangler d1 execute ${opts.db} --local --file /tmp/bootstrap.sql`);
    return;
  }

  const tmpSqlPath = join(tmpdir(), `pdfsnag-bootstrap-${randomUUID()}.sql`);
  writeFileSync(tmpSqlPath, `${sql}\n`, "utf8");
  try {
    if (opts.applyLocal) {
      execSync(`npx wrangler d1 execute ${opts.db} --local --file ${JSON.stringify(tmpSqlPath)}`, {
        stdio: "inherit",
      });
    }

    if (opts.applyRemote) {
      execSync(`npx wrangler d1 execute ${opts.db} --remote --file ${JSON.stringify(tmpSqlPath)}`, {
        stdio: "inherit",
      });
    }
  } finally {
    try {
      unlinkSync(tmpSqlPath);
    } catch {
      // no-op
    }
  }

  console.log("\nBootstrap applied successfully.");
}

run();
