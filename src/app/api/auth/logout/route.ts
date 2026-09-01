import { NextRequest,NextResponse } from "next/server";
export async function POST(request:NextRequest){
 const response=NextResponse.json({ok:true});
 response.cookies.set("student_sync_id","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:0,path:"/"});
 response.cookies.set("oauth_state","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:0,path:"/"});
 return response;
}