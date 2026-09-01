export const runtime="nodejs";
export const maxDuration=60;

import { NextResponse } from "next/server";
import { fetchOfficialTimetable } from "@/lib/official-timetable";

type Raw=Record<string,unknown>;
const aliases:Record<string,string>={
 "M&A":"MA","MA":"MA","FAMDM":"FAMD","PERF":"PERM","AABI":"AIBI","PAFG":"PFA","PROM":"PMS","PROJ":"PJM"
};

function value(row:Raw,name:string){
 const key=Object.keys(row).find(k=>k.toLowerCase().replace(/[^a-z0-9]/g,"").includes(name));
 return key?String(row[key]??"").trim():"";
}
function isoDate(v:string){
 const m=v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
 if(m){const months=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];const i=months.indexOf(m[2].toUpperCase());if(i>=0)return `${m[3]}-${String(i+1).padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
 const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);
}
function normalizeRows(input:unknown){
 const rows=Array.isArray(input)?input:[];
 let date="",day="",time="";
 const out:Record<string,string>[]=[];
 for(const raw of rows as Raw[]){
  const nextDate=value(raw,"date");if(nextDate)date=isoDate(nextDate)||date;
  const nextDay=value(raw,"day");if(nextDay)day=nextDay;
  const nextTime=value(raw,"timings");if(nextTime)time=nextTime;
  const section=value(raw,"section").toUpperCase();
  const combined=value(raw,"coursesectionsessionfacultyclassroom");
  if(!combined||!date||!time)continue;
  const first=combined.match(/^([A-Za-z0-9&-]+)(?:\s+([AB]))?\s+(\d+)(?:\s+(.+))?$/i);
  if(!first)continue;
  const rawCode=first[1].toUpperCase();
  const code=aliases[rawCode]||rawCode;
  const embeddedSection=(first[2]||"").toUpperCase();
  const details=(first[4]||"").trim();
  out.push({
   date,day,time,start:time.split(/\s*(?:-|–|—|to)\s*/i)[0]||"",
   end:time.split(/\s*(?:-|–|—|to)\s*/i)[1]||"",
   code,section:section||embeddedSection,
   session:first[3],teacher:details,
   raw:combined
  });
 }
 return out;
}

export async function GET(){
 try{
  const result=await fetchOfficialTimetable();
  const data=normalizeRows(result.data);
  return NextResponse.json({ok:true,data,format:"normalized-official-timetable",sourceFormat:result.format},{
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