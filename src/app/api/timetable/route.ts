import { NextResponse } from "next/server";

const URL="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";

export async function GET(){
  try{
    const r=await fetch(URL,{
      cache:"no-store",
      redirect:"follow",
      headers:{
        "Accept":"application/json,text/plain,text/html,*/*",
        "User-Agent":"Student-Calendar/1.0"
      }
    });
    const text=await r.text();
    let data:unknown=null;
    try{data=JSON.parse(text)}catch{}
    return NextResponse.json({ok:r.ok,status:r.status,data,text});
  }catch(error){
    return NextResponse.json({
      ok:false,
      error:"Could not fetch the official timetable",
      detail:error instanceof Error?error.message:"Unknown error"
    },{status:502});
  }
}