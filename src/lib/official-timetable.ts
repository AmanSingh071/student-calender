const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";

function decodeHtml(value:string){
 return value
  .replace(/<br\s*\/?>(\r?\n)?/gi," ")
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<")
  .replace(/&gt;/gi,">")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))
  .replace(/\s+/g," ").trim();
}
function cleanCell(value:string){
 return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," "));
}
function key(value:string){
 return value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function parseHtmlTables(html:string):Record<string,string>[]{
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
 const all:Record<string,string>[]=[];
 for(const table of tables){
  const trs=[...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const matrix=trs.map(tr=>[...tr[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(c=>cleanCell(c[2]))).filter(r=>r.length);
  if(matrix.length<2)continue;
  let headerIndex=matrix.findIndex(r=>r.some(c=>/(subject|course|code|date|day|time|section)/i.test(c)));
  if(headerIndex<0)headerIndex=0;
  const headers=matrix[headerIndex].map((h,i)=>cleanCell(h)||"column_"+i);
  for(const row of matrix.slice(headerIndex+1)){
   if(!row.some(Boolean))continue;
   const obj:Record<string,string>={};
   headers.forEach((h,i)=>{obj[h]=row[i]??""});
   all.push(obj);
  }
 }
 return all;
}
function parsePayload(text:string):unknown{
 const trimmed=text.trim();
 try{return JSON.parse(trimmed)}catch{}
 const pre=trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
 if(pre){
  const candidate=decodeHtml(pre[1]).trim();
  try{return JSON.parse(candidate)}catch{}
 }
 const rows=parseHtmlTables(trimmed);
 if(rows.length)return rows;
 if(/functionNames|google\\.script\\.run|sandboxFrame|userHtml/.test(trimmed)&&/getSheetData/.test(trimmed))throw new Error("The official timetable URL is an interactive Google Apps Script page, not a data API. It exposes the rows only through its getSheetData browser RPC, so a server cannot reliably read the timetable from this URL alone.");\n throw new Error("Official timetable response could not be parsed as JSON or an HTML timetable table");
}
export async function fetchOfficialTimetable(){
 const response=await fetch(SOURCE,{
  cache:"no-store",
  redirect:"follow",
  headers:{"Accept":"application/json,text/html,text/plain,*/*","User-Agent":"Student-Calendar/1.0"}
 });
 const text=await response.text();
 if(!response.ok)throw new Error(`Official timetable returned HTTP ${response.status}`);
 const data=parsePayload(text);
 return {data,text,format:text.trim().startsWith("<")?"html":"json",sourceUrl:SOURCE};
}
