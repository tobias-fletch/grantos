import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env.local and set it.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const dir = path.join(process.cwd(), "db", "migrations");
const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".sql")).sort();

await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);

for (const filename of files) {
  const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE filename=$1", [filename]);
  if (exists.rowCount) continue;
  const sql = await fs.readFile(path.join(dir, filename), "utf8");
  console.log(`Applying ${filename}`);
  await pool.query(sql);
  await pool.query("INSERT INTO schema_migrations(filename) VALUES($1)", [filename]);
}

await pool.end();
console.log("Migrations complete.");
