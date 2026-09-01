import { NextRequest,NextResponse } from "next/server";
export async function GET(request:NextRequest){
 return NextResponse.json({connected:Boolean(request.cookies.get("google_calendar_token")?.value)});
}