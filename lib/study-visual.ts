export type VisualStep = {label:string; explanation:string; nodes?:string[]; code?:string; points?:[number,number][]; question?:string; answer?:string};
export type StudyVisualData = {title:string; intro:string; xLabel?:string; yLabel?:string; steps:VisualStep[]};
const short=(s:unknown,max=12000):s is string=>typeof s==='string'&&s.length<=max;
export function parseStudyVisual(raw:string):StudyVisualData|null{
  try{
    if(raw.length>150000)return null;
    const v=JSON.parse(raw);
    if(!v||!short(v.title,200)||!short(v.intro)||!Array.isArray(v.steps)||!v.steps.length||v.steps.length>40)return null;
    if([v.xLabel,v.yLabel].some(s=>s!==undefined&&!short(s,100)))return null;
    for(const s of v.steps){
      if(!s||!short(s.label,200)||!short(s.explanation))return null;
      if([s.code,s.question,s.answer].some(x=>x!==undefined&&!short(x)))return null;
      if(s.nodes!==undefined&&(!Array.isArray(s.nodes)||s.nodes.length>12||s.nodes.some((x:unknown)=>!short(x,500))))return null;
      if(s.points!==undefined&&(!Array.isArray(s.points)||s.points.length>500||s.points.some((p:unknown)=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e9))))return null;
    }
    return v;
  }catch{return null;}
}
export function visualBounds(v:StudyVisualData){
  const p=v.steps.flatMap(s=>s.points||[]);
  const xs=p.map(p=>p[0]),ys=p.map(p=>p[1]);
  const minX=Math.min(0,...xs),maxX=Math.max(1,...xs),minY=Math.min(0,...ys),maxY=Math.max(1,...ys);
  return {minX,maxX,minY,maxY};
}
export function exportStudyMarkdown(text:string){
  return text.replace(/```visual\n([\s\S]*?)```/g,(_block,raw)=>{
    const v=parseStudyVisual(raw.trim());
    if(!v)return '[Study diagram unavailable]';
    return `### ${v.title}\n\nAdded teaching illustration. ${v.intro}\n\n`+v.steps.map(s=>`#### ${s.label}\n\n${s.nodes?.map((n,i)=>`${i+1}. ${n}`).join('\n')||''}\n\n${s.code?'```text\n'+s.code+'\n```\n\n':''}${s.explanation}\n\n${s.points?'Plot values ('+(v.xLabel||'x')+', '+(v.yLabel||'y')+'): '+s.points.map(p=>'('+p.join(', ')+')').join('; ')+'\n\n':''}${s.question?'Check: '+s.question+'\n\nExplanation: '+(s.answer||'')+'\n':''}`).join('\n');
  });
}
