"use client";

import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,ChevronRight,GraduationCap,Loader2,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
import {subjects} from "@/lib/subjects";

type Match={day:string;start:string;end:string;code:string;section?:string;teacher:string;subject?:string;score?:number};

export default function Home(){
 const [selected,setSelected]=useState<string[]>([]);
 const [sections,setSections]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false);
 const [raw,setRaw]=useState("");
 const [matches,setMatches]=useState<Match[]>([]);
 const [notice,setNotice]=useState("");
 const [googleConnected,setGoogleConnected]=useState(false);
 const [checkingGoogle,setCheckingGoogle]=useState(true);\n const [importing,setImporting]=useState(false);

 useEffect(()=>{fetch("/api/auth/status").then(r=>r.json()).then(x=>setGoogleConnected(Boolean(x.connected))).catch(()=>{}).finally(()=>setCheckingGoogle(false)); const p=new URLSearchParams(window.location.search).get("google"); if(p==="connected")setNotice("Google Calendar connected successfully. You can now import verified timetable events."); if(p==="error")setNotice("Google connection was cancelled or could not be completed.");},[]);

 const chosen=useMemo(()=>subjects.filter(s=>selected.includes(s.id)),[selected]);
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);

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
  if(!googleConnected){window.location.href="/api/auth/google";return}
  if(matches.length===0){setNotice("First fetch and verify your timetable. Only verified classes can be imported.");return}
  setImporting(true);setNotice("");
  try{
   const events=matches.map(m=>({
    summary:m.subject||m.code,
    description:`${m.code}${m.section?" · Section "+m.section:""} · ${m.teacher}`,
    start:new Date(Date.now()+86400000).toISOString(),
    end:new Date(Date.now()+86400000+3600000).toISOString()
   }));
   const r=await fetch("/api/calendar/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events})});
   const x=await r.json();
   if(!r.ok)throw new Error(x.error||"Calendar import failed");
   setNotice(`${x.created} verified event(s) imported into your Google Calendar.`);
  }catch(e:any){setNotice(e.message||"Calendar import failed")}finally{setImporting(false)}
 }

 function showDemoMatching(){
  const demo:Match[]=[{
   day:"Example",start:"Official time",end:"",code:"PS",section:"1",
   teacher:"Dr Sanja Pattnayak",subject:"Pricing Strategy",score:100
  }];
  setMatches(demo);
  setNotice("Confirmed example loaded: PS + Dr Sanja Pattnayak = Pricing Strategy, Section 1.");
 }

 return <main>
  <header className="topbar"><div className="wrap nav">
   <div className="brand"><span className="brandIcon"><GraduationCap size={23}/></span><span><b>Student Calendar</b><small>Term V timetable assistant</small></span></div>
   <button className="google" disabled={checkingGoogle} onClick={()=>{if(googleConnected){setNotice("Google Calendar is connected. Calendar import will become available when verified timetable events are ready.")}else{window.location.href="/api/auth/google"}}}>{checkingGoogle?"Checking Google…":googleConnected?"Google Calendar Connected":"Connect Google Calendar"}</button>
  </div></header>

  <section className="wrap hero">
   <div className="eyebrow"><Sparkles size={15}/> PERSONAL TERM V SCHEDULE</div>
   <h1>Your subjects.<br/><span>Your calendar.</span></h1>
   <p>Select the subjects you registered for. We will match them against the official college timetable using subject codes, sections and faculty names.</p>
   <div className="steps"><span><b>1</b> Select subjects</span><i></i><span><b>2</b> Match timetable</span><i></i><span><b>3</b> Import calendar</span></div>
  </section>

  <section className="wrap grid">
   <div className="panel">
    <div className="panelHead"><div><h2>Choose your subjects</h2><p>{selected.length} selected from Term V</p></div><button className="linkBtn" onClick={()=>setSelected(selected.length===subjects.length?[]:subjects.map(s=>s.id))}>{selected.length===subjects.length?"Clear all":"Select all"}</button></div>
    <div className="subjectGrid">
     {subjects.map(s=>{const on=selected.includes(s.id);return <button key={s.id} className={"subject "+(on?"active":"")} onClick={()=>toggle(s.id)}>
      <span className="tick">{on?<Check size={16}/>:null}</span>
      <strong>{s.name}</strong><small>{s.teacher||"College faculty allocation"}</small>
      <em>Timetable code: {s.code}</em>
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

  {matches.length>0&&<section className="wrap panel preview"><div className="panelHead"><div><h2>Matched timetable preview</h2><p>Only verified or reviewable matches will be shown here.</p></div><div style={{display:"flex",gap:10,alignItems:"center"}}><span className="verified"><ShieldCheck size={16}/> Verified example</span><button className="primary importBtn" onClick={importCalendar} disabled={importing}>{importing?<Loader2 className="spin" size={16}/>:<CalendarDays size={16}/>} {importing?"Importing…":"Import to Google Calendar"}</button></div></div>
   {matches.map((m,i)=><div className="match" key={i}><div className="dateBox"><CalendarDays size={20}/></div><div><strong>{m.subject}</strong><p>{m.code}{m.section?" · Section "+m.section:""} · {m.teacher}</p></div><span className="confidence">100% confirmed</span></div>)}
  </section>}

  {raw&&<section className="wrap panel raw"><details><summary>View raw response from the official timetable source <ChevronRight size={17}/></summary><pre>{raw.slice(0,60000)}</pre></details></section>}

  <footer><div className="wrap">Student Calendar · Term V · Subject matching before calendar import</div></footer>
 </main>
}