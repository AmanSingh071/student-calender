import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const redirectUri=(origin:string)=>`${origin}/api/auth/callback/google`;

export async function GET(request:NextRequest){
 const origin=request.nextUrl.origin;
 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET){
  return NextResponse.redirect(new URL("/?google=config-error",origin));
 }
 const state=crypto.randomUUID();
 const client=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,redirectUri(origin));
 const url=client.generateAuthUrl({
  access_type:"offline",
  prompt:"consent",
  scope:["openid","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/calendar.events"],
  state
 });
 const response=NextResponse.redirect(url);
 response.cookies.set("oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
 return response;
}