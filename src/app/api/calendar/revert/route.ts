export const runtime="nodejs";
export const maxDuration=60;

import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";
import { decrypt,getProfile,saveProfile } from "@/lib/sync-store";
import { subjects } from "@/lib/subjects";

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const LEGACY_SUBJECTS=new Set(subjects.map(subject=>subject.name.trim().toUpperCase()));
const LEGACY_CODES=subjects.map(subject=>subject.code.toUpperCase());

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

function isStudentCalendarEvent(event:any){
 const privateProps=event?.extendedProperties?.private||{};
 if(privateProps.studentCalendarApp==="student-calendar")return true;
 if(typeof privateProps.studentCalendarSourceKey==="string"&&privateProps.studentCalendarSourceKey.length>0)return true;

 // Legacy versions of the app did not always save extendedProperties.
 // Their timetable events used an exact Term-V subject title plus timetable
 // metadata (course code / section / faculty) or a weekly class recurrence.
 const summary=String(event?.summary||"").trim().toUpperCase();
 if(!LEGACY_SUBJECTS.has(summary))return false;
 const description=String(event?.description||"").toUpperCase();
 const recurrence=Array.isArray(event?.recurrence)?event.recurrence.join(" ").toUpperCase():"";
 const hasCourseCode=LEGACY_CODES.some(code=>description.includes(code));
 const looksLikeWeeklyClass=recurrence.includes("FREQ=WEEKLY");
 return hasCourseCode||looksLikeWeeklyClass;
}

async function findStudentBatch(calendar:any,limit:number){
 const ids:string[]=[];
 const seen=new Set<string>();
 const add=(event:any)=>{
  const eventId=String(event?.id||"");
  if(eventId&&isStudentCalendarEvent(event)&&!seen.has(eventId)){seen.add(eventId);ids.push(eventId);}
 };

 // First fetch events explicitly marked by current versions of the app.
 let pageToken:string|undefined;
 do{
  const result:any=await calendar.events.list({
   calendarId:"primary",
   privateExtendedProperty:["studentCalendarApp=student-calendar"],
   showDeleted:false,
   singleEvents:false,
   maxResults:250,
   pageToken
  });
  for(const event of result.data.items||[])add(event);
  if(ids.length>=limit)return ids.slice(0,limit);
  pageToken=result.data.nextPageToken||undefined;
 }while(pageToken);

 // Also scan the practical timetable period for legacy events that were created
 // by earlier builds before the permanent app marker existed.
 pageToken=undefined;
 const timeMin=new Date(Date.now()-1000*60*60*24*365*2).toISOString();
 const timeMax=new Date(Date.now()+1000*60*60*24*365*2).toISOString();
 do{
  const result:any=await calendar.events.list({
   calendarId:"primary",
   timeMin,
   timeMax,
   showDeleted:false,
   singleEvents:false,
   maxResults:250,
   pageToken
  });
  for(const event of result.data.items||[])add(event);
  if(ids.length>=limit)return ids.slice(0,limit);
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

  const batchSize=10;
  const trackedIds=[...new Set((profile.events||[]).map((event:any)=>event.eventId).filter(Boolean))].slice(0,batchSize);
  const ids=trackedIds.length?trackedIds:await findStudentBatch(calendar,batchSize);

  for(const eventId of ids)await removeWithRetry(calendar,eventId);

  if(trackedIds.length){
   const removedSet=new Set(trackedIds);
   profile.events=(profile.events||[]).filter((event:any)=>!event.eventId||!removedSet.has(event.eventId));
  }

  // Never declare completion merely because the current profile is empty.
  // A previous login can have created events that are discoverable only from
  // Google Calendar itself.
  const next=await findStudentBatch(calendar,1);
  const done=next.length===0;

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