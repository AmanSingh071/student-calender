import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/sync-store";

export async function POST(request:NextRequest){
  try{
    const id=request.cookies.get("student_sync_id")?.value;
    if(!id) return NextResponse.json({ok:false,error:"Google Calendar is not connected."},{status:401});
    const body=await request.json();
    const selected=Array.isArray(body.selected)?body.selected.map(String):[];
    const sections=body.sections&&typeof body.sections==="object"?body.sections:{};
    const profile=await getProfile(id);
    if(!profile) return NextResponse.json({ok:false,error:"Sync profile was not found. Please reconnect Google."},{status:404});
    profile.selected=selected;
    profile.sections=sections;
    profile.enabled=true;
    profile.updatedAt=new Date().toISOString();
    await saveProfile(profile);
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Could not save sync preferences"},{status:500});
  }
}
