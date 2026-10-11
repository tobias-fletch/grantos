import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
test('release transfer retains discontinued records and excludes accounts; encrypted backup restores',async()=>{
 const base=process.env.DATABASE_URL!;assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Release tests require an isolated loopback database');const admin=new pg.Client({connectionString:base});await admin.connect();
 const prefix='grantos_release_test_'+randomBytes(6).toString('hex');const databases=[prefix+'_source',prefix+'_target',prefix+'_restore'];
 const url=(name:string)=>{const u=new URL(base);u.pathname='/'+name;return u.href;};
 const clients:pg.Client[]=[];const created:string[]=[];const dir=await mkdtemp(path.join(tmpdir(),'grantos-release-'));
 const run=(script:string,args:string[],env:Record<string,string>)=>{const result=spawnSync(process.execPath,[script,...args],{env:{...process.env,...env},encoding:'utf8',timeout:60000});if(result.status!==0)throw Error('Release subprocess failed: '+script+' '+result.stdout);};
 try{
  for(const name of databases){await admin.query('CREATE DATABASE '+pg.escapeIdentifier(name));created.push(name);}
  for(const name of databases.slice(0,2))run('scripts/migrate.mjs',[],{DATABASE_URL:url(name),MIGRATION_DATABASE_URL:url(name)});
  const source=new pg.Client({connectionString:url(databases[0])}),target=new pg.Client({connectionString:url(databases[1])});clients.push(source,target);await source.connect();await target.connect();
  const id=(await source.query('SELECT id FROM opportunities WHERE NOT is_demo LIMIT 1')).rows[0].id;
  await source.query("INSERT INTO catalog_monitoring(opportunity_id,state,evidence,source_url,last_success_at) VALUES($1,'discontinued','This program has been discontinued.','https://funder.example/grant',now())",[id]);
  await source.query("INSERT INTO users(email,name) VALUES('private@release.example','Private test account')");
  run('scripts/transfer-catalog.mjs',['--confirm-empty'],{CATALOG_SOURCE_DATABASE_URL:url(databases[0]),CATALOG_TARGET_DATABASE_URL:url(databases[1])});
  assert.equal((await target.query('SELECT count(*) FROM users')).rows[0].count,'0');assert.equal((await target.query('SELECT count(*) FROM applications')).rows[0].count,'0');
  assert.equal((await target.query('SELECT state FROM catalog_monitoring WHERE opportunity_id=$1',[id])).rows[0].state,'discontinued');
  // Backup must preserve private rows as well as catalog data; transfer above must not.
  await target.query("INSERT INTO users(email,name) VALUES('synthetic@backup.example','Synthetic backup fixture')");
  const file=path.join(dir,'backup.enc'),key=randomBytes(32).toString('base64');
  const pgBin=process.env.PG_BIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
  run('scripts/backup-db.mjs',['backup',file],{BACKUP_DATABASE_URL:url(databases[1]),BACKUP_KEY:key,PG_BIN:pgBin});
  const encrypted=await readFile(file);
  assert.equal(encrypted.subarray(0,8).toString(),'GRANTOS1');
  assert.equal(encrypted.includes(Buffer.from('synthetic@backup.example')),false);
  const failedRestore=(candidate:string,candidateKey:string)=>{
   const result=spawnSync(process.execPath,['scripts/backup-db.mjs','restore',candidate,'--confirm-empty'],{env:{...process.env,RESTORE_DATABASE_URL:url(databases[2]),BACKUP_KEY:candidateKey,PG_BIN:pgBin},encoding:'utf8',timeout:60000});
   assert.notEqual(result.status,0,'Unsafe restore must fail closed');
  };
  failedRestore(file,randomBytes(32).toString('base64'));
  const corrupt=Buffer.from(encrypted);corrupt[corrupt.length-1]^=1;
  const tampered=path.join(dir,'tampered.enc');await writeFile(tampered,corrupt);
  failedRestore(tampered,key);
  const empty=new pg.Client({connectionString:url(databases[2])});await empty.connect();
  try{assert.equal((await empty.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count,'0');}finally{await empty.end();}
  run('scripts/backup-db.mjs',['restore',file,'--confirm-empty'],{RESTORE_DATABASE_URL:url(databases[2]),BACKUP_KEY:key,PG_BIN:pgBin});
  failedRestore(file,key); // Existing restored data must not be overwritten.

  const restored=new pg.Client({connectionString:url(databases[2])});clients.push(restored);await restored.connect();
  assert.equal((await restored.query('SELECT state FROM catalog_monitoring WHERE opportunity_id=$1',[id])).rows[0].state,'discontinued');
  assert.equal((await restored.query('SELECT email FROM users')).rows[0].email,'synthetic@backup.example');
 }finally{
  for(const client of clients)await client.end();for(const name of created)await admin.query('DROP DATABASE '+pg.escapeIdentifier(name)+' WITH (FORCE)');await admin.end();if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('grantos-release-'))throw Error('Unexpected test directory');await rm(dir,{recursive:true,force:true});
 }
});
