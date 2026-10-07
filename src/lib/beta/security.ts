import {createHash,createHmac,randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {transaction,type DB} from '../checklists/store';
export const emailSchema=z.string().trim().toLowerCase().email().max(254);
export const passwordSchema=z.string().min(12).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72);
export const betaRequired=()=>process.env.NODE_ENV==='production'||process.env.BETA_MODE==='true';
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function requestAddress(headers:Headers){return process.env.TRUST_PROXY==='render'?(headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown'):'local';}
export async function rateLimit(db:DB,key:string,limit:number,seconds:number){
 const secret=process.env.AUTH_SECRET;if(!secret)throw Error('Authentication configuration missing');
 const bucket=createHmac('sha256',secret).update(key).digest('hex');
 const r=await db.query(`INSERT INTO auth_rate_limits(bucket,window_start,count) VALUES($1,now(),1) ON CONFLICT(bucket) DO UPDATE SET
 count=CASE WHEN auth_rate_limits.window_start<now()-make_interval(secs=>$2) THEN 1 ELSE auth_rate_limits.count+1 END,
 window_start=CASE WHEN auth_rate_limits.window_start<now()-make_interval(secs=>$2) THEN now() ELSE auth_rate_limits.window_start END RETURNING count`,[bucket,seconds]);
 return r.rows[0].count<=limit;
}
export async function allowedAttempt(db:DB,kind:string,email:string,address:string){
 const ip=await rateLimit(db,`${kind}:ip:${address}`,kind==='login'?60:20,900);if(!ip)return false;
 const account=await rateLimit(db,`${kind}:email:${email.toLowerCase()}`,kind==='login'?10:5,900);
 return account;
}
export async function currentAccount(db:DB,id:string){return (await db.query('SELECT id,email,name,email_verified_at,beta_active,beta_owner,catalog_editor,disabled_at,session_version FROM users WHERE id=$1',[id])).rows[0];}
export function accountAllowed(u:any,strict=betaRequired()){
 // Trusted setup owners can administer local development before email delivery is configured.
 // Keep the verification timestamp honest and never enable this exception in production.
 const localOwner=process.env.NODE_ENV==='development'&&u?.beta_owner===true;
 return !!u&&!u.disabled_at&&(!strict||(u.beta_active&&(!!u.email_verified_at||localOwner)));
}
export async function validSession(db:DB,id:string,version:number,strict=betaRequired()){const u=await currentAccount(db,id);return accountAllowed(u,strict)&&u.session_version===version?u:null;}
export async function requireBetaOwner(db:DB,id:string){const u=await currentAccount(db,id);if(!accountAllowed(u,true)||!u.beta_owner)throw Error('Owner access required');return u;}
export async function editorAllowed(db:DB,id:string){const u=await currentAccount(db,id);return accountAllowed(u,true)&&u.catalog_editor;}
export async function issueToken(db:DB,email:string,purpose:'invite'|'verify'|'reset',actorId:string|null=null){
 email=emailSchema.parse(email);const token=randomBytes(32).toString('base64url');
 const row=(await db.query(`INSERT INTO beta_tokens(token_hash,email,purpose,created_by,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(secs=>$5)) RETURNING id`,[hash(token),email,purpose,actorId,purpose==='invite'?604800:purpose==='reset'?1800:86400])).rows[0];return {id:row.id,token,purpose};
}
export async function createInvitation(db:DB,actorId:string,email:string){await requireBetaOwner(db,actorId);email=emailSchema.parse(email);const u=(await db.query('SELECT id,password_hash,disabled_at FROM users WHERE lower(email)=$1',[email])).rows[0];if(u?.disabled_at)throw Error('Re-enable this account before inviting');if(u?.password_hash){await db.query('UPDATE users SET beta_active=true WHERE id=$1',[u.id]);return issueToken(db,email,'verify',actorId);}return issueToken(db,email,'invite',actorId);}
export async function revokeInvitation(db:DB,actorId:string,id:string){await requireBetaOwner(db,actorId);z.string().uuid().parse(id);await db.query("UPDATE beta_tokens SET revoked_at=now() WHERE id=$1 AND purpose IN ('invite','verify') AND used_at IS NULL",[id]);}
async function takeToken(db:DB,token:string,purpose:string,email?:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Invalid or expired link');
 const row=(await db.query('SELECT * FROM beta_tokens WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[hash(token),purpose])).rows[0];
 if(!row||(email&&row.email!==email))throw Error('Invalid or expired link');return row;
}
export async function redeemInvitation(db:DB,input:unknown){const v=z.object({name:z.string().trim().min(2).max(120),email:emailSchema,password:passwordSchema,token:z.string()}).parse(input);const passwordHash=await bcrypt.hash(v.password,12);
 return transaction(db,async c=>{const t=await takeToken(c,v.token,'invite',v.email);
 let u=(await c.query('SELECT * FROM users WHERE lower(email)=$1 FOR UPDATE',[v.email])).rows[0];
 // An invitation never resets an existing password or reverses an owner suspension.
 if(u?.disabled_at||u?.password_hash)throw Error('Use verification or recovery for an existing account');
 if(u){u=(await c.query('UPDATE users SET password_hash=$2,name=$3,email_verified_at=now(),beta_active=true,session_version=session_version+1 WHERE id=$1 RETURNING *',[u.id,passwordHash,v.name])).rows[0];}
 else u=(await c.query('INSERT INTO users(email,name,password_hash,email_verified_at,beta_active) VALUES($1,$2,$3,now(),true) RETURNING *',[v.email,v.name,passwordHash])).rows[0];
 if(!(await c.query('SELECT 1 FROM workspace_members WHERE user_id=$1',[u.id])).rowCount){
 const w=(await c.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES($1,$2,'individual',$3) RETURNING id",[v.name,`beta-${u.id}`,u.id])).rows[0];
 await c.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w.id,u.id]);await c.query("INSERT INTO profiles(workspace_id,display_name,applicant_type) VALUES($1,$2,'individual')",[w.id,v.name]);}
 await c.query('UPDATE beta_tokens SET used_at=now() WHERE id=$1',[t.id]);await c.query("INSERT INTO beta_events(subject_id,event) VALUES($1,'Invitation redeemed')",[u.id]);return u.id as string;
 });}
export async function verifyEmail(db:DB,token:string){return transaction(db,async c=>{const t=await takeToken(c,token,'verify');const u=(await c.query('UPDATE users SET email_verified_at=now(),session_version=session_version+1 WHERE lower(email)=$1 AND disabled_at IS NULL AND beta_active RETURNING id',[t.email])).rows[0];if(!u)throw Error('Invalid or expired link');await c.query('UPDATE beta_tokens SET used_at=now() WHERE id=$1',[t.id]);await c.query("INSERT INTO beta_events(subject_id,event) VALUES($1,'Email verified')",[u.id]);});}
export async function resetPassword(db:DB,token:string,password:string){const h=await bcrypt.hash(passwordSchema.parse(password),12);return transaction(db,async c=>{const t=await takeToken(c,token,'reset');const u=(await c.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE lower(email)=$1 AND beta_active AND disabled_at IS NULL AND email_verified_at IS NOT NULL RETURNING id',[t.email,h])).rows[0];if(!u)throw Error('Invalid or expired link');await c.query("UPDATE beta_tokens SET used_at=now() WHERE email=$1 AND purpose='reset' AND used_at IS NULL",[t.email]);await c.query("INSERT INTO beta_events(subject_id,event) VALUES($1,'Password reset; sessions revoked')",[u.id]);});}
export async function setBetaAccess(db:DB,actorId:string,id:string,enabled:boolean){return transaction(db,async c=>{await requireBetaOwner(c,actorId);z.string().uuid().parse(id);if(id===actorId)throw Error('Cannot revoke your own access');await c.query('UPDATE users SET beta_active=$2,disabled_at=CASE WHEN $2 THEN NULL ELSE now() END,session_version=session_version+1 WHERE id=$1',[id,enabled]);await c.query("UPDATE beta_tokens SET revoked_at=now() WHERE email=(SELECT lower(email) FROM users WHERE id=$1) AND used_at IS NULL",[id]);await c.query('INSERT INTO beta_events(actor_id,subject_id,event) VALUES($1,$2,$3)',[actorId,id,enabled?'Beta access enabled':'Beta access revoked']);});}
