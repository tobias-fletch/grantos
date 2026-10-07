'use server';
import {auth} from '@/auth';
import {pool} from '@/lib/db/pool';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {allowedAttempt,requestAddress,emailSchema,issueToken,verifyEmail,resetPassword,createInvitation,revokeInvitation,setBetaAccess,requireBetaOwner} from '@/lib/beta/security';
import {emailConfigured,sendAccountEmail} from '@/lib/beta/email';
export async function requestAccountEmail(form:FormData){
 try{const email=emailSchema.parse(form.get('email'));const purpose=form.get('purpose')==='verify'?'verify':'reset';
 if(!await allowedAttempt(pool,purpose,email,requestAddress(await headers())))throw Error('Limited');
 const u=(await pool.query('SELECT * FROM users WHERE lower(email)=$1 AND beta_active AND disabled_at IS NULL',[email])).rows[0];
 if(u&&emailConfigured()&&(purpose==='verify'||u.email_verified_at)){const t=await issueToken(pool,email,purpose);try{await sendAccountEmail(pool,email,purpose,t.token,t.id);}catch{await pool.query('UPDATE beta_tokens SET revoked_at=now() WHERE id=$1',[t.id]);throw Error('Unavailable');}}
 }catch{console.info('Account email request completed without delivery confirmation');}
 redirect('/recover?sent=1');
}
export async function consumeAccountLink(form:FormData){const reset=form.get('purpose')==='reset';let failed=false;
 try{if(!await allowedAttempt(pool,reset?'reset-consume':'verify-consume','link',requestAddress(await headers())))throw Error('Limited');if(reset)await resetPassword(pool,String(form.get('token')),String(form.get('password')));else await verifyEmail(pool,String(form.get('token')));}catch{failed=true;}
 if(failed)redirect((reset?'/reset-password':'/verify')+'?error=invalid');redirect('/login?updated=1');
}
export async function betaAdminAction(form:FormData){const s=await auth();if(!s?.user?.id)redirect('/login');let failed=false;
 try{await requireBetaOwner(pool,s.user.id);const op=String(form.get('operation'));
 if(op==='invite'){if(!emailConfigured())throw Error('Configure email first');const email=emailSchema.parse(form.get('email'));if(!await allowedAttempt(pool,'invite',email,s.user.id))throw Error('Limited');const t=await createInvitation(pool,s.user.id,email);try{await sendAccountEmail(pool,email,t.purpose,t.token,t.id);}catch{await pool.query('UPDATE beta_tokens SET revoked_at=now() WHERE id=$1',[t.id]);throw Error('Unavailable');}}
 else if(op==='revoke')await revokeInvitation(pool,s.user.id,String(form.get('id')));
 else if(op==='enable'||op==='disable')await setBetaAccess(pool,s.user.id,String(form.get('id')),op==='enable');else throw Error('Invalid operation');
 }catch{failed=true;}revalidatePath('/app','layout');redirect('/app/beta-admin?'+(failed?'error=1':'updated=1'));
}
