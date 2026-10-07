import {transaction,type DB} from '../checklists/store';
export function emailConfigured(){return !!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.APP_URL?.startsWith('https://')&&process.env.EMAIL_ENABLED==='true');}
export async function sendAccountEmail(db:DB,to:string,purpose:'invite'|'verify'|'reset',token:string,tokenId:string){
 if(!emailConfigured())throw Error('Email is not configured');
 // Reserve before sending; failed or uncertain sends consume quota too. No automatic retries.
 const reserved=await transaction(db,async c=>{await c.query('SELECT pg_advisory_xact_lock(7823011)');
 const usage=(await c.query("SELECT coalesce(sum(count),0)::int AS month,coalesce(sum(count) FILTER(WHERE day=(now() AT TIME ZONE 'UTC')::date),0)::int AS today FROM email_budget WHERE day>=date_trunc('month',now() AT TIME ZONE 'UTC')::date")).rows[0];
 if(usage.month>=2500||usage.today>=90)return false;
 await c.query("INSERT INTO email_budget(day,count) VALUES((now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET count=email_budget.count+1");return true;});
 if(!reserved)throw Error('Email quota reached');
 const path=purpose==='invite'?'/register':purpose==='verify'?'/verify':'/reset-password';const url=new URL(path,process.env.APP_URL);url.searchParams.set('token',token);
 const subject=purpose==='invite'?'Your GrantOS beta invitation':purpose==='verify'?'Verify your GrantOS email':'Reset your GrantOS password';
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':tokenId},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,text:`${subject}\n\n${url}\n\nThis link expires ${purpose==='invite'?'in seven days':purpose==='reset'?'in 30 minutes':'in 24 hours'} and can only be used once. If you did not request this, ignore this email.`}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Email delivery unavailable');
}
