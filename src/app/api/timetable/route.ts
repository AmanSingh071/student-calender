import { NextResponse } from "next/server";

const URL="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";

export async function GET(){
  try{
    const r=await fetch(URL,{
      cache:"no-store",
      redirect:"follow",
      headers:{
        "Accept":"application/json,text/plain,*/*",
        "User-Agent":"Student-Calendar/1.0"
      }
    });
    const text=await r.text();
    if(!r.ok) throw new Error(`Official timetable returned HTTP ${r.status}`);
    let data:unknown;
    try{data=JSON.parse(text)}catch{throw new Error("Official timetable did not return valid JSON");}
    return NextResponse.json({ok:true,data},{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(error){
    return NextResponse.json({
      ok:false,
      error:"Could not fetch the official timetable",
      detail:error instanceof Error?error.message:"Unknown error"
    },{status:502,headers:{"Cache-Control":"no-store, max-age=0"}});
  }
}