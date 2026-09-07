export const runtime="nodejs";
export const maxDuration=60;

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";
import { decrypt, getProfile, listProfileIds, saveProfile, SyncEvent } from "@/lib/sync-store";
import { subjects } from "@/lib/subjects";
import { fetchOfficialTimetable } from "@/lib/official-timetable";
import { normalizeOfficialTimetable } from "@/lib/timetable-normalize";

const norm=(v:any)=>String(v??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
function value(r:any,...names:string[]){for(const n of names){const t=norm(n),k=Object.keys(r).find(x=>{const z=norm(x);return z===t||z.includes(t)||t.includes(z)});if(k)return r[k]}}
function rowsFrom(source:any){const out:any[]=[];const walk=(v:any)=>{if(Array.isArray(v))return v.forEach(walk);if(v&&typeof v==="object"){const k=Object.keys(v);if(k.some(x=>/^code$|^subject$|^course$/i.test(x))&&k.some(x=>/date|day|start|time/i.test(x)))out.push(v);Object.values(v).forEach(walk)}};walk(source);return out}
function subjectFor(row:any){const code=String(value(row,"code")||"");const name=String(value(row,"subject","subject name","course","course name")||"");return subjects.find(s=>norm(code)===norm(s.code)||norm(name)===norm(s.name))}
function dateOnly(v:any){const s=String(v||"").trim();if(!s)return null;if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return `${y}-${String(+m[2]).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`}const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10)}
function range(row:any){let a=String(value(row,"start","start time","from","time")||"").trim(),b=String(value(row,"end","end time","to")||"").trim();if(!b){const m=a.match(/^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i);if(m){a=m[1].trim();b=m[2].trim()}}return[a,b]}
function clock(v:string){const m=v.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);if(!m)return null;let h=+m[1],mi=+(m[2]||0),ap=(m[3]||"").toUpperCase();if(ap==="PM"&&h<12)h+=12;if(ap==="AM"&&h===12)h=0;return h<24&&mi<60?[h,mi] as [number,number]:null}
function nextDay(day:string){const map:any={SUNDAY:0,SUN:0,MONDAY:1,MON:1,TUESDAY:2,TUE:2,WEDNESDAY:3,WED:3,THURSDAY:4,THU:4,FRIDAY:5,FRI:5,SATURDAY:6,SAT:6},t=map[norm(day)];if(t===undefined)return null;const d=new Date(Date.now()+330*60000);d.setUTCDate(d.getUTCDate()+(t-d.getUTCDay()+7)%7);return d.toISOString().slice(0,10)}
function iso(date:string,time:string){const c=clock(time);if(!c)return null;const [y,m,d]=date.split("-").map(Number);return new Date(Date.UTC(y,m-1,d,c[0]-5,c[1]-30)).toISOString()}
const CALENDAR_COLOR_IDS=["1","2","3","4","5","6","7","8","9","10","11"];
function colorForSubject(sourceKey:string,summary:string){const subject=(sourceKey.split("|")[0]||summary).trim().toUpperCase();let hash=2166136261;for(let i=0;i<subject.length;i++){hash^=subject.charCodeAt(i);hash=Math.imul(hash,16777619)}return CALENDAR_COLOR_IDS[(hash>>>0)%CALENDAR_COLOR_IDS.length]}
function canonicalKey(e:Pick<SyncEvent,"sourceKey"|"summary"|"start"|"end"|"description">){
 const parts=e.sourceKey.split("|");
 const code=parts[0]||e.summary;
 const section=parts[1]||"";
 return [norm(code),norm(section),e.start,e.end].join("|");
}
function buildEvents(data:any,selected:string[],sections:Record<string,string>){const out:SyncEvent[]=[];for(const row of rowsFrom(data)){const s=subjectFor(row);if(!s||!selected.includes(s.id))continue;const sec=String(value(row,"section")||"").trim().toUpperCase();if(sections[s.id]&&sec&&sections[s.id]!==sec)continue;const rawDate=value(row,"date","class date","event date"),date=dateOnly(rawDate)||nextDay(String(value(row,"day","weekday")||""));if(!date)continue;const [a,b]=range(row);if(!a||!b)continue;const start=iso(date,a),end=iso(date,b);if(!start||!end)continue;const recurrence=dateOnly(rawDate)?undefined:["RRULE:FREQ=WEEKLY"];const teacher=String(value(row,"teacher","faculty","professor")||s.teacher),type=String(value(row,"type","event type")||"Class");const session=String(value(row,"session","class session")||"").trim();const sourceKey=[s.code,sec,start,end,teacher,session,type].join("|");out.push({sourceKey,summary:s.name,description:[s.code,sec?"Section "+sec:"",teacher,type].filter(Boolean).join(" · "),start,end,recurrence})}return out}

async function upsert(profile:any,events:SyncEvent[]){
 const auth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET);auth.setCredentials(JSON.parse(decrypt(profile.token)));
 const cal=google.calendar({version:"v3",auth});
 const prev=new Map<string,SyncEvent>((profile.events as SyncEvent[]).map((e:SyncEvent)=>[e.sourceKey,e]));
 const tagged:any[]=[];let pageToken:string|undefined;
 do{
  const listed=await cal.events.list({calendarId:"primary",privateExtendedProperty:["studentCalendarApp=student-calendar"],showDeleted:false,maxResults:2500,pageToken});
  tagged.push(...(listed.data.items||[]));
  pageToken=listed.data.nextPageToken||undefined;
 }while(pageToken);
 const bySource=new Map<string,any>();const bySignature=new Map<string,any>();
 for(const event of tagged){const p=event.extendedProperties?.private;if(p?.studentCalendarSourceKey)bySource.set(p.studentCalendarSourceKey,event);const sig=[norm((p?.studentCalendarSourceKey||"").split("|")[0]),norm((p?.studentCalendarSourceKey||"").split("|")[1]||""),event.start?.dateTime||event.start?.date||"",event.end?.dateTime||event.end?.date||""].join("|");if(sig)bySignature.set(sig,event)}
 const next:SyncEvent[]=[];const keepIds=new Set<string>();
 for(const e of events){
  const body={summary:e.summary,colorId:colorForSubject(e.sourceKey,e.summary),description:e.description,start:{dateTime:e.start},end:{dateTime:e.end},extendedProperties:{private:{studentCalendarSourceKey:e.sourceKey,studentCalendarApp:"student-calendar"}},...(e.recurrence?.length?{recurrence:e.recurrence}:{})};
  const old=prev.get(e.sourceKey)||bySource.get(e.sourceKey)||bySignature.get(canonicalKey(e));
  let id=old?.eventId||old?.id;
  if(id)await cal.events.update({calendarId:"primary",eventId:id,requestBody:body});
  else{id=(await cal.events.insert({calendarId:"primary",requestBody:body})).data.id||undefined}
  if(id)keepIds.add(id);next.push({...e,eventId:id});
 }
 // Only reconcile after the complete new timetable was successfully built and upserted.
 // Every remaining Student Calendar-tagged event is obsolete and can be removed safely.
 for(const event of tagged){if(event.id&&!keepIds.has(event.id)){try{await cal.events.delete({calendarId:"primary",eventId:event.id})}catch(err:any){if(err?.code!==404)throw err}}}
 profile.events=next;
}

export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;if(secret&&req.headers.get("authorization")!=="Bearer "+secret)return NextResponse.json({ok:false},{status:401});try{const source=await fetchOfficialTimetable();const data:any=normalizeOfficialTimetable(source.data);const hash=crypto.createHash("sha256").update(source.text).digest("hex"),ids=await listProfileIds();let synced=0,skipped=0,failed=0;for(const id of ids){const p=await getProfile(id);if(!p?.enabled)continue;try{const events=data?buildEvents(data,p.selected,p.sections):[];if(events.length){await upsert(p,events);p.sourceHash=hash;p.lastError=undefined;synced++}else{p.lastError="The official timetable was reached, but no usable class rows matched your selected subjects. Existing calendar events were left untouched.";skipped++}p.lastSyncAt=new Date().toISOString();await saveProfile(p)}catch(e){p.lastError=e instanceof Error?e.message:"Sync failed";p.lastSyncAt=new Date().toISOString();await saveProfile(p);failed++}}return NextResponse.json({ok:true,synced,skipped,failed})}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Cron sync failed"},{status:500})}}