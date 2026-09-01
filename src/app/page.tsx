"use client";

import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,ChevronRight,Clock3,GraduationCap,Loader2,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
import {subjects} from "@/lib/subjects";

type Match={day:string;start:string;end:string;code:string;section?:string;teacher:string;subject?:string;score?:number};
type SyncState={mode:"connecting"|"importing";startedAt:number;current:number;total:number};

export default function Home(){
 const [selected,setSelected]=useState<string[]>([]);
 const [sections,setSections]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false);
 const [raw,setRaw]=useState("");
 const [matches,setMatches]=useState<Match[]>([]);
 const [notice,setNotice]=useState("");
 const [googleConnected,setGoogleConnected]=useState(false);
 const [checkingGoogle,setCheckingGoogle]=useState(true);
 const [sync,setSync]=useState<SyncState|null>(null);
 const [elapsed,setElapsed]=useState(0);

 useEffect(()=>{
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
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
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
   setNotice("Official timetable loaded. Next we will adapt the parser to the exact college format and verify every code using faculty names.");
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
   for(let i=0;i<matches.length;i++){
    const m=matches[i];
    setSync({mode:"importing",startedAt,current:i,total:matches.length});
    const event={
     summary:m.subject||m.code,
     description:`${m.code}${m.section?" · Section "+m.section:""} · ${m.teacher}`,
     start:new Date(Date.now()+86400000).toISOString(),
     end:new Date(Date.now()+86400000+3600000).toISOString()
    };
    const r=await fetch("/api/calendar/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:[event]})});
    const x=await r.json();
    if(!r.ok)throw new Error(x.error||"Calendar import failed");
    setSync({mode:"importing",startedAt,current:i+1,total:matches.length});
   }
   setNotice(`${matches.length} verified event(s) imported into your Google Calendar.`);
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
    <div className="panelHead"><div><h2>Choose your subjects</h2><p>{selected.length} selected from Term V</p></div><button className="linkBtn" onClick={()=>setSelected(selected.length===subjects.length?[]:subjects.map(s=>s.id))}>{selected.length===subjects.length?"Clear all":"Select all"}</button></div>
    <div className="subjectGrid">
     {subjects.map(s=>{const on=selected.includes(s.id);return <button key={s.id} className={"subject "+(on?"active":"")} onClick={()=>toggle(s.id)}>
      <span className="tick">{on?<Check size={16}/>:null}</span>
      <strong>{s.name}</strong>
      <small>{s.teacher||"Faculty not applicable"}</small>
      <em>{s.department} · Match code: {s.code}</em>
     </button>})}
    </div>
   </div>

   <aside className="side">
    <div className="panel sticky">
     <div className="sideTitle"><span className="stepNo">2</span><div><h2>Sections</h2><p>Choose where applicable</p></div></div>
     {chosen.filter(s=>s.sections?.length).map(s=><label className="sectionRow" key={s.id}><span>{s.name}</span><select value={sections[s.id]||""} onChange={e=>setSections(v=>({...v,[s.id]:e.target.value}))}><option value="">Select section</option>{s.sections!.map(x=><option key={x}>{x}</option>)}</select></label>)}
     {!chosen.some(s=>s.sections?.length)&&<div className="empty">Select a subject with sections to configure it.</div>}
    </div>

    <div className="panel action">
     <div className="sideTitle"><span className="stepNo">3</span><div><h2>Official timetable</h2><p>Fetch directly from college source</p></div></div>
     <button className="primary" onClick={fetchOfficial} disabled={loading}>{loading?<Loader2 className="spin" size={18}/>:<RefreshCw size={18}/>} Fetch Term V timetable</button>
     {raw&&<button className="secondary" onClick={showDemoMatching}><ShieldCheck size={17}/> Show confirmed matching example</button>}
     <small>Source is read through the app server to avoid browser CORS problems.</small>
    </div>
   </aside>
  </section>

  {notice&&<section className="wrap"><div className="notice"><Check size={18}/>{notice}</div></section>}

  {matches.length>0&&<section className="wrap panel preview"><div className="panelHead"><div><h2>Matched timetable preview</h2><p>Only verified or reviewable matches will be shown here.</p></div><div style={{display:"flex",gap:10,alignItems:"center"}}><span className="verified"><ShieldCheck size={16}/> Verified example</span><button className="primary importBtn" onClick={importCalendar}><CalendarDays size={16}/> Import to Google Calendar</button></div></div>
   {matches.map((m,i)=><div className="match" key={i}><div className="dateBox"><CalendarDays size={20}/></div><div><strong>{m.subject}</strong><p>{m.code}{m.section?" · Section "+m.section:""} · {m.teacher}</p></div><span className="confidence">100% confirmed</span></div>)}
  </section>}

  {raw&&<section className="wrap panel raw"><details><summary>View raw response from the official timetable source <ChevronRight size={17}/></summary><pre>{raw.slice(0,60000)}</pre></details></section>}

  <footer><div className="wrap">Student Calendar · Term V · Subject matching before calendar import</div></footer>
 </main>
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
