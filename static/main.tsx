import '../app/globals.css';
import {useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../app/desk';
import '../app/notebook.css';
import type {DashboardData} from '../lib/domain';
import {resumeNotebook,unlockNotebook,unlockWithText} from '../lib/notebook-store';
function App(){const [data,setData]=useState<DashboardData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[file,setFile]=useState<File|null>(null),[remember,setRemember]=useState(true),[keyText,setKeyText]=useState('');
useEffect(()=>{resumeNotebook().then(setData).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
if(data)return <Dashboard initial={data}/>;
return <main className="unlock-page"><div className="unlock-paper"><p className="eyebrow">A place to study</p><h1>Semester notebook</h1><p className="unlock-intro">Your courses, notes, and the week ahead.</p>{loading?<p role="status">Opening your notebook…</p>:<form onSubmit={async e=>{e.preventDefault();if(!file&&!keyText)return;setLoading(true);setError('');try{setData(file?await unlockNotebook(file,remember):await unlockWithText(keyText,remember));}catch(e){setError((e as Error).message);}finally{setLoading(false);}}}><hr/><h2>Open your notebook</h2><p>The study pages are encrypted. Choose your unlock key to read them on this device.</p><label className="key-label">Notebook unlock key<input aria-label="Notebook unlock key" type="file" accept=".json,application/json" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><details className="paste-key"><summary>Or paste an unlock key</summary><input type="password" aria-label="Paste unlock key" autoComplete="off" value={keyText} onChange={e=>{setKeyText(e.target.value);setFile(null);}}/></details><label className="remember-key"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember on this device</label><button type="submit" disabled={!file&&!keyText}>Open notebook <span aria-hidden="true">↗</span></button><p className="unlock-footnote">Your key stays in this browser. Keep the key file somewhere safe to open the notebook on another device.</p></form>}{error&&<p role="alert" className="error-box">{error}</p>}<footer>Personal pages · Updated with care</footer></div></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
