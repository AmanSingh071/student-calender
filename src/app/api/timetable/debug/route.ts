import { NextResponse } from "next/server";

const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";

export async function GET(){
 const r=await fetch(SOURCE,{cache:"no-store",redirect:"follow",headers:{"Accept":"application/json,text/html,text/plain,*/*","User-Agent":"Student-Calendar/1.0"}});
 const text=await r.text();
 return NextResponse.json({status:r.status,url:r.url,contentType:r.headers.get("content-type"),preview:text.slice(0,8000)});
}