import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudyVisual,visualBounds,exportStudyMarkdown} from '../lib/study-visual.ts';
test('visual data preserves common axes so scenario comparisons remain honest',()=>{
 const v=parseStudyVisual(JSON.stringify({title:'Comparison',intro:'Compare values',steps:[{label:'A',explanation:'A',points:[[-2,4],[2,4]]},{label:'B',explanation:'B',points:[[0,-3],[4,8]]}]}));
 assert.deepEqual(visualBounds(v),{minX:-2,maxX:4,minY:-3,maxY:8});
});
test('Markdown exports explain every step without interactive JSON',()=>{
 const raw='```visual\n'+JSON.stringify({title:'Diagram',intro:'Intro',steps:[{label:'First',explanation:'Reason one',nodes:['Start','End']},{label:'Second',explanation:'Reason two',question:'Why?',answer:'Because'}]})+'\n```';
 const out=exportStudyMarkdown(raw);
 assert.ok(out.includes('Reason one')&&out.includes('Reason two')&&out.includes('Explanation: Because'));
 assert.ok(!out.includes('```visual'));
});
test('invalid or oversized plot data fails without executing content',()=>{
 for(const raw of ['alert(1)','null','{}',JSON.stringify({title:'x',intro:'x',steps:[]}),JSON.stringify({title:'x',intro:'x',steps:[{label:'x',explanation:'x',points:[[1,'2']]}]})])assert.equal(parseStudyVisual(raw),null);
 const v=parseStudyVisual(JSON.stringify({title:'<script>bad()</script>',intro:'Plain text',steps:[{label:'1',explanation:'Text',code:'not executable'}]}));
 assert.equal(v.title,'<script>bad()</script>');
});
