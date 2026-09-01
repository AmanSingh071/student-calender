import { NextResponse } from "next/server";
const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";
export async function GET(){
 const r=await fetch(SOURCE,{cache:"no-store",redirect:"follow",headers:{"Accept":"text/html,*/*","User-Agent":"Student-Calendar/1.0"}});
 const text=await r.text();
 const hits:string[]=[]; let from=0;
 while(true){const i=text.indexOf("getSheetData",from);if(i<0)break;hits.push(text.slice(Math.max(0,i-500),i+1000));from=i+1;if(hits.length>=10)break;}
 return NextResponse.json({status:r.status,url:r.url,contentType:r.headers.get("content-type"),hits});
}