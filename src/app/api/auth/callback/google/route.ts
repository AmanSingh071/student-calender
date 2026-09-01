import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";
import crypto from "crypto";
import { encrypt, saveProfile } from "@/lib/sync-store";

export async function GET(request:NextRequest){
 const origin=request.nextUrl.origin;
 const redirectUri=`${origin}/api/auth/callback/google`;
 const code=request.nextUrl.searchParams.get("code");
 const state=request.nextUrl.searchParams.get("state");
 const expected=request.cookies.get("oauth_state")?.value;

 if(!code||!state||!expected||state!==expected)
  return NextResponse.redirect(new URL("/?google=callback-error",origin));

 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)
  return NextResponse.redirect(new URL("/?google=config-error",origin));

 const client=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,redirectUri);
 try{
  const {tokens}=await client.getToken(code);
  if(!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve access.");
  const id=crypto.randomUUID();
  await saveProfile({
    id,
    token:encrypt(JSON.stringify({
      refresh_token:tokens.refresh_token,
      access_token:tokens.access_token,
      expiry_date:tokens.expiry_date
    })),
    selected:[],
    sections:{},
    events:[],
    enabled:true,
    updatedAt:new Date().toISOString()
  });
  const response=NextResponse.redirect(new URL("/?google=connected",origin));
  response.cookies.set("student_sync_id",id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:60*60*24*180,path:"/"});
  response.cookies.set("google_calendar_token","",{maxAge:0,path:"/"});
  response.cookies.set("oauth_state","",{maxAge:0,path:"/"});
  return response;
 }catch(error){
  console.error("Google OAuth callback failed",error);
  return NextResponse.redirect(new URL("/?google=error",origin));
 }
}