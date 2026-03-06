#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password) {
  const iterations = 120000;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    32 * 8
  );
  const digest = new Uint8Array(bits);
  return `pbkdf2_sha256$${iterations}$${toHex(salt)}$${toHex(digest)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const db = args.db || "snag_db";
  const env = args.env || "staging";
  const remote = args.remote === "true" || args.remote === "1";

  const userId = args["user-id"] || "admin-1";
  const email = args.email || "admin1@example.com";
  const fullName = args["full-name"] || "Admin One";
  const password = args.password || "Admin123!";
  const companyId = args["company-id"] || "tenant_demo";
  const companyName = args["company-name"] || "Tenant Demo";
  const role = args.role || "admin";

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const membershipId = `cm_${crypto.randomUUID()}`;

  const sql = `
INSERT INTO users (user_id, email, full_name, password_hash, status, created_at)
VALUES (${sqlString(userId)}, ${sqlString(email.toLowerCase())}, ${sqlString(fullName)}, ${sqlString(passwordHash)}, 'active', ${sqlString(now)})
ON CONFLICT(user_id) DO UPDATE SET
  email = excluded.email,
  full_name = excluded.full_name,
  password_hash = excluded.password_hash,
  status = 'active';

INSERT INTO companies (company_id, name, status, created_at)
VALUES (${sqlString(companyId)}, ${sqlString(companyName)}, 'active', ${sqlString(now)})
ON CONFLICT(company_id) DO UPDATE SET
  name = excluded.name,
  status = 'active';

INSERT INTO company_memberships (company_membership_id, company_id, user_id, role, status, joined_at, created_at)
VALUES (${sqlString(membershipId)}, ${sqlString(companyId)}, ${sqlString(userId)}, ${sqlString(role)}, 'active', ${sqlString(now)}, ${sqlString(now)})
ON CONFLICT(company_id, user_id) DO UPDATE SET
  role = excluded.role,
  status = 'active',
  joined_at = excluded.joined_at;
`;

  const dir = mkdtempSync(join(tmpdir(), "seed-admin-"));
  const sqlFile = join(dir, "seed-admin.sql");
  writeFileSync(sqlFile, sql, "utf8");

  const cmd = [
    "npx wrangler d1 execute",
    db,
    `--file=${sqlFile}`,
    remote ? `--env ${env} --remote` : "--local",
  ].join(" ");

  execSync(cmd, { stdio: "inherit" });

  process.stdout.write(
    `\nSeed OK\nuser_id=${userId}\nemail=${email.toLowerCase()}\ncompany_id=${companyId}\nrole=${role}\nmode=${remote ? `remote:${env}` : "local"}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
