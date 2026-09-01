export const runtime="nodejs";
export const maxDuration=60;
import { NextResponse } from "next/server";
import { fetchOfficialTimetable } from "@/lib/official-timetable";
import { normalizeOfficialTimetable } from "@/lib/timetable-normalize";

export async function GET(){
 try{
  const result=await fetchOfficialTimetable();
  const data=normalizeOfficialTimetable(result.data);
  return NextResponse.json({ok:true,data,format:"normalized-official-timetable",sourceFormat:result.format},{headers:{"Cache-Control":"no-store, max-age=0"}});
 }catch(error){
  return NextResponse.json({ok:false,error:"Could not fetch the official timetable",detail:error instanceof Error?error.message:"Unknown error"},{status:502,headers:{"Cache-Control":"no-store, max-age=0"}});
 }
}