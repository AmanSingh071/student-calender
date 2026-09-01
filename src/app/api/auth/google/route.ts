import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const redirectUri=()=>`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`;

function oauth(){
 return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,redirectUri());
}

export async function GET(){
 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET||!process.env.NEXT_PUBLIC_APP_URL)
  return NextResponse.json({ok:false,error:"Google OAuth is not fully configured."},{status:500});
 const state=crypto.randomUUID();
 const url=oauth().generateAuthUrl({
  access_type:"offline",
  prompt:"consent",
  scope:["openid","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/calendar.events"],
  state
 });
 const response=NextResponse.redirect(url);
 response.cookies.set("oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
 return response;
}