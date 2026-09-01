export const runtime="nodejs";
export const maxDuration=60;

import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";
import { decrypt, getProfile, saveProfile, SyncEvent } from "@/lib/sync-store";

type EventInput={sourceKey?:string;summary:string;description?:string;start:string;end:string;recurrence?:string[]};

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

// Google Calendar color IDs. A subject always receives the same color,
// so different subjects are easy to distinguish while the same subject
// stays visually consistent across the timetable.
const CALENDAR_COLOR_IDS=["1","2","3","4","5","6","7","8","9","10","11"];

function colorForSubject(sourceKey:string,summary:string){
 const subject=(sourceKey.includes("|")?sourceKey.split("|")[0]:summary).trim().toUpperCase();
 // Use a stable palette index but avoid adjacent events of different codes
 // collapsing to the same visible default color.
 let hash=2166136261;
 for(let i=0;i<subject.length;i++){hash^=subject.charCodeAt(i);hash=Math.imul(hash,16777619)}
 return CALENDAR_COLOR_IDS[(hash>>>0)%CALENDAR_COLOR_IDS.length];
}

async function withRetry<T>(work:()=>Promise<T>):Promise<T>{
 let last:any;
 for(let attempt=0;attempt<6;attempt++){
  try{return await work()}catch(error:any){
   last=error;const status=error?.code||error?.response?.status;
   if(status!==429&&status!==403&&status<500)throw error;
   const retryAfter=Number(error?.response?.headers?.["retry-after"]||0);
   await sleep(retryAfter>0?retryAfter*1000:Math.min(1000*2**attempt,8000));
  }
 }
 throw last;
}

async function runWithConcurrency<T>(items:T[],limit:number,work:(item:T,index:number)=>Promise<void>){
 let next=0;
 const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
  while(true){
   const index=next++;
   if(index>=items.length)return;
   await work(items[index],index);
  }
 });
 await Promise.all(workers);
}

export async function POST(request:NextRequest){
 try{
  const id=request.cookies.get("student_sync_id")?.value;
  if(!id)return NextResponse.json({ok:false,error:"Google Calendar is not connected."},{status:401});
  const profile=await getProfile(id);
  if(!profile)return NextResponse.json({ok:false,error:"Sync profile was not found. Please reconnect Google."},{status:401});
  const body=await request.json();
  const events=body.events as EventInput[];
  const replaceCodes=Array.isArray(body.replaceCodes)?body.replaceCodes.map((x:any)=>String(x)):[];
  const allSourceKeys=Array.isArray(body.allSourceKeys)?new Set(body.allSourceKeys.map((x:any)=>String(x))):new Set<string>();
  if(!Array.isArray(events)||events.length===0)return NextResponse.json({ok:false,error:"No timetable events to import."},{status:400});

  const credentials=JSON.parse(decrypt(profile.token));
  const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials(credentials);
  const calendar=google.calendar({version:"v3",auth});

  const existing=new Map(profile.events.map(e=>[e.sourceKey,e]));
  const upserts:SyncEvent[]=new Array(events.length);

  await runWithConcurrency(events,2,async(input,index)=>{
   const sourceKey=input.sourceKey||`manual:${index}:${input.summary}:${input.start}`;
   const previous=existing.get(sourceKey);
   const requestBody={
    summary:input.summary,
    colorId:colorForSubject(sourceKey,input.summary),
    description:input.description,
    start:{dateTime:input.start},
    end:{dateTime:input.end},
    extendedProperties:{private:{studentCalendarSourceKey:sourceKey,studentCalendarApp:"student-calendar"}},
    ...(input.recurrence?.length?{recurrence:input.recurrence}:{})
   };
   let eventId=previous?.eventId;
   if(eventId){
    // Updating explicitly includes colorId so old events also receive the
    // subject color after a re-import.
    await withRetry(()=>calendar.events.update({calendarId:"primary",eventId,requestBody}));
   }else{
    const result=await withRetry(()=>calendar.events.insert({calendarId:"primary",requestBody}));
    eventId=result.data.id||undefined;
   }
   upserts[index]={...input,sourceKey,eventId};
  });

  // On the first batch, remove obsolete events previously generated for the
  // subjects being re-imported. This cleans up bad events created by an older parser.
  if(replaceCodes.length){
   const fresh=allSourceKeys.size?allSourceKeys:new Set(upserts.map(e=>e.sourceKey));
   const stale=profile.events.filter(e=>{
    const code=e.sourceKey.split("|")[0];
    return replaceCodes.includes(code)&&!fresh.has(e.sourceKey);
   });
   for(const event of stale){
    if(event.eventId){
     try{await calendar.events.delete({calendarId:"primary",eventId:event.eventId});}
     catch(err:any){if(err?.code!==404)throw err;}
    }
   }
   const staleKeys=new Set(stale.map(e=>e.sourceKey));
   profile.events=profile.events.filter(e=>!staleKeys.has(e.sourceKey));
  }

  // Merge batches instead of discarding events saved by earlier batches.
  const changed=new Set(upserts.map(e=>e.sourceKey));
  profile.events=[...profile.events.filter(e=>!changed.has(e.sourceKey)),...upserts];
  profile.enabled=true;
  profile.lastSyncAt=new Date().toISOString();
  profile.lastError=undefined;
  await saveProfile(profile);
  return NextResponse.json({ok:true,created:events.length});
 }catch(error){
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Calendar import failed"},{status:500});
 }
}