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

async function findStudentCalendarEvents(calendar:any){
 const ids=new Set<string>();
 let pageToken:string|undefined;
 do{
  const result=await calendar.events.list({
   calendarId:"primary",
   showDeleted:false,
   singleEvents:false,
   maxResults:2500,
   pageToken,
   timeMin:"2020-01-01T00:00:00Z",
   timeMax:"2035-12-31T23:59:59Z"
  });
  for(const event of result.data.items||[]){
   const props=event.extendedProperties?.private||{};
   if(event.id&&(props.studentCalendarSourceKey||props.studentCalendarApp==="student-calendar"))ids.add(event.id);
  }
  pageToken=result.data.nextPageToken||undefined;
 }while(pageToken);
 return ids;
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

  // Do not rely only on Supabase. Older imports can still exist in Google
  // Calendar even if their saved IDs were lost or overwritten.
  // Start with IDs tracked in the user's profile. This is fast and covers
  // previous imports. Then search only for the permanent app marker used by
  // newer imports instead of scanning the user's entire calendar.
  const ids=new Set<string>();
  for(const event of profile.events||[]){if(event.eventId)ids.add(event.eventId);}
  let pageToken:string|undefined;
  do{
   const result=await calendar.events.list({
    calendarId:"primary",
    privateExtendedProperty:"studentCalendarApp=student-calendar",
    showDeleted:false,
    singleEvents:false,
    maxResults:250,
    pageToken
   });
   for(const event of result.data.items||[]){if(event.id)ids.add(event.id);}
   pageToken=result.data.nextPageToken||undefined;
  }while(pageToken);

  let removed=0;
  for(const eventId of ids){
   await removeWithRetry(calendar,eventId);
   removed++;
  }

  // Reset the complete Student Calendar state only after deletion succeeds.
  profile.events=[];
  profile.selected=[];
  profile.sections={};
  profile.enabled=false;
  profile.lastSyncAt=undefined;
  profile.lastError=undefined;
  profile.sourceHash=undefined;
  profile.updatedAt=new Date().toISOString();
  await saveProfile(profile);

  return NextResponse.json({ok:true,removed,remaining:0,complete:true});
 }catch(error){
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Could not revert the calendar changes."},{status:500});
 }
}