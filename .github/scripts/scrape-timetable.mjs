import { chromium } from "playwright";
import fs from "node:fs/promises";

const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:2200}});
 await page.goto(SOURCE,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForTimeout(8000);
 const data=await page.evaluate(()=>{
  const clean=(v)=>String(v??"").replace(/\s+/g," ").trim();
  const score=(headers)=>headers.reduce((n,h)=>n+(/subject|course|code|date|day|time|section|faculty|teacher/i.test(h)?1:0),0);
  const tables=[...document.querySelectorAll("table")].map(table=>{
   const rows=[...table.querySelectorAll("tr")].map(tr=>[...tr.querySelectorAll("th,td")].map(td=>clean(td.innerText)));
   const headerIndex=rows.findIndex(r=>score(r)>=2);
   if(headerIndex<0)return null;
   const headers=rows[headerIndex];
   const body=rows.slice(headerIndex+1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h||`column_${i}`,r[i]||""])));
   return {score:score(headers)+body.length/100,headers,body};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(!tables.length)throw new Error("No timetable table found after the official page finished loading");
  const best=tables[0];
  return {rows:best.body,headers:best.headers,title:document.title};
 });
 if(!data.rows.length)throw new Error("Official timetable page loaded, but the detected timetable contained zero rows");
 await fs.mkdir("data",{recursive:true});
 await fs.writeFile("data/official-timetable.json",JSON.stringify({source:SOURCE,fetchedAt:new Date().toISOString(),...data},null,2));
 console.log(`Saved ${data.rows.length} timetable rows`);
}finally{await browser.close();}
