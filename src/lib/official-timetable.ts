const SOURCE="https://script.google.com/macros/s/AKfycbyALiIAKX30Vrwqb6fOvxXR5i66vnfe4-DCfhnEAY_g59FX_OyaobPYkSwZ2sRwX62fAQ/exec";
const SNAPSHOT="https://raw.githubusercontent.com/AmanSingh071/student-calender/main/data/official-timetable.json";

function decodeHtml(value:string){
 return value.replace(/<br\s*\/?>(\r?\n)?/gi," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/\s+/g," ").trim();
}
function cleanCell(value:string){return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," "));}
function parseHtmlTables(html:string):Record<string,string>[]{
 const all:Record<string,string>[]=[];
 for(const table of [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]){
  const matrix=[...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(tr=>[...tr[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(c=>cleanCell(c[2]))).filter(r=>r.length);
  if(matrix.length<2)continue;
  let headerIndex=matrix.findIndex(r=>r.some(c=>/(subject|course|code|date|day|time|section)/i.test(c)));if(headerIndex<0)headerIndex=0;
  const headers=matrix[headerIndex].map((h,i)=>cleanCell(h)||"column_"+i);
  for(const row of matrix.slice(headerIndex+1)){if(!row.some(Boolean))continue;const obj:Record<string,string>={};headers.forEach((h,i)=>obj[h]=row[i]??"");all.push(obj);}
 }
 return all;
}
function parsePayload(text:string):unknown{
 try{return JSON.parse(text.trim())}catch{}
 const pre=text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);if(pre){try{return JSON.parse(decodeHtml(pre[1]).trim())}catch{}}
 const rows=parseHtmlTables(text);if(rows.length)return rows;
 throw new Error("Official timetable response could not be parsed");
}
export async function fetchOfficialTimetable(){
 try{
  const cached=await fetch(SNAPSHOT,{cache:"no-store",headers:{"Accept":"application/json","User-Agent":"Student-Calendar/1.0"}});
  if(cached.ok){
   const text=await cached.text();
   const parsed=JSON.parse(text);
   const rows=Array.isArray(parsed?.rows)?parsed.rows:parsed;
   if(Array.isArray(rows)&&rows.length)return {data:rows,text,format:"rendered-snapshot",sourceUrl:SOURCE};
  }
 }catch{}
 const response=await fetch(SOURCE,{cache:"no-store",redirect:"follow",headers:{"Accept":"application/json,text/html,text/plain,*/*","User-Agent":"Student-Calendar/1.0"}});
 const text=await response.text();if(!response.ok)throw new Error(`Official timetable returned HTTP ${response.status}`);
 return {data:parsePayload(text),text,format:text.trim().startsWith("<")?"html":"json",sourceUrl:SOURCE};
}
