"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
export function ChecklistRefresh(){const router=useRouter();useEffect(()=>{const timer=setInterval(()=>router.refresh(),10000);return()=>clearInterval(timer);},[router]);return <button type="button" onClick={()=>router.refresh()} className="text-sm underline">Check draft status</button>;}
