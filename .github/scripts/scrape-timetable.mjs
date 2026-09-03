import { chromium } from "playwright";
import fs from "node:fs/promises";

const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";
const RETRIES=4;
const browser=await chromium.launch({headless:true});

const clean=(v)=>String(v??"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const useful=(v)=>clean(v).length>0;
const headerScore=(headers)=>headers.reduce((n,h)=>n+(/subject|course|code|date|day|time|section|faculty|teacher|room|venue/i.test(h)?1:0),0);

function parseRows(rows){
  const normalized=rows.map(r=>r.map(clean)).filter(r=>r.some(useful));
  if(!normalized.length)return null;
  let best=null;
  for(let hi=0;hi<Math.min(normalized.length,12);hi++){
    const headers=normalized[hi];
    const score=headerScore(headers);
    if(score<2)continue;
    const body=normalized.slice(hi+1).filter(r=>r.some(useful)).map(r=>Object.fromEntries(headers.map((h,i)=>[h||`column_${i}`,r[i]||""])));
    if(body.length && (!best || score+body.length/100>best.score))best={score:score+body.length/100,headers,body};
  }
  return best;
}

async function scrapeOnce(attempt){
  const context=await browser.newContext({
    viewport:{width:1440,height:2600},
    userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    locale:"en-US",
  });
  const page=await context.newPage();
  try{
    console.log(`Attempt ${attempt}/${RETRIES}: opening official timetable`);
    const response=await page.goto(SOURCE,{waitUntil:"domcontentloaded",timeout:90000});
    console.log(`HTTP ${response?.status()??"unknown"} final URL ${page.url()}`);

    // Some Apps Script deployments render asynchronously. Give the page time to
    // settle, then wait for either a table or meaningful timetable text.
    await page.waitForLoadState("networkidle",{timeout:30000}).catch(()=>{});
    await page.waitForTimeout(5000);

    const result=await page.evaluate(()=>{
      const clean=(v)=>String(v??"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
      const score=(headers)=>headers.reduce((n,h)=>n+(/subject|course|code|date|day|time|section|faculty|teacher|room|venue/i.test(h)?1:0),0);
      const tables=[...document.querySelectorAll("table")].map(table=>{
        const rows=[...table.querySelectorAll("tr")].map(tr=>[...tr.querySelectorAll("th,td")].map(td=>clean(td.innerText)));
        let best=null;
        for(let hi=0;hi<Math.min(rows.length,12);hi++){
          const headers=rows[hi]; const sc=score(headers);
          if(sc<2)continue;
          const body=rows.slice(hi+1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h||`column_${i}`,r[i]||""])));
          if(body.length && (!best||sc+body.length/100>best.score))best={score:sc+body.length/100,headers,body};
        }
        return best;
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
      const text=clean(document.body?.innerText||"");
      return {table:tables[0]||null,text,title:document.title,url:location.href,htmlLength:document.documentElement?.outerHTML?.length||0};
    });

    if(result.table?.body?.length){
      return {rows:result.table.body,headers:result.table.headers,title:result.title};
    }

    // Fallback: parse common non-table grid/list markup from the rendered page.
    const fallbackRows=await page.locator("[role='row']").evaluateAll(nodes=>nodes.map(row=>[...row.querySelectorAll("[role='cell'],[role='gridcell'],[role='columnheader']")].map(x=>x.innerText)));
    const parsed=parseRows(fallbackRows);
    if(parsed?.body?.length)return {rows:parsed.body,headers:parsed.headers,title:result.title};

    throw new Error(`No timetable structure found (HTTP ${result.url===SOURCE?"200/unknown":"redirected"}; page text ${result.text.length} chars; HTML ${result.htmlLength} chars)`);
  }finally{await context.close();}
}

let data=null;
let lastError=null;
for(let attempt=1;attempt<=RETRIES;attempt++){
  try{
    data=await scrapeOnce(attempt);
    if(data?.rows?.length)break;
  }catch(error){
    lastError=error;
    console.error(`Attempt ${attempt} failed: ${error?.stack||error}`);
    if(attempt<RETRIES)await new Promise(r=>setTimeout(r,5000*attempt));
  }
}

try{
  if(!data?.rows?.length)throw lastError||new Error("Official timetable returned no rows");
  await fs.mkdir("data",{recursive:true});
  const snapshot={source:SOURCE,fetchedAt:new Date().toISOString(),rowCount:data.rows.length,headers:data.headers,rows:data.rows,title:data.title};
  // Only write after validation. A failed/empty scrape can therefore never
  // destroy the last known-good timetable snapshot.
  const subjectLike=data.headers.some(h=>/subject|course|code/i.test(h));
  if(!subjectLike)throw new Error(`Scrape validation failed: no Subject/Course/Code column found. Headers: ${data.headers.join(" | ")}`);
  await fs.writeFile("data/official-timetable.json",JSON.stringify(snapshot,null,2));
  console.log(`SUCCESS: saved ${data.rows.length} timetable rows`);
}catch(error){
  console.error(`FATAL timetable sync failure: ${error?.stack||error}`);
  process.exitCode=1;
}finally{
  await browser.close();
}
