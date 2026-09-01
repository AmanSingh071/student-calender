import { NextRequest,NextResponse } from "next/server";
import { getProfile } from "@/lib/sync-store";
export async function GET(request:NextRequest){
 try{
  const id=request.cookies.get("student_sync_id")?.value;
  if(!id)return NextResponse.json({connected:false});
  const profile=await getProfile(id);
  return NextResponse.json({connected:Boolean(profile),autoSync:Boolean(profile?.enabled),lastSyncAt:profile?.lastSyncAt||null,lastError:profile?.lastError||null});
 }catch{
  return NextResponse.json({connected:false});
 }
}