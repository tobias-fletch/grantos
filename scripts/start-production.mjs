import {spawn} from 'node:child_process';
const missing=['DATABASE_URL','AUTH_SECRET','APP_URL','SUPPORT_EMAIL'].filter(k=>!process.env[k]);
if(missing.length||!process.env.APP_URL?.startsWith('https://')){console.error('Production configuration incomplete. Set DATABASE_URL, AUTH_SECRET, HTTPS APP_URL and SUPPORT_EMAIL.');process.exit(1);}
const p=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT??'3000'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production',BETA_MODE:'true'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>p.kill(signal));p.on('exit',code=>{process.exitCode=code??1;});
