"use client";

import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,GraduationCap,Loader2,LogOut,RefreshCw,RotateCcw,Sparkles} from "lucide-react";
import {subjects,normalize} from "@/lib/subjects";

type Match={day?:string;start:string;end:string;code:string;section?:string;teacher:string;subject:string;recurrence?:string[]};
type SyncState={mode:"connecting"|"importing"|"reverting";startedAt:number;current:number;total:number};

async function readApiResponse(response:Response){
 const raw=await response.text();
 try{return raw?JSON.parse(raw):{}}
 catch{
  const message=response.ok?"The server returned an empty response.":"The calendar server returned an error before it could send a valid response. Please try again.";
  throw new Error(message);
 }
}

export default function Home(){
 const [selected,setSelected]=useState<string[]>([]);
 const [sections,setSections]=useState<Record<string,string>>({});
 const [matches,setMatches]=useState<Match[]>([]);
 const [notice,setNotice]=useState("");
 const [googleConnected,setGoogleConnected]=useState(false);
 const [googleAccount,setGoogleAccount]=useState<{name:string;email:string;picture?:string}|null>(null);
 const [checkingGoogle,setCheckingGoogle]=useState(true);
 const [sync,setSync]=useState<SyncState|null>(null);

 useEffect(()=>{
  fetch("/api/auth/status").then(r=>r.json()).then(x=>{setGoogleConnected(Boolean(x.connected));setGoogleAccount(x.account||null)}).catch(()=>{}).finally(()=>setCheckingGoogle(false));
  const p=new URLSearchParams(location.search).get("google");
  if(p==="connected")setNotice("Google Calendar connected. Now choose your subjects and import.");
  if(p==="error")setNotice("Google connection was cancelled or rejected. Please try again.");
  if(p==="state-error")setNotice("Google sign-in session expired or returned to a different website address. Please start the connection again.");
  if(p==="callback-error")setNotice("Google accepted the sign-in, but the app could not save the connection. Please try again.");
 },[]);

 const chosen=useMemo(()=>subjects.filter(s=>selected.includes(s.id)),[selected]);
 const availableSections=(id:string)=>subjects.find(s=>s.id===id)?.sections||[];
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 function connectGoogle(){setSync({mode:"connecting",startedAt:Date.now(),current:0,total:0});location.href="https://student-calendar-beta.vercel.app/api/google/connect"}
 async function logout(){if(!confirm("Log out from this Google Calendar connection? Your calendar events will not be deleted."))return;await fetch("/api/auth/logout",{method:"POST"});location.href="/";}

 async function revertCalendar(){
  if(!confirm("Revert your timetable changes? This will remove only the events created by Student Calendar, clear your saved subject and section choices, and turn off automatic sync. Your personal Google Calendar events will not be touched."))return;
  setNotice("");setSync({mode:"reverting",startedAt:Date.now(),current:0,total:0});
  try{
   let removedTotal=0;
   let rounds=0;
   while(true){
    rounds++;
    if(rounds>1000)throw new Error("The revert process took too many batches. Please try again.");
    const r=await fetch("/api/calendar/revert",{method:"POST"});
    const x=await readApiResponse(r);
    if(!r.ok)throw new Error(x.error||"Could not revert the timetable changes");
    removedTotal+=Number(x.removed||0);
    setSync({mode:"reverting",startedAt:Date.now(),current:removedTotal,total:0});
    if(x.done||!x.remaining)break;
   }
   setSelected([]);
   setSections({});
   setMatches([]);
   setNotice(removedTotal>0?removedTotal+" Student Calendar event(s) were removed. Automatic sync was turned off and your timetable setup was reset.":"No Student Calendar events were found. Your timetable setup was reset.");
  }catch(e:any){
   setNotice(e.message||"Could not revert the timetable changes");
  }finally{
   setTimeout(()=>setSync(null),700);
  }
 }

 async function importCalendar(){
  if(!googleConnected){connectGoogle();return}
  if(!selected.length){setNotice("Choose at least one subject before importing.");return}
  const missing=chosen.filter(s=>availableSections(s.id).length&&!sections[s.id]);
  if(missing.length){setNotice("Choose your section for: "+missing.map(s=>s.code).join(", "));return}
  setNotice("");setSync({mode:"importing",startedAt:Date.now(),current:0,total:0});
  try{
   // Repair earlier bad imports first. Only events created and tracked by this app are removed.
   while(true){
    const cleanRes=await fetch("/api/calendar/revert",{method:"POST"});
    const clean=await readApiResponse(cleanRes);
    if(!cleanRes.ok)throw new Error(clean.error||"Could not remove the previous Student Calendar timetable");
    if(!clean.remaining)break;
   }
   const [prefRes,timeRes]=await Promise.all([
    fetch("/api/sync/configure",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({selected,sections})}),
    fetch("/api/timetable",{cache:"no-store"})
   ]);
   const pref=await readApiResponse(prefRes);if(!prefRes.ok)throw new Error(pref.error||"Could not save your subject choices");
   const time=await readApiResponse(timeRes);if(!time.ok)throw new Error(time.error||"Could not read the official timetable");
   const found=buildMatches(time.data??time.text,selected,sections);
   if(!found.length)throw new Error("No dated timetable events were found for your selected subjects. Your choices were saved, but nothing was imported.");
   setMatches(found);setSync({mode:"importing",startedAt:Date.now(),current:0,total:found.length});
   const events=found.map(m=>({summary:m.subject,description:[m.code,m.section?"Section "+m.section:"",m.teacher].filter(Boolean).join(" · "),sourceKey:[m.code,m.section||"",m.start,m.end,m.teacher,(m.recurrence||[]).join(",")].join("|"),start:m.start,end:m.end,recurrence:m.recurrence}));
   // Import in small batches so a large timetable cannot hit a single Vercel request timeout.
   const batchSize=10;
   let completed=0;
   let created=0;
   for(let i=0;i<events.length;i+=batchSize){
    const batch=events.slice(i,i+batchSize);
    const r=await fetch("/api/calendar/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:batch,replaceCodes:i===0?chosen.map(s=>s.code):undefined,allSourceKeys:i===0?events.map(e=>e.sourceKey):undefined})});
    const x=await readApiResponse(r);
    if(!r.ok)throw new Error(x.error||"Calendar import failed");
    created+=Number(x.created||0);
    completed+=batch.length;
    setSync({mode:"importing",startedAt:Date.now(),current:completed,total:found.length});
   }
   setNotice(created+" class/event(s) imported to Google Calendar. Automatic sync is enabled for future official timetable changes.");
  }catch(e:any){setNotice(e.message||"Calendar import failed")}
  finally{setTimeout(()=>setSync(null),700)}
 }

 if(checkingGoogle)return <main className="boot"><Loader2 className="spin" size={28}/><strong>Checking your Google Calendar connection…</strong></main>;
 if(!googleConnected)return <main className="connectPage"><section className="connectCard"><div className="connectIcon"><CalendarDays size={34}/></div><div className="eyebrow"><Sparkles size={15}/> TERM V SETUP</div><h1>Start by connecting<br/><span>your Google Calendar.</span></h1><p>Connect once, choose your subjects, and import your classes.</p><button className="primary connectPrimary" onClick={connectGoogle}><CalendarDays size={19}/> Continue with Google</button></section>{notice&&<div className="connectNotice">{notice}</div>}</main>;

 return <main>
  {sync&&<div className="syncOverlay"><div className="syncCard"><Loader2 className="spin" size={34}/><div className="syncLabel">{sync.mode==="importing"?"IMPORTING TO GOOGLE CALENDAR":sync.mode==="reverting"?"REVERTING CALENDAR CHANGES":"CONNECTING GOOGLE"}</div><h2>{sync.mode==="importing"?sync.total>0?`Importing ${sync.current} of ${sync.total} classes…`:"Reading your timetable…":sync.mode==="reverting"?"Removing Student Calendar events and restoring your setup…":"Opening secure Google sign-in…"}</h2>{sync.mode==="importing"&&sync.total>0&&<p>{sync.current} of {sync.total} events completed</p>}{sync.mode==="reverting"&&<p>{sync.current>0?sync.current+" event(s) removed so far…":"Finding Student Calendar events to remove…"}</p>}</div></div>}
  <header className="topbar"><div className="wrap nav"><div className="brand"><span className="brandIcon"><GraduationCap size={23}/></span><span><b>Student Calendar</b><small>Google Calendar connected</small></span></div><div className="accountMenu">{googleAccount?.picture?<img src={googleAccount.picture} alt="" className="accountAvatar"/>:<span className="accountAvatar fallback">{(googleAccount?.name||googleAccount?.email||"G").trim().charAt(0).toUpperCase()}</span>}<div className="accountText"><b>{googleAccount?.name||"Google account"}</b><small>{googleAccount?.email||"Google Calendar connected"}</small></div><button className="logoutBtn" onClick={logout}><LogOut size={16}/> Logout</button></div></div></header>
  <section className="wrap hero"><div className="eyebrow"><Sparkles size={15}/> PERSONAL TERM V SCHEDULE</div><h1>Your subjects.<br/><span>Your calendar.</span></h1><p>Select the subjects you registered for. Sections appear directly below a subject only when that subject has multiple sections.</p></section>
  <section className="wrap grid single"><div className="panel"><div className="panelHead"><div><h2>Choose your subjects</h2><p>{selected.length} selected from Term V</p></div><button className="linkBtn" onClick={()=>setSelected(selected.length===subjects.length?[]:subjects.map(s=>s.id))}>{selected.length===subjects.length?"Clear all":"Select all"}</button></div>
   <div className="subjectGrid">{subjects.map(s=>{const on=selected.includes(s.id),opts=availableSections(s.id);return <div key={s.id} className={"subjectCard "+(on?"active":"")}><button type="button" className="subjectMain" onClick={()=>toggle(s.id)}><span className="tick">{on?<Check size={16}/>:null}</span><strong>{s.name}</strong><small>{s.teacher||"Faculty not applicable"}</small><em>{s.department} · {s.code}</em></button>{on&&opts.length>0&&<div className="inlineSection"><div className="inlineSectionHead"><span>Choose your section</span><small>Required for this subject</small></div><div className="sectionOptions inlineOptions">{opts.map(x=><button type="button" key={x} className={sections[s.id]===x?"sectionChoice selected":"sectionChoice"} onClick={()=>setSections(v=>({...v,[s.id]:x}))}>Section {x}</button>)}</div></div>}</div>})}</div>
  </div></section>
  {notice&&<section className="wrap"><div className="notice"><Check size={18}/>{notice}</div></section>}
  {matches.length>0&&<section className="wrap panel preview"><div className="panelHead"><div><h2>Imported timetable</h2><p>{matches.length} events matched from the official source.</p></div></div>{matches.slice(0,20).map((m,i)=><div className="match" key={i}><div className="dateBox"><CalendarDays size={20}/></div><div><strong>{m.subject}</strong><p>{m.code}{m.section?" · Section "+m.section:""} · {m.teacher}</p></div></div>)}</section>}
  <section className="wrap panel finalImport"><div className="sideTitle"><span className="stepNo">2</span><div><h2>Import to Google Calendar</h2><p>We automatically fetch the latest official timetable when you import.</p></div></div><div className="syncPromise"><RefreshCw size={18}/><div><strong>Always uses the latest college timetable</strong><span>Your selected subjects and sections are matched automatically. Future changes can be synced to your calendar.</span></div></div><div className="importActions"><button className="primary importBtn" onClick={importCalendar} disabled={!selected.length}><CalendarDays size={18}/> Import & enable automatic sync</button><button className="revertBtn" onClick={revertCalendar}><RotateCcw size={17}/> Revert all timetable changes</button></div></section>
 </main>
}

function norm(v:any){return String(v??"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
function field(row:any,...names:string[]){for(const n of names){const target=norm(n);const k=Object.keys(row).find(x=>{const key=norm(x);return key===target||key.includes(target)||target.includes(key)});if(k)return row[k]}return undefined}
function rowsFrom(source:any){const out:any[]=[];const walk=(v:any)=>{if(Array.isArray(v))return v.forEach(walk);if(v&&typeof v==="object"){const keys=Object.keys(v);const hasSubject=keys.some(k=>/code|subject|course/i.test(k));const hasSchedule=keys.some(k=>/date|day|start|time/i.test(k));if(hasSubject&&hasSchedule)out.push(v);Object.values(v).forEach(walk)}};if(typeof source==="string"){try{walk(JSON.parse(source))}catch{}}else walk(source);return out}
function subjectFor(row:any){
 const code=String(field(row,"code","subject code","course code")||"").trim();
 const name=String(field(row,"subject","subject name","course","course name")||"").trim();
 const nCode=norm(code),nName=norm(name);
 return subjects.find(s=>{
  const sCode=norm(s.code),sName=norm(s.name);
  if(nCode&&nCode===sCode)return true;
  if(nName&&nName===sName)return true;
  // Never compare against an empty name: every string contains "" and that
  // previously made every timetable row match the first subject (AA-I).
  if(nName&&sName&&nName.length>=4&&(nName.includes(sName)||sName.includes(nName)))return true;
  return false;
 });
}
function parseTimeRange(row:any){let start=String(field(row,"start","start time","from","time")||"").trim(),end=String(field(row,"end","end time","to")||"").trim();if(!end&&start){const m=start.match(/^\s*(.+?)\s*(?:-|–|—|to)\s*(.+?)\s*$/i);if(m){start=m[1].trim();end=m[2].trim()}}return {start,end}}
function dateOnly(v:any){const s=String(v||"").trim();if(!s)return null;if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`}const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10)}
function parseClock(v:string){const s=v.trim().replace(/\./g,":").replace(/\s+/g," ");const m=s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);if(!m)return null;let h=Number(m[1]),min=Number(m[2]||0),ap=(m[3]||"").toUpperCase();if(ap==="PM"&&h<12)h+=12;if(ap==="AM"&&h===12)h=0;if(h>23||min>59)return null;return {h,min}}
function isoOn(date:string,time:string){const c=parseClock(time);if(!c)return null;const [y,m,d]=date.split("-").map(Number);return new Date(Date.UTC(y,m-1,d,c.h-5,c.min-30)).toISOString()}
function nextDayDate(day:string){const names:{[k:string]:number}={SUNDAY:0,SUN:0,MONDAY:1,MON:1,TUESDAY:2,TUE:2,TUES:2,WEDNESDAY:3,WED:3,THURSDAY:4,THU:4,THURS:4,FRIDAY:5,FRI:5,SATURDAY:6,SAT:6};const target=names[norm(day)];if(target===undefined)return null;const now=new Date();const local=new Date(now.getTime()+330*60000);const delta=(target-local.getUTCDay()+7)%7;local.setUTCDate(local.getUTCDate()+delta);return local.toISOString().slice(0,10)}
function buildMatches(source:any,selected:string[],sections:Record<string,string>){const out:Match[]=[];for(const row of rowsFrom(source)){const s=subjectFor(row);if(!s||!selected.includes(s.id))continue;const sec=String(field(row,"section")||"").trim().toUpperCase();if(sections[s.id]&&sec&&sections[s.id]!==sec)continue;const times=parseTimeRange(row);if(!times.start||!times.end)continue;const rawDate=field(row,"date","class date","event date");const day=String(field(row,"day","weekday")||"").trim();const date=dateOnly(rawDate)||nextDayDate(day);if(!date)continue;const start=isoOn(date,times.start),end=isoOn(date,times.end);if(!start||!end)continue;out.push({day,start,end,code:s.code,section:sec||undefined,teacher:String(field(row,"teacher","faculty","professor")||s.teacher),subject:s.name,recurrence:dateOnly(rawDate)?undefined:["RRULE:FREQ=WEEKLY"]});}return out}
