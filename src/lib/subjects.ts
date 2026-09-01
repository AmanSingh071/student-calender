export type Subject={
 id:string;
 name:string;
 teacher:string;
 department:string;
 code:string;
 sections?:string[];
};

export const subjects:Subject[]=[
 {id:"aa1",name:"ADVANCED ANALYTICS-I",teacher:"Dr. Kiran Kumar Paidipati",department:"Decision Sciences",code:"AA-I"},
 {id:"ppam",name:"PREDICTIVE TO PRESCRIPTIVE ANALYTICS FOR MANAGERS",teacher:"Prof. Vandana",department:"Decision Sciences",code:"PPAM"},
 {id:"famd",name:"FINANCIAL ANALYTICS FOR MANAGERIAL DECISION-MAKING",teacher:"Dr. Srikanta Kundu",department:"Finance and Accounting",code:"FAMD"},
 {id:"fmi",name:"FINANCIAL MARKETS AND INSTITUTIONS",teacher:"Prof. Sanjay Pareek / VF",department:"Finance and Accounting",code:"FMI"},
 {id:"frm",name:"FINANCIAL RISK MANAGEMENT",teacher:"Prof. Bhanu Pratap Singh",department:"Finance and Accounting",code:"FRM"},
 {id:"impa",name:"INVESTMENT MANAGEMENT AND PORTFOLIO ANALYSIS",teacher:"VF",department:"Finance and Accounting",code:"IMPA"},
 {id:"ma",name:"MERGERS AND ACQUISITIONS",teacher:"Prof. Sanjay Pareek / VF",department:"Finance and Accounting",code:"MA"},
 {id:"cis2",name:"COURSE OF INDEPENDENT STUDY-II",teacher:"",department:"General Management",code:"CIS-II"},
 {id:"dissertation2",name:"DISSERTATION (PART-2)",teacher:"",department:"General Management",code:"DISSERTATION-II"},
 {id:"neg",name:"NEGOTIATION MANAGEMENT",teacher:"Dr. Rinki Dahiya",department:"Human Resource Management",code:"NM"},
 {id:"perf",name:"PERFORMANCE MANAGEMENT",teacher:"Prof. Parul Malik",department:"Human Resource Management",code:"PERM"},
 {id:"aibi",name:"AGENTIC AI AND BUSINESS INTEGRATION",teacher:"Dr. Urvashi Rathod / Dr. Karthikeyan Balakumar",department:"Information Technology and Systems",code:"AIBI"},
 {id:"ets",name:"EMERGING TECHNOLOGIES FOR SUSTAINABILITY",teacher:"Dr. Sonali Shankar",department:"Information Technology and Systems",code:"ETS"},
 {id:"mlba",name:"MACHINE LEARNING WITH BUSINESS APPLICATIONS",teacher:"Dr. Alekh Gour",department:"Information Technology and Systems",code:"MLBA"},
 {id:"pfa",name:"PYTHON FOR ANALYTICS: FOUNDATIONS TO GenAI",teacher:"Dr. Alekh Gour",department:"Information Technology and Systems",code:"PFA"},
 {id:"amr",name:"ADVANCED MARKETING RESEARCH",teacher:"Prof. Devika Vashisht",department:"Marketing",code:"AMR"},
 {id:"ams",name:"ADVANCED MARKETING STRATEGY",teacher:"Dr. Amit Anand Tiwari",department:"Marketing",code:"AMS"},
 {id:"b2b",name:"B2B MARKETING",teacher:"Dr. Shashi",department:"Marketing",code:"B2B"},
 {id:"pricing",name:"PRICING STRATEGY",teacher:"Prof. Sanja Samirana Pattnayak",department:"Marketing",code:"PS",sections:["1","2","3"]},
 {id:"promo",name:"PROMOTION STRATEGY",teacher:"Dr. Vikas Kumar",department:"Marketing",code:"PMS"},
 {id:"sdm",name:"SALES AND DISTRIBUTION MANAGEMENT",teacher:"Dr. Karthikeyan Balakumar / VF",department:"Marketing",code:"SDM"},
 {id:"project",name:"PROJECT MANAGEMENT",teacher:"Prof. Mohita Sharma / Dr. Manish Sarkhel",department:"Operations Management",code:"PJM"},
 {id:"scas",name:"SUPPLY CHAIN ANALYTICS AND STRATEGY",teacher:"Prof. M. Pachayappan",department:"Operations Management",code:"SCAS"},
 {id:"mc",name:"MANAGEMENT CONSULTING",teacher:"PROF. PRAGYA BHAWSAR",department:"Strategic Management",code:"MC"},
 {id:"mppp",name:"MANAGING PUBLIC PRIVATE PARTNERSHIPS",teacher:"Prof. Ashish Goel",department:"Strategic Management",code:"MPPP"},
 {id:"esm",name:"EVENT AND SPORT MANAGEMENT",teacher:"Dr. Vikrant Kaushal",department:"Tourism Management",code:"ESM"}
];

export function normalize(v:string){
 return v.toUpperCase()
  .replace(/DR\.?|PROF\.?|MR\.?|MS\.?/g,"")
  .replace(/[^A-Z0-9 ]/g," ")
  .replace(/\s+/g," ")
  .trim();
}

export function matchSubject(rawCode:string,teacher:string){
 const c=normalize(rawCode),t=normalize(teacher);
 let best:{subject?:Subject;score:number}={score:0};
 for(const s of subjects){
  let score=0;
  if(c===normalize(s.code)||c.startsWith(normalize(s.code)+" "))score+=70;
  const words=normalize(s.teacher).split(" ").filter(x=>x.length>4);
  if(words.some(w=>t.includes(w)))score+=30;
  if(score>best.score)best={subject:s,score};
 }
 return best.score?{subject:best.subject!,score:best.score}:null;
}