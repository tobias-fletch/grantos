import {transaction,type DB} from '../checklists/store';
import {emailSchema} from './security';
const SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';
export function emailConfigured(){
 try{const url=new URL(process.env.APP_URL??'');return url.protocol==='https:'&&!url.username&&!url.password&&!!(process.env.EMAIL_ENABLED==='true'&&process.env.GMAIL_OAUTH_PRODUCTION_CONFIRMED==='true'&&process.env.GMAIL_CLIENT_ID&&process.env.GMAIL_CLIENT_SECRET&&process.env.GMAIL_REFRESH_TOKEN&&emailSchema.safeParse(process.env.GMAIL_SENDER).success);}catch{return false;}
}
export async function sendAccountEmail(db:DB,to:string,purpose:'invite'|'verify'|'reset',token:string,tokenId:string){
 if(!emailConfigured())throw Error('Email is not configured');
 const recipient=emailSchema.parse(to),sender=emailSchema.parse(process.env.GMAIL_SENDER);
 // Reserve each token once before any network request. Gmail has no idempotency-key API;
 // uncertain deliveries must never be retried automatically.
 const reserved=await transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(7823011)');
  if((await c.query('SELECT 1 FROM email_deliveries WHERE token_id=$1',[tokenId])).rowCount)throw Error('Delivery already attempted');
  const usage=(await c.query("SELECT coalesce(sum(count),0)::int AS month,coalesce(sum(count) FILTER(WHERE day=(now() AT TIME ZONE 'UTC')::date),0)::int AS today FROM email_budget WHERE day>=date_trunc('month',now() AT TIME ZONE 'UTC')::date")).rows[0];
  if(usage.month>=2500||usage.today>=90)return false;
  await c.query("INSERT INTO email_budget(day,count) VALUES((now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET count=email_budget.count+1");
  await c.query("INSERT INTO email_deliveries(token_id,status) VALUES($1,'attempted')",[tokenId]);return true;
 });
 if(!reserved)throw Error('Email quota reached');
 try{
  const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID!,client_secret:process.env.GMAIL_CLIENT_SECRET!,refresh_token:process.env.GMAIL_REFRESH_TOKEN!,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
  if(!auth.ok)throw Error('Mailbox authorization unavailable');
  const credentials=await auth.json();if(typeof credentials.access_token!=='string'||(credentials.scope&&credentials.scope!==SEND_SCOPE))throw Error('Mailbox authorization invalid');
  const path=purpose==='invite'?'/register':purpose==='verify'?'/verify':'/reset-password';
  const url=new URL(path,process.env.APP_URL);url.searchParams.set('token',token);
  const subject=purpose==='invite'?'Your GrantOS beta invitation':purpose==='verify'?'Verify your GrantOS email':'Reset your GrantOS password';
  const body=subject+'\n\n'+url+'\n\nThis link expires '+(purpose==='invite'?'in seven days':purpose==='reset'?'in 30 minutes':'in 24 hours')+' and can only be used once. If you did not request this, ignore this email.';
  const mime=['From: GrantOS <'+sender+'>','To: '+recipient,'Subject: '+subject,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+Buffer.from(body).toString('base64').match(/.{1,76}/g)!.join('\r\n')].join('\r\n');
  const result=await fetch('https://gmail.googleapis.com/gmail/v1/users/'+encodeURIComponent(sender)+'/messages/send',{method:'POST',headers:{Authorization:'Bearer '+credentials.access_token,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error('Email delivery unavailable');
  await db.query("UPDATE email_deliveries SET status='sent',updated_at=now() WHERE token_id=$1",[tokenId]);
 }catch{
  await db.query("UPDATE email_deliveries SET status='failed',updated_at=now() WHERE token_id=$1",[tokenId]);
  throw Error('Email delivery unavailable; check mailbox authorization and quota');
 }
}
