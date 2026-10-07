import {spawnSync} from 'node:child_process';
import {writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {rootCertificates} from 'node:tls';
import {createCipheriv,randomBytes} from 'node:crypto';
// Credentials are passed by environment, never command-line arguments or logs.
const key=Buffer.from(process.env.BACKUP_KEY??'','base64');
const caFile=resolve('.backup-public-roots.pem');
try{
 if(key.length!==32||!process.env.BACKUP_DATABASE_URL)throw Error('Configuration missing');
 const u=new URL(process.env.BACKUP_DATABASE_URL);
 // The minimal postgres image may not include a usable system CA bundle.
 // Supply Node's public trust roots while retaining hostname verification.
 await writeFile(caFile,rootCertificates.join('\n'),{flag:'wx',mode:0o644});
 const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1),PGSSLMODE:'verify-full',PGSSLROOTCERT:'/tmp/grantos-public-roots.pem'};
 const r=spawnSync('docker',['run','--rm','--mount',`type=bind,source=${caFile},target=/tmp/grantos-public-roots.pem,readonly`,'-e','PGHOST','-e','PGPORT','-e','PGUSER','-e','PGPASSWORD','-e','PGDATABASE','-e','PGSSLMODE','-e','PGSSLROOTCERT','postgres:18','pg_dump','-Fc','--no-owner','--no-acl'],{env,maxBuffer:256*1024*1024,timeout:300000});
 if(r.status!==0){
  const diagnostic=String(r.stderr??'');
  const reason=/certificate|root certificate|SSL error/i.test(diagnostic)?'TLS certificate validation':/permission denied/i.test(diagnostic)?'Database permission':/password authentication failed/i.test(diagnostic)?'Database authentication':/server version|version mismatch/i.test(diagnostic)?'PostgreSQL version':/network|resolve|timeout|timed out|connection refused/i.test(diagnostic)?'Network connection':/docker|daemon|manifest|pull access/i.test(diagnostic)?'Container startup':'Database dump';
  console.error(reason+' failed; raw diagnostics suppressed.');
  throw Error('Dump failed');
 }
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(r.stdout),cipher.final()]);
 if(encrypted.length>12*1024*1024)throw Error('Artifact exceeds free-storage budget');
 await writeFile('backup.enc',Buffer.concat([Buffer.from('GRANTOS1'),iv,cipher.getAuthTag(),encrypted]),{flag:'wx',mode:0o600});
 console.log('Encrypted backup ready for restricted artifact storage.');
}catch{console.error('Encrypted backup failed; no connection or key details logged.');process.exitCode=1;}
finally{await rm(caFile,{force:true});}
