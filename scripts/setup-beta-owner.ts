import dotenv from 'dotenv';import pg from 'pg';import {emailSchema,issueToken} from '../src/lib/beta/security';import {sendAccountEmail,emailConfigured} from '../src/lib/beta/email';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
async function main(){const email=emailSchema.parse(process.argv[2]);const send=process.argv.includes('--send-verification');const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL});await db.connect();try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(7823012)');const owner=(await db.query('SELECT email FROM users WHERE beta_owner LIMIT 1')).rows[0];if(owner&&owner.email.toLowerCase()!==email)throw Error('An owner already exists');
 const u=(await db.query(`INSERT INTO users(email,name,beta_owner,beta_active,catalog_editor) VALUES($1,'Beta owner',true,true,true) ON CONFLICT(email) DO UPDATE SET beta_owner=true,beta_active=true,catalog_editor=true RETURNING id,password_hash`,[email])).rows[0];
 await db.query("INSERT INTO beta_events(subject_id,event) VALUES($1,'Owner designated through trusted setup; email verification required')",[u.id]);await db.query('COMMIT');
 console.log('Owner designated. Email ownership must still be verified.');
 if(send){if(!emailConfigured())throw Error('Configure verified email sender first');const t=await issueToken(db,email,u.password_hash?'verify':'invite',u.id);try{await sendAccountEmail(db,email,t.purpose,t.token,t.id);console.log('Owner account email requested.');}catch{await db.query('UPDATE beta_tokens SET revoked_at=now() WHERE id=$1',[t.id]);throw Error('Email not delivered');}}
 }finally{await db.end();}}
main().catch(()=>{console.error('Owner setup failed. Check configuration and existing owner designation; no secrets logged.');process.exitCode=1;});
