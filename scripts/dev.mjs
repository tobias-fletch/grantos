import { spawn } from 'node:child_process';
const children=[spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true}),spawn(process.execPath,['--import','tsx','scripts/discovery-worker.ts'],{stdio:'inherit',windowsHide:true})];
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;for(const child of children)child.kill();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const child of children){child.on('error',()=>{process.exitCode=1;stop();});child.on('exit',code=>{if(!stopping){process.exitCode=code??1;stop();}});}
