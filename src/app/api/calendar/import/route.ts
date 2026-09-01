import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";

type EventInput={summary:string;description?:string;start:string;end:string};

export async function POST(request:NextRequest){
 try{
  const token=request.cookies.get("google_calendar_token")?.value;
  if(!token)return NextResponse.json({ok:false,error:"Google Calendar is not connected."},{status:401});
  const credentials=JSON.parse(Buffer.from(token,"base64url").toString("utf8"));
  const events=(await request.json()).events as EventInput[];
  if(!Array.isArray(events)||events.length===0)return NextResponse.json({ok:false,error:"No timetable events to import."},{status:400});

  const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials(credentials);
  const calendar=google.calendar({version:"v3",auth});

  const created:string[]=[];
  for(const event of events){
   const result=await calendar.events.insert({
    calendarId:"primary",
    requestBody:{
     summary:event.summary,
     description:event.description,
     start:{dateTime:event.start},
     end:{dateTime:event.end}
    }
   });
   if(result.data.htmlLink)created.push(result.data.htmlLink);
  }
  return NextResponse.json({ok:true,created:events.length,links:created});
 }catch(error){
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Calendar import failed"},{status:500});
 }
}