export const runtime="nodejs";
export const maxDuration=60;

import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";
import { decrypt, getProfile, saveProfile, SyncEvent } from "@/lib/sync-store";

type EventInput={sourceKey?:string;summary:string;description?:string;start:string;end:string;recurrence?:string[]};

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
  const events=(await request.json()).events as EventInput[];
  if(!Array.isArray(events)||events.length===0)return NextResponse.json({ok:false,error:"No timetable events to import."},{status:400});

  const credentials=JSON.parse(decrypt(profile.token));
  const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials(credentials);
  const calendar=google.calendar({version:"v3",auth});

  const existing=new Map(profile.events.map(e=>[e.sourceKey,e]));
  const upserts:SyncEvent[]=new Array(events.length);

  await runWithConcurrency(events,5,async(input,index)=>{
   const sourceKey=input.sourceKey||`manual:${index}:${input.summary}:${input.start}`;
   const previous=existing.get(sourceKey);
   const requestBody={
    summary:input.summary,
    description:input.description,
    start:{dateTime:input.start},
    end:{dateTime:input.end},
    extendedProperties:{private:{studentCalendarSourceKey:sourceKey}},
    ...(input.recurrence?.length?{recurrence:input.recurrence}:{})
   };
   let eventId=previous?.eventId;
   if(eventId){
    await calendar.events.update({calendarId:"primary",eventId,requestBody});
   }else{
    const result=await calendar.events.insert({calendarId:"primary",requestBody});
    eventId=result.data.id||undefined;
   }
   upserts[index]={...input,sourceKey,eventId};
  });

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