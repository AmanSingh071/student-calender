import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";
import { decrypt, getProfile, saveProfile, SyncEvent } from "@/lib/sync-store";

type EventInput={sourceKey?:string;summary:string;description?:string;start:string;end:string};

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
  const saved:SyncEvent[]=[];

  for(let i=0;i<events.length;i++){
   const input=events[i];
   const sourceKey=input.sourceKey||`manual:${i}:${input.summary}:${input.start}`;
   const previous=existing.get(sourceKey);
   const requestBody={
    summary:input.summary,
    description:input.description,
    start:{dateTime:input.start},
    end:{dateTime:input.end},
    extendedProperties:{private:{studentCalendarSourceKey:sourceKey}}
   };
   let eventId=previous?.eventId;
   if(eventId){
    await calendar.events.update({calendarId:"primary",eventId,requestBody});
   }else{
    const result=await calendar.events.insert({calendarId:"primary",requestBody});
    eventId=result.data.id||undefined;
   }
   saved.push({...input,sourceKey,eventId});
  }
  profile.events=saved;
  profile.enabled=true;
  profile.lastSyncAt=new Date().toISOString();
  profile.lastError=undefined;
  await saveProfile(profile);
  return NextResponse.json({ok:true,created:events.length});
 }catch(error){
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Calendar import failed"},{status:500});
 }
}