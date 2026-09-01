import { google } from "googleapis";
import { NextRequest,NextResponse } from "next/server";

export async function GET(request:NextRequest){
 const origin=request.nextUrl.origin;
 const redirectUri=`${origin}/api/auth/callback/google`;
 const code=request.nextUrl.searchParams.get("code");
 const state=request.nextUrl.searchParams.get("state");
 const expected=request.cookies.get("oauth_state")?.value;

 if(!code||!state||!expected||state!==expected)
  return NextResponse.redirect(new URL("/?google=error",origin));

 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)
  return NextResponse.redirect(new URL("/?google=config-error",origin));

 const client=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,redirectUri);
 try{
  const {tokens}=await client.getToken(code);
  const response=NextResponse.redirect(new URL("/?google=connected",origin));
  const tokenPayload=Buffer.from(JSON.stringify({
   access_token:tokens.access_token,
   refresh_token:tokens.refresh_token,
   expiry_date:tokens.expiry_date
  })).toString("base64url");
  response.cookies.set("google_calendar_token",tokenPayload,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:60*60*24*30,path:"/"});
  response.cookies.set("oauth_state","",{maxAge:0,path:"/"});
  return response;
 }catch(error){
  console.error("Google OAuth callback failed",error);
  return NextResponse.redirect(new URL("/?google=error",origin));
 }
}