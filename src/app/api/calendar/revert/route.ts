export const runtime="nodejs";
export const maxDuration=60;

import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { decrypt, getProfile, saveProfile } from "@/lib/sync-store";

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function removeWithRetry(calendar:any,eventId:string){
 for(let attempt=0;attempt<6;attempt++){
  try{await calendar.events.delete({calendarId:"primary",eventId});return}
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

  // Delete every event tracked by this app in this request. The profile is
  // only cleared after all deletes succeed, so a revert can safely be retried.
  const tracked=[...profile.events];
  let removed=0;
  for(const event of tracked){
   if(event.eventId)await removeWithRetry(calendar,event.eventId);
   removed++;
  }
  profile.events=[];

  // Once every app-created event is gone, also clear the saved choices
  // and disable automatic syncing. The Google connection itself remains available.
  if(profile.events.length===0){
   profile.selected=[];
   profile.sections={};
   profile.enabled=false;
   profile.lastSyncAt=undefined;
   profile.lastError=undefined;
   profile.sourceHash=undefined;
  }
  profile.updatedAt=new Date().toISOString();
  await saveProfile(profile);

  return NextResponse.json({ok:true,removed,remaining:0,complete:true});
 }catch(error){
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Could not revert the calendar changes."},{status:500});
 }
}