'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Box,Button,MenuItem,TextField,Typography} from '@mui/material';
import {startApplicationAction,startSavedApplicationAction} from '@/app/actions/start-application';
export function StartApplication({opportunityId,savedApplicationId,kind='catalog',projectId,applicationId,applicationProjectId,projects=[],canEdit}:{opportunityId?:string;savedApplicationId?:string;kind?:'catalog'|'lead'|'external';projectId?:string|null;applicationId?:string|null;applicationProjectId?:string|null;projects?:{id:string;name:string}[];canEdit:boolean}){
  const router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState(''),[selected,setSelected]=useState('');
  const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const needsProject=!projectId&&!applicationProjectId;
  if(!canEdit)return <Typography>View-only access. A workspace editor can start preparation.</Typography>;
  if(applicationId&&projectId&&applicationProjectId&&projectId!==applicationProjectId)return <Box><Typography>This grant is already connected to a different project. Its existing project and work are preserved.</Typography><Button component="a" href={'/app/applications/'+applicationId}>Open existing application</Button></Box>;
  return <Box sx={{minWidth:240}}>
  {needsProject&&<Box sx={{mb:2}}>{projects.length?<TextField fullWidth select label="Project for this application" value={selected} onChange={e=>setSelected(e.target.value)} disabled={pending}>
    <MenuItem value="">Choose a project</MenuItem>{projects.map(p=><MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
  </TextField>:<Typography>Create a project first. <Button component="a" href="/app/projects">Create project</Button></Typography>}</Box>}
  <Button variant="contained" disabled={pending||needsProject&&!selected} onClick={()=>start(async()=>{
    setError('');
    try{const chosen=projectId||(needsProject?selected:null);const result=savedApplicationId?await startSavedApplicationAction(savedApplicationId,chosen):await startApplicationAction(kind,opportunityId!,chosen);if(!active.current)return;if(result.id){router.push('/app/applications/'+result.id+'#preparation');router.refresh();}else setError(result.error??'Could not start preparation.');}
    catch{if(!active.current)return;setError('Could not confirm preparation was started. Reopen the grant before trying again.');}
  })}>{pending?'Opening preparation…':applicationId?'Continue application':'Start application'}</Button>
  <Typography variant="caption" sx={{display:'block',mt:1}}>Creates private preparation. Nothing is sent to the funder.</Typography>
  {error&&<Alert severity="error" sx={{mt:1}}>{error}</Alert>}</Box>;
}
