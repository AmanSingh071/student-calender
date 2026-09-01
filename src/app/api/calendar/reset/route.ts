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
  if(!profile)return NextResponse.json({ok:false,error:"Sync profile was not found. Please reconnect Google."},{status:401});
  const credentials=JSON.parse(decrypt(profile.token));
  const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials(credentials);
  const calendar=google.calendar({version:"v3",auth});
  const chunk=profile.events.slice(0,10);
  for(const event of chunk){if(event.eventId)await removeWithRetry(calendar,event.eventId)}
  profile.events=profile.events.slice(chunk.length);
  await saveProfile(profile);
  return NextResponse.json({ok:true,removed:chunk.length,remaining:profile.events.length});
 }catch(error){
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Could not clean old imported events."},{status:500});
 }
}