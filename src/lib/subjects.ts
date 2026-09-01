export type Subject={id:string;name:string;teacher:string;code:string;sections?:string[]};

export const subjects:Subject[]=[
{id:"aa1",name:"Advanced Analytics-I",teacher:"Dr. Kiran Kumar Paidipati",code:"AA-I"},
{id:"ppam",name:"Predictive to Prescriptive Analytics for Managers",teacher:"Prof. Vandana",code:"PPAM"},
{id:"famd",name:"Financial Analytics for Managerial Decision-Making",teacher:"Dr. Srikanta King",code:"FAMD"},
{id:"fmi",name:"Financial Markets and Institutions",teacher:"Prof. Sanjay Pareek / VF",code:"FMI"},
{id:"frm",name:"Financial Risk Management",teacher:"Prof. Bhanu Pratap Singh",code:"FRM"},
{id:"impa",name:"Investment Management and Portfolio Analysis",teacher:"VF",code:"IMPA"},
{id:"ma",name:"Mergers and Acquisitions",teacher:"Prof. Sanjay Pareek / VF",code:"MA"},
{id:"cis2",name:"Course of Independent Study-II",teacher:"",code:"CIS-II"},
{id:"neg",name:"Negotiation Management",teacher:"Dr. Rinki Dahiya",code:"NM"},
{id:"perf",name:"Performance Management",teacher:"Prof. Parul Malik",code:"PERM"},
{id:"aibi",name:"Artificial Intelligence and Business Integration",teacher:"Dr. Urvashi Rathod / Dr. Kirtikiran Balakumar",code:"AIBI"},
{id:"ets",name:"Emerging Technologies for Sustainability",teacher:"Dr. Sonali Shankar",code:"ETS"},
{id:"mlba",name:"Machine Learning with Business Applications",teacher:"Dr. Alekh Gour",code:"MLBA"},
{id:"pfa",name:"Python for Analytics: Foundations to GenAI",teacher:"Dr. Alekh Gour",code:"PFA"},
{id:"amr",name:"Advanced Marketing Research",teacher:"Prof. Devika Vashisht",code:"AMR"},
{id:"ams",name:"Advanced Marketing Strategy",teacher:"Dr. Amit Anand Tiwari",code:"AMS"},
{id:"b2b",name:"B2B Marketing",teacher:"Dr. Shashi",code:"B2B"},
{id:"pricing",name:"Pricing Strategy",teacher:"Prof. Sanja Samirana Pattnayak",code:"PS",sections:["1","2","3"]},
{id:"promo",name:"Promotion Strategy",teacher:"Dr. Vikas Kumar",code:"PMS"},
{id:"sdm",name:"Sales and Distribution Management",teacher:"Dr. Karthikeyan Balakumar / VF",code:"SDM"},
{id:"project",name:"Project Management",teacher:"Prof. Mohita Sharma / Dr. Manish Sarkhel",code:"PJM"},
{id:"scas",name:"Supply Chain Analytics and Strategy",teacher:"Prof. M Pachayappan",code:"SCAS"},
{id:"mc",name:"Management Consulting",teacher:"Prof. Praga Bhawsar",code:"MC"},
{id:"mppp",name:"Managing Public-Private Partnerships",teacher:"Prof. Ashish Goel",code:"MPPP"},
{id:"esm",name:"Event and Sport Management",teacher:"Dr. Vikrant Kaushal",code:"ESM"}
];

export function normalize(v:string){return v.toUpperCase().replace(/DR\.?|PROF\.?|MR\.?|MS\.?/g,"").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim()}

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