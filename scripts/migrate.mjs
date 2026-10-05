import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

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
  console.log(`Applying ${filename}`);
  const sql = await fs.readFile(path.join(dir, filename), "utf8");
  await pool.query(sql);
  await pool.query("INSERT INTO schema_migrations(filename) VALUES($1)", [filename]);
}

await pool.end();
console.log("Migrations complete.");
