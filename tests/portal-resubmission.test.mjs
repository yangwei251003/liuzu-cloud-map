import assert from 'node:assert/strict';
import test from 'node:test';
import { PortalDemoRepository as repo } from '../src/lib/portal/demo-repository.ts';
function withStorage(fn){
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const values=new Map(),events=new EventTarget();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:storage,dispatchEvent:events.dispatchEvent.bind(events)}});
 try{repo.resetToSeedData();fn();}finally{
  if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
 }
}
function needsChanges(){
 const activity={...repo.getActivities()[0],id:'resubmit-fixture',organizationId:'org-liuzu-tea'};
 const submission=repo.createSubmission({entityType:'activity',entity:activity,organizationId:'org-liuzu-tea',organizationName:'Fictional demo organization',submittedBy:'Demo partner'});
 repo.reviewSubmission({submissionId:submission.id,action:'request_changes',reviewerName:'Demo reviewer',reviewerRole:'studio',note:'Please clarify the sample description'});
 return repo.getSubmissionById(submission.id);
}
const input=previous=>({submissionId:previous.id,organizationId:previous.organizationId,actorName:'Demo partner',actorRole:'partner',title:'Edited demonstration',summary:'Explicit fictional sample'});
test('a changes-requested partner submission returns to pending review and persists once without mutating prior state',()=>withStorage(()=>{
 const previous=needsChanges(),historyLength=previous.history.length;
 const next=repo.resubmitSubmission(input(previous));
 assert.equal(previous.status,'changes_requested');assert.equal(previous.history.length,historyLength);
 assert.equal(next.id,previous.id);assert.equal(next.status,'pending_review');assert.equal(next.history.length,historyLength+1);assert.equal(next.history.at(-1).action,'resubmit');
 assert.equal(repo.getSubmissionById(next.id).status,'pending_review');assert.equal(repo.getActivityById(previous.entityId).name,'Edited demonstration');assert.equal(repo.getActivityById(previous.entityId).status,'pending_review');
}));
test('demo resubmission rejects a different organization, wrong role and invalid transition before changing records',()=>withStorage(()=>{
 const previous=needsChanges();
 assert.throws(()=>repo.resubmitSubmission({...input(previous),organizationId:'another-demo-org'}));
 assert.throws(()=>repo.resubmitSubmission({...input(previous),actorRole:'studio'}));
 assert.equal(repo.getSubmissionById(previous.id).status,'changes_requested');
 repo.resubmitSubmission(input(previous));assert.throws(()=>repo.resubmitSubmission(input(previous)));
}));
