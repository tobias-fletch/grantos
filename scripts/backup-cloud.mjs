import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createCipheriv,randomBytes} from 'node:crypto';
// Credentials are passed by environment, never command-line arguments or logs.
const key=Buffer.from(process.env.BACKUP_KEY??'','base64');
try{
 if(key.length!==32||!process.env.BACKUP_DATABASE_URL)throw Error('Configuration missing');
 const u=new URL(process.env.BACKUP_DATABASE_URL);
 const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1),PGSSLMODE:u.searchParams.get('sslmode')??'require'};
 const r=spawnSync('docker',['run','--rm','-e','PGHOST','-e','PGPORT','-e','PGUSER','-e','PGPASSWORD','-e','PGDATABASE','-e','PGSSLMODE','postgres:18','pg_dump','-Fc','--no-owner','--no-acl'],{env,maxBuffer:256*1024*1024,timeout:300000});
 if(r.status!==0)throw Error('Dump failed');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(r.stdout),cipher.final()]);
 if(encrypted.length>12*1024*1024)throw Error('Artifact exceeds free-storage budget');
 await writeFile('backup.enc',Buffer.concat([Buffer.from('GRANTOS1'),iv,cipher.getAuthTag(),encrypted]),{flag:'wx',mode:0o600});
 console.log('Encrypted backup ready for restricted artifact storage.');
}catch{console.error('Encrypted backup failed; no connection or key details logged.');process.exitCode=1;}
