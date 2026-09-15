import {useState} from 'react';
import {parseStudyVisual,visualBounds} from '../lib/study-visual';

export default function StudyVisual({raw}:{raw:string}){
  const [index,setIndex]=useState(0),[revealed,setRevealed]=useState(false);
  const v=parseStudyVisual(raw);
  if(!v)return <p role="alert">This study diagram could not be loaded. The surrounding notes remain available.</p>;
  const step=v.steps[Math.min(index,v.steps.length-1)];
  const bounds=visualBounds(v);
  const sx=(x:number)=>55+(x-bounds.minX)/(bounds.maxX-bounds.minX)*480;
  const sy=(y:number)=>245-(y-bounds.minY)/(bounds.maxY-bounds.minY)*215;
  function select(n:number){setIndex(n);setRevealed(false);}
  return <section className="study-visual" aria-label={v.title}>
    <div className="visual-heading"><span className="eyebrow">EXPLORE & EXPLAIN</span><span className="muted">Added teaching illustration</span></div>
    <h3>{v.title}</h3><p>{v.intro}</p>
    <div className="visual-choices" role="group" aria-label={v.title+' scenarios'}>{v.steps.map((s,i)=><button key={i} aria-pressed={i===index} onClick={()=>select(i)}>{i+1}. {s.label}</button>)}</div>
    <div className="visual-stage" aria-live="polite">
      {step.nodes&&<ol className="visual-flow">{step.nodes.map((n,i)=><li key={i}><span className="visual-number">{i+1}</span><span>{n}</span>{i<step.nodes!.length-1&&<span className="visual-arrow" aria-hidden="true">↓</span>}</li>)}</ol>}
      {step.points&&<><svg viewBox="0 0 580 300" role="img" aria-label={`${v.title}: ${step.label}. ${v.xLabel||'x'} versus ${v.yLabel||'y'}. ${step.explanation}`}>
        <line x1="55" y1={sy(0)} x2="540" y2={sy(0)} stroke="currentColor" opacity=".3"/><line x1={sx(0)} y1="25" x2={sx(0)} y2="250" stroke="currentColor" opacity=".3"/>
        {Array.from({length:5},(_,i)=>{const x=bounds.minX+(bounds.maxX-bounds.minX)*i/4,y=bounds.minY+(bounds.maxY-bounds.minY)*i/4;return <g key={i}><text x={sx(x)} y="268" textAnchor="middle">{Number(x.toFixed(2))}</text><text x="46" y={sy(y)+4} textAnchor="end">{Number(y.toFixed(2))}</text></g>;})}
        {step.points.map(([x,y],i)=><circle key={i} cx={sx(x)} cy={sy(y)} r="4.5" fill="currentColor" opacity=".8"/>)}
        <text x="295" y="293" textAnchor="middle">{v.xLabel||'x'}</text><text x="12" y="140" transform="rotate(-90 12 140)" textAnchor="middle">{v.yLabel||'y'}</text>
      </svg><details><summary>Read plot values</summary><div className="visual-table"><table><thead><tr><th>{v.xLabel||'x'}</th><th>{v.yLabel||'y'}</th></tr></thead><tbody>{step.points.map(([x,y],i)=><tr key={i}><td>{Number(x.toFixed(4))}</td><td>{Number(y.toFixed(4))}</td></tr>)}</tbody></table></div></details></>}
      {step.code&&<pre><code>{step.code}</code></pre>}
      <p className="visual-explanation">{step.explanation}</p>
    </div>
    {v.steps.length>1&&<div className="visual-controls"><button disabled={index===0} onClick={()=>select(index-1)}>← Previous</button><input aria-label={v.title+' step'} type="range" min="0" max={v.steps.length-1} value={index} onChange={e=>select(Number(e.target.value))}/><span>{index+1} / {v.steps.length}</span><button disabled={index===v.steps.length-1} onClick={()=>select(index+1)}>Next →</button></div>}
    {step.question&&<div className="visual-predict"><strong>Pause and explain</strong><p>{step.question}</p><textarea aria-label={'Your prediction for '+v.title} key={index} placeholder="Try explaining it in your own words… (scratch space)" rows={2}/><button onClick={()=>setRevealed(!revealed)}>{revealed?'Hide explanation':'Check your reasoning'}</button>{revealed&&<p role="status">{step.answer}</p>}</div>}
    <details className="visual-print"><summary>All steps in words</summary>{v.steps.map((s,i)=><div key={i}><h4>{s.label}</h4><p>{s.explanation}</p>{s.code&&<pre>{s.code}</pre>}{s.question&&<p>{s.question} — {s.answer}</p>}</div>)}</details>
  </section>;
}
