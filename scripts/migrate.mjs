import fs from 'node:fs/promises';import path from 'node:path';import pg from 'pg';import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL});
try{await db.connect();await db.query('SELECT pg_advisory_lock(7823001)');await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const filename of (await fs.readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort()){
 if((await db.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[filename])).rowCount)continue;
 const sql=(await fs.readFile(path.join('db/migrations',filename),'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,'');
 await db.query('BEGIN');try{await db.query(sql);await db.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);await db.query('COMMIT');console.log('Applied '+filename);}catch{await db.query('ROLLBACK');throw Error('Migration failed: '+filename);}
 }console.log('Migrations complete.');
}catch{console.error('Migration failed; transaction rolled back. Check database configuration and migration compatibility.');process.exitCode=1;}finally{await db.end().catch(()=>{});}
