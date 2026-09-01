import { NextRequest,NextResponse } from "next/server";
import { getProfile,decrypt } from "@/lib/sync-store";
import { google } from "googleapis";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 try{
  const id=request.cookies.get("student_sync_id")?.value;
  if(!id)return NextResponse.json({connected:false});
  const profile=await getProfile(id);
  if(!profile)return NextResponse.json({connected:false});
  let account:any=null;
  try{
   const credentials=JSON.parse(decrypt(profile.token));
   const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);
   auth.setCredentials(credentials);
   const info=(await google.oauth2({version:"v2",auth}).userinfo.get()).data;
   account={name:info.name||info.email||"Google account",email:info.email||"",picture:info.picture||undefined};
  }catch{}
  return NextResponse.json({connected:true,autoSync:Boolean(profile.enabled),lastSyncAt:profile.lastSyncAt||null,lastError:profile.lastError||null,account});
 }catch{return NextResponse.json({connected:false});}
}