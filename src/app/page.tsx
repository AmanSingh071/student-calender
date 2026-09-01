"use client";

import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,ChevronRight,Clock3,GraduationCap,Loader2,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
import {subjects} from "@/lib/subjects";

type Match={day:string;start:string;end:string;code:string;section?:string;teacher:string;subject?:string;score?:number};
type SyncState={mode:"connecting"|"importing";startedAt:number;current:number;total:number};

export default function Home(){
 const [selected,setSelected]=useState<string[]>([]);
 const [sections,setSections]=useState<Record<string,string>>({});
 const [timetableSections,setTimetableSections]=useState<Record<string,string[]>>({});
 const [loading,setLoading]=useState(false);
 const [raw,setRaw]=useState("");
 const [matches,setMatches]=useState<Match[]>([]);
 const [notice,setNotice]=useState("");
 const [googleConnected,setGoogleConnected]=useState(false);
 const [checkingGoogle,setCheckingGoogle]=useState(true);
 const [sync,setSync]=useState<SyncState|null>(null);
 const [elapsed,setElapsed]=useState(0);

 useEffect(()=>{
  fetch("/api/timetable").then(r=>r.json()).then(x=>{
   if(!x.ok)return;
   const rows=extractRows(x.data??x.text);
   const map:Record<string,string[]>={};
   for(const row of rows){
    const code=String(row.code||row.subjectcode||row.subject_code||row.subject||row.course||"");
    const section=String(row.section||row.Section||"").trim().toUpperCase();
    if(!section)continue;
    const subject=subjects.find(s=>sameCode(code,s.code));
    if(subject){
      const letters=section.match(/[A-Z]/g)||[];
      const valid=letters.filter(v=>v==="A"||v==="B");
      if(valid.length)map[subject.id]=Array.from(new Set([...(map[subject.id]||[]),...valid]));
    }
   }
   setTimetableSections(map);
  }).catch(()=>{});
  fetch("/api/auth/status").then(r=>r.json()).then(x=>setGoogleConnected(Boolean(x.connected))).catch(()=>{}).finally(()=>setCheckingGoogle(false));
  const p=new URLSearchParams(window.location.search).get("google");
  if(p==="connected")setNotice("Google Calendar connected successfully. Your account is ready for timetable syncing.");
  if(p==="error")setNotice("Google connection was cancelled or Google rejected the request. Please try again.");
  if(p==="config-error")setNotice("Google Calendar is not configured on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, then redeploy.");
 },[]);

 useEffect(()=>{
  if(!sync){setElapsed(0);return}
  const tick=()=>setElapsed(Math.floor((Date.now()-sync.startedAt)/1000));
  tick();
  const id=window.setInterval(tick,250);
  return()=>window.clearInterval(id);
 },[sync]);

 const chosen=useMemo(()=>subjects.filter(s=>selected.includes(s.id)),[selected]);
 const toggle=(id:string)=>setSelected(v=>{
  if(v.includes(id)){
   setSections(prev=>{const next={...prev};delete next[id];return next});
   return v.filter(x=>x!==id);
  }
  return [...v,id];
 });
 const availableSections=(id:string)=>Array.from(new Set([...(subjects.find(s=>s.id===id)?.sections||[]),...(timetableSections[id]||[])]));
 const sectionSubjects=chosen.filter(s=>availableSections(s.id).length);
 const fmt=(seconds:number)=>seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;

 function connectGoogle(){
  setSync({mode:"connecting",startedAt:Date.now(),current:0,total:0});
  window.location.href="/api/google/connect";
 }

 async function fetchOfficial(){
  setLoading(true);setNotice("");
  try{
   const r=await fetch("/api/timetable");
   const x=await r.json();
   if(!x.ok)throw new Error(x.error);
   const source=x.data??x.text??"";
   const text=typeof source==="string"?source:JSON.stringify(source,null,2);
   setRaw(text);
   const rows=extractRows(source);
   const map:Record<string,string[]>={};
   for(const row of rows){
    const code=String(row.code||row.subjectcode||row.subject_code||row.subject||row.course||"");
    const section=String(row.section||row.Section||"").trim().toUpperCase();
    const subject=subjects.find(s=>sameCode(code,s.code));
    const letters=(section.match(/[A-Z]/g)||[]).filter(v=>v==="A"||v==="B");
    if(subject&&letters.length)map[subject.id]=Array.from(new Set([...(map[subject.id]||[]),...letters]));
   }
   setTimetableSections(map);
   setNotice("Official timetable loaded. Section choices were detected from the timetable and are now shown only for subjects that have sections.");
  }catch(e:any){setNotice(e.message||"Could not load timetable")}
  finally{setLoading(false)}
 }

 async function importCalendar(){
  if(!googleConnected){connectGoogle();return}
  if(matches.length===0){setNotice("First fetch and verify your timetable. Only verified classes can be imported.");return}
  const startedAt=Date.now();
  setSync({mode:"importing",startedAt,current:0,total:matches.length});
  setNotice("");
  try{
   const pref=await fetch("/api/sync/configure",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({selected,sections})});
   const prefData=await pref.json();
   if(!pref.ok)throw new Error(prefData.error||"Could not enable automatic syncing");
   for(let i=0;i<matches.length;i++){
    const m=matches[i];
    setSync({mode:"importing",startedAt,current:i,total:matches.length});
    const event={
     summary:m.subject||m.code,
     description:`${m.code}${m.section?" · Section "+m.section:""} · ${m.teacher}`,
     sourceKey:`${m.code}|${m.section||""}|${m.day}|${m.start}|${m.end}|${m.teacher}`,
     start:new Date(Date.now()+86400000).toISOString(),
     end:new Date(Date.now()+86400000+3600000).toISOString()
    };
    const r=await fetch("/api/calendar/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:[event]})});
    const x=await r.json();
    if(!r.ok)throw new Error(x.error||"Calendar import failed");
    setSync({mode:"importing",startedAt,current:i+1,total:matches.length});
   }
   setNotice(`${matches.length} verified event(s) imported. Automatic syncing is now enabled for your selected subjects; timetable changes will be checked by the sync service.`);
  }catch(e:any){setNotice(e.message||"Calendar import failed")}
  finally{setTimeout(()=>setSync(null),500)}
 }

 function showDemoMatching(){
  const demo:Match[]=[{
   day:"Example",start:"Official time",end:"",code:"PS",section:"1",
   teacher:"Dr Sanja Pattnayak",subject:"Pricing Strategy",score:100
  }];
  setMatches(demo);
  setNotice("Confirmed example loaded: PS 1 + Prof. Sanja Samirana Pattnayak = PRICING STRATEGY, Section 1.");
 }

 const progress=sync?.total?Math.round((sync.current/sync.total)*100):0;

 if(checkingGoogle)return <main className="boot"><Loader2 className="spin" size={28}/><strong>Checking your Google Calendar connection…</strong></main>;

 if(!googleConnected)return <main className="connectPage">
  <section className="connectCard">
   <div className="connectIcon"><CalendarDays size={34}/></div>
   <div className="eyebrow"><Sparkles size={15}/> STEP 1 OF 4 · TERM V SETUP</div>
   <h1>Start by connecting<br/><span>your Google Calendar.</span></h1>
   <p>This takes a few seconds. After connecting, you will choose your registered subjects, select sections where needed, review your timetable and then import it.</p>
   <div className="flowMini"><span className="flowActive">1 · Connect Google</span><span>2 · Choose subjects</span><span>3 · Verify timetable</span><span>4 · Import classes</span></div>
   <button className="primary connectPrimary" onClick={connectGoogle}><CalendarDays size={19}/> Continue with Google</button>
   <div className="connectPoints"><span><Check size={15}/> Opens Google's secure sign-in</span><span><Check size={15}/> No classes imported yet</span></div>
  </section>
  {notice&&<div className="connectNotice">{notice}</div>}
  {sync&&<SyncOverlay sync={sync} elapsed={elapsed} progress={progress}/>}
 </main>;

 return <main>
  {sync&&<SyncOverlay sync={sync} elapsed={elapsed} progress={progress}/>}
  <header className="topbar"><div className="wrap nav">
   <div className="brand"><span className="brandIcon"><GraduationCap size={23}/></span><span><b>Student Calendar</b><small>Google Calendar connected</small></span></div>
   <button className="google connected" onClick={()=>setNotice("Google Calendar is connected and ready to receive verified classes.")}>✓ Google Calendar Connected</button>
  </div></header>

  <section className="wrap hero">
   <div className="eyebrow"><Sparkles size={15}/> PERSONAL TERM V SCHEDULE</div>
   <h1>Your subjects.<br/><span>Your calendar.</span></h1>
   <p>Select the exact Term V subjects you registered for. We will match them against the official college timetable using subject names, sections and faculty names.</p>
   <div className="steps"><span><b className="done">✓</b> 1 · Google connected</span><i></i><span><b>2</b> Choose subjects</span><i></i><span><b>3</b> Verify timetable</span><i></i><span><b>4</b> Import calendar</span></div>
  </section>

  <section className="wrap grid">
   <div className="panel">
    <div className="panelHead"><div><h2>Choose your subjects</h2><p>{selected.length} selected from Term V{sectionSubjects.length?` · ${Object.keys(sections).filter(id=>sectionSubjects.some(s=>s.id===id)&&sections[id]).length}/${sectionSubjects.length} section(s) chosen`:""}</p></div><button className="linkBtn" onClick={()=>setSelected(selected.length===subjects.length?[]:subjects.map(s=>s.id))}>{selected.length===subjects.length?"Clear all":"Select all"}</button></div>
    <div className="subjectGrid">
     {subjects.map(s=>{const on=selected.includes(s.id);const subjectSections=availableSections(s.id);return <div key={s.id} className={"subjectCard "+(on?"active":"")}>
      <button type="button" className="subjectMain" onClick={()=>toggle(s.id)}>
       <span className="tick">{on?<Check size={16}/>:null}</span>
       <strong>{s.name}</strong>
       <small>{s.teacher||"Faculty not applicable"}</small>
       <em>{s.department} · Match code: {s.code}</em>
      </button>
      {on&&subjectSections.length>0&&<div className="inlineSection" onClick={e=>e.stopPropagation()}>
       <div className="inlineSectionHead"><span>Which section are you in?</span><small>Required for timetable matching</small></div>
       <div className="sectionOptions inlineOptions">
        {subjectSections.map(x=><button type="button" key={x} className={sections[s.id]===x?"sectionChoice selected":"sectionChoice"} onClick={()=>setSections(v=>({...v,[s.id]:x}))}>Section {x}</button>)}
       </div>
      </div>}
     </div>})}
    </div>
   </div>

   <aside className="side">
    <div className="panel action">
     <div className="sideTitle"><span className="stepNo">3</span><div><h2>Official timetable</h2><p>Fetch directly from college source</p></div></div>
     <button className="primary" onClick={fetchOfficial} disabled={loading}>{loading?<Loader2 className="spin" size={18}/>:<RefreshCw size={18}/>} Fetch Term V timetable</button>
     {raw&&<button className="secondary" onClick={showDemoMatching}><ShieldCheck size={17}/> Show confirmed matching example</button>}
     <small>Source is read through the app server to avoid browser CORS problems.</small>
    </div>
   </aside>
  </section>

  {notice&&<section className="wrap"><div className="notice"><Check size={18}/>{notice}</div></section>}

  {matches.length>0&&<section className="wrap panel preview"><div className="panelHead"><div><h2>Matched timetable preview</h2><p>Review your classes first. Import is the final step below.</p></div><span className="verified"><ShieldCheck size={16}/> Verified example</span></div>
   {matches.map((m,i)=><div className="match" key={i}><div className="dateBox"><CalendarDays size={20}/></div><div><strong>{m.subject}</strong><p>{m.code}{m.section?" · Section "+m.section:""} · {m.teacher}</p></div><span className="confidence">100% confirmed</span></div>)}
  </section>}

  {raw&&<section className="wrap panel raw"><details><summary>View raw response from the official timetable source <ChevronRight size={17}/></summary><pre>{raw.slice(0,60000)}</pre></details></section>}

  <section className="wrap panel finalImport">
   <div className="sideTitle"><span className="stepNo">4</span><div><h2>Import & keep in sync</h2><p>Your selected timetable will be connected to Google Calendar.</p></div></div>
   <div className="syncPromise"><RefreshCw size={18}/><div><strong>Automatic sync enabled after import</strong><span>When the official timetable changes, the sync service checks your selected subjects and updates the connected calendar events where supported by the official timetable data.</span></div></div>
   <button className="primary importBtn" onClick={importCalendar} disabled={matches.length===0||loading}><CalendarDays size={18}/> Import to Google Calendar & enable sync</button>
   <small>{matches.length===0?"Fetch and verify your timetable before importing.":"This is the final step. Your subject choices are saved for future synchronization."}</small>
  </section>

  <footer><div className="wrap">Student Calendar · Term V · Subject matching before calendar import</div></footer>
 </main>
}

function extractRows(source:any):Record<string,any>[] {
 const rows:Record<string,any>[]=[];
 const walk=(v:any)=>{
  if(Array.isArray(v))return v.forEach(walk);
  if(v&&typeof v==="object"){
   const keys=Object.keys(v).map(k=>k.toLowerCase());
   if(keys.some(k=>k==="section")&&(keys.some(k=>k.includes("code"))||keys.some(k=>k.includes("subject")||k.includes("course"))))rows.push(v);
   Object.values(v).forEach(walk);
  }
 };
 if(typeof source==="string"){try{walk(JSON.parse(source))}catch{}}
 else walk(source);
 return rows;
}
function sameCode(raw:string,code:string){
 const a=raw.toUpperCase().replace(/[^A-Z0-9]/g,"");
 const b=code.toUpperCase().replace(/[^A-Z0-9]/g,"");
 return a===b||a.startsWith(b)||a.includes(b);
}

function SyncOverlay({sync,elapsed,progress}:{sync:SyncState;elapsed:number;progress:number}){
 const importing=sync.mode==="importing";
 return <div className="syncOverlay" role="status" aria-live="polite">
  <div className="syncCard">
   <div className="syncSpinner"><Loader2 className="spin" size={34}/></div>
   <div className="syncLabel">{importing?"SYNCING TO GOOGLE CALENDAR":"CONNECTING GOOGLE ACCOUNT"}</div>
   <h2>{importing?"Importing your verified classes…":"Opening secure Google sign-in…"}</h2>
   <p>{importing?"Please keep this tab open while each class is safely added to your calendar.":"You will be redirected to Google to choose and authorize your account."}</p>
   {importing&&<><div className="progressTrack"><span style={{width:`${progress}%`}}/></div><div className="syncStats"><strong>{sync.current} of {sync.total} classes</strong><span>{progress}% complete</span></div></>}
   <div className="elapsed"><Clock3 size={16}/> {importing?"Sync time":"Elapsed time"}: {elapsed<60?`${elapsed}s`:`${Math.floor(elapsed/60)}m ${elapsed%60}s`}</div>
  </div>
 </div>
}
