const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";
const SNAPSHOT="https://raw.githubusercontent.com/AmanSingh071/student-calender/main/data/official-timetable.json";

type Row=Record<string,string>;

async function renderedRows():Promise<Row[]>{
 const [{default:puppeteer},chromiumModule]=await Promise.all([import("puppeteer-core"),import("@sparticuz/chromium")]);
 const chromium:any=(chromiumModule as any).default??chromiumModule;
 const executablePath=await chromium.executablePath();
 const browser=await puppeteer.launch({
  args:chromium.args,
  executablePath,
  headless:true,
  defaultViewport:{width:1440,height:2200}
 });
 try{
  const page=await browser.newPage();
  await page.goto(SOURCE,{waitUntil:"domcontentloaded",timeout:60000});
  await new Promise(resolve=>setTimeout(resolve,6000));
  await new Promise(resolve=>setTimeout(resolve,5000));
  const allCandidates: {score:number,body:Row[]}[]=[];
  for(const frame of page.frames()){
   try{
    const candidates=await frame.evaluate(()=>{
     const clean=(v:any)=>String(v??"").replace(/\s+/g," ").trim();
     const score=(headers:string[])=>headers.reduce((n,h)=>n+(/subject|course|code|date|day|time|section|faculty|teacher/i.test(h)?1:0),0);
     return [...document.querySelectorAll("table")].map(table=>{
      const matrix=[...table.querySelectorAll("tr")].map(tr=>[...tr.querySelectorAll("th,td")].map(td=>clean((td as HTMLElement).innerText)));
      const headerIndex=matrix.findIndex(r=>score(r)>=2);
      if(headerIndex<0)return null;
      const headers=matrix[headerIndex];
      const body=matrix.slice(headerIndex+1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h||"column_"+i,r[i]||""])));
      return {score:score(headers)+body.length/100,body};
     }).filter(Boolean);
    }) as {score:number,body:Row[]}[];
    allCandidates.push(...candidates);
   }catch{}
  }
  allCandidates.sort((a,b)=>b.score-a.score);
  const rows=allCandidates[0]?.body??[];
  if(!rows.length)throw new Error("The official timetable page loaded, but no timetable table was found in any rendered Google Apps Script frame");
  return rows;
 }finally{await browser.close();}
}

export async function fetchOfficialTimetable(){
 try{
  const cached=await fetch(SNAPSHOT,{cache:"no-store"});
  if(cached.ok){
   const text=await cached.text();
   const parsed=JSON.parse(text);
   const rows=Array.isArray(parsed?.rows)?parsed.rows:parsed;
   if(Array.isArray(rows)&&rows.length)return {data:rows,text,format:"snapshot",sourceUrl:SOURCE};
  }
 }catch{}
 const rows=await renderedRows();
 const text=JSON.stringify(rows);
 return {data:rows,text,format:"rendered-browser",sourceUrl:SOURCE};
}
