export const runtime="nodejs";
export const maxDuration=60;

import { NextResponse } from "next/server";
import { fetchOfficialTimetable } from "@/lib/official-timetable";

export async function GET(){
 try{
  const result=await fetchOfficialTimetable();
  return NextResponse.json({ok:true,data:result.data,format:result.format},{
   headers:{"Cache-Control":"no-store, max-age=0"}
  });
 }catch(error){
  return NextResponse.json({
   ok:false,
   error:"Could not fetch the official timetable",
   detail:error instanceof Error?error.message:"Unknown error"
  },{status:502,headers:{"Cache-Control":"no-store, max-age=0"}});
 }
}