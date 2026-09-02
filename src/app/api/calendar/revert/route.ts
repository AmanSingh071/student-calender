export const runtime="nodejs";
export const maxDuration=60;

import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";
import { decrypt,getProfile,saveProfile } from "@/lib/sync-store";

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function removeWithRetry(calendar:any,eventId:string){
 for(let attempt=0;attempt<6;attempt++){
  try{await calendar.events.delete({calendarId:"primary",eventId});return;}
  catch(error:any){
   const status=error?.code||error?.response?.status;
   if(status===404)return;
   if(status===429||status===403||status>=500){
    const retryAfter=Number(error?.response?.headers?.["retry-after"]||0);
    await sleep(retryAfter>0?retryAfter*1000:Math.min(1000*2**attempt,8000));
    continue;
   }
   throw error;
  }
 }
 throw new Error("Google Calendar is temporarily rate-limiting requests. Please try again in a minute.");
}

async function findMarkedBatch(calendar:any,limit:number){
 const result=await calendar.events.list({
  calendarId:"primary",
  privateExtendedProperty:["studentCalendarApp=student-calendar"],
  showDeleted:false,
  singleEvents:false,
  maxResults:limit
 });
 return (result.data.items||[]).map((event:any)=>event.id).filter(Boolean) as string[];
}

export async function POST(request:NextRequest){
 try{
  const id=request.cookies.get("student_sync_id")?.value;
  if(!id)return NextResponse.json({ok:false,error:"Google Calendar is not connected."},{status:401});
  const profile=await getProfile(id);
  if(!profile)return NextResponse.json({ok:false,error:"Sync profile was not found."},{status:401});

  const credentials=JSON.parse(decrypt(profile.token));
  const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials(credentials);
  const calendar=google.calendar({version:"v3",auth});

  // Keep every server request small. This avoids Vercel timeouts and lets the
  // browser show live progress while a large timetable is being removed.
  const batchSize=10;
  const trackedIds=[...new Set((profile.events||[]).map((event:any)=>event.eventId).filter(Boolean))].slice(0,batchSize);
  const ids=trackedIds.length?trackedIds:await findMarkedBatch(calendar,batchSize);

  for(const eventId of ids)await removeWithRetry(calendar,eventId);

  if(trackedIds.length){
   const removedSet=new Set(trackedIds);
   profile.events=(profile.events||[]).filter((event:any)=>!event.eventId||!removedSet.has(event.eventId));
  }

  // Check whether another small batch exists. This is intentionally a single
  // marker query rather than scanning the user's entire calendar.
  let done=false;
  if(profile.events?.length){
   done=false;
  }else{
   const next=await findMarkedBatch(calendar,1);
   done=next.length===0;
  }

  if(done){
   profile.events=[];
   profile.selected=[];
   profile.sections={};
   profile.enabled=false;
   profile.lastSyncAt=undefined;
   profile.lastError=undefined;
   profile.sourceHash=undefined;
  }
  profile.updatedAt=new Date().toISOString();
  await saveProfile(profile);

  return NextResponse.json({ok:true,removed:ids.length,done,remaining:done?0:1});
 }catch(error:any){
  const message=error?.response?.data?.error?.message||error?.message||"Could not revert the calendar changes.";
  return NextResponse.json({ok:false,error:message},{status:500});
 }
}