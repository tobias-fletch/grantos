import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
// Run interactively with a Google Desktop OAuth client JSON file outside the repository.
// Only the owner authorizes this mailbox; beta users never authorize Google access.
async function main(){
 const file=process.argv[2];if(!file)throw Error('Provide Desktop OAuth client JSON path');
 const raw=JSON.parse(await readFile(file,'utf8')),client=raw.installed;
 if(!client?.client_id||!client?.client_secret)throw Error('Desktop OAuth client required');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const redirect='http://127.0.0.1:'+server.address().port+'/oauth/callback';
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [key,value] of Object.entries({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:'tobias.fletch@gmail.com'}))url.searchParams.set(key,value);
 console.log('Authorize send-only access using tobias.fletch@gmail.com in your browser:');console.log(url.href);
 const timer=setTimeout(()=>server.close(),300000);
 try{
 const code=await new Promise((resolve,reject)=>{
  server.on('close',()=>reject(Error('Authorization timed out')));
  server.on('request',(req,res)=>{const callback=new URL(req.url,redirect);res.setHeader('Content-Type','text/plain');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
   if(callback.pathname!=='/oauth/callback'||callback.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid authorization response');return;}
   if(!callback.searchParams.get('code')){res.end('Authorization declined.');reject(Error('Authorization declined'));return;}
   res.end('Authorization received. Return to the setup terminal.');resolve(callback.searchParams.get('code'));
  });
 });
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(!response.ok||!result.refresh_token||result.scope!=='https://www.googleapis.com/auth/gmail.send')throw Error('Send-only authorization missing');
 const values={GMAIL_CLIENT_ID:client.client_id,GMAIL_CLIENT_SECRET:client.client_secret,GMAIL_REFRESH_TOKEN:result.refresh_token,GMAIL_SENDER:'tobias.fletch@gmail.com',GMAIL_OAUTH_PRODUCTION_CONFIRMED:'false',EMAIL_ENABLED:'false'};
 await writeFile('.env.gmail',Object.entries(values).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{flag:'wx',mode:0o600});
 console.log('Saved ignored .env.gmail. No tokens printed. Verify Google publishing status before enabling delivery.');
 }finally{clearTimeout(timer);server.close();}
}
main().catch(()=>{console.error('Gmail setup failed; check client type, consent, and whether .env.gmail already exists. No credentials logged.');process.exitCode=1;});
