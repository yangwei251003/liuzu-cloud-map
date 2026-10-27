import { buildPersonalRoute } from '../src/lib/personal-route-builder.ts';
const form=document.querySelector('#planner');
const status=document.querySelector('#plan-status');
const stops=document.querySelector('#plan-stops');
const notes=document.querySelector('#plan-notes');
function render(event){
 event?.preventDefault(); const data=new FormData(form);
 const result=buildPersonalRoute({duration:data.get('duration'),pace:data.get('pace'),companion:data.get('companion'),interests:data.getAll('interests')});
 stops.replaceChildren(); notes.replaceChildren();
 if(!result.ok){status.textContent=result.error;return;}
 status.textContent=`${result.plan.title} · ${result.plan.stops.length} 个候选点 · 建议停留 ${result.plan.totalDwellMinutes} 分钟`;
 for(const stop of result.plan.stops){const li=document.createElement('li');const title=document.createElement('strong');title.textContent=`${stop.name} · ${stop.dwellMinutes} 分钟`;const reason=document.createElement('p');reason.textContent=stop.reason;li.append(title,reason);stops.append(li);}
 for(const note of result.plan.boundaryNotes){const li=document.createElement('li');li.textContent=note;notes.append(li);}
}
form.addEventListener('submit',render);render();
