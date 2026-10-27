import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.LIUZU_CAPTURE_PORT??17491),origin=`http://127.0.0.1:${port}`;
const variant=process.env.LIUZU_CAPTURE_VARIANT==='mvp';
const environment={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of Object.keys(environment))if(/^(NEXT_PUBLIC_|AMAP_|GEMINI_|ZHIPU|DATABASE_|POSTGRES_|OIDC_|ADMIN_|OPENAI_|SUPABASE_|AWS_|S3_)/.test(key))delete environment[key];
const server=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;const pageErrors=[],httpFailures=[],externalHosts=new Set(),checks=[];
try{
 let ready=false;for(let i=0;i<150;i++){try{await fetch(`${origin}/api/health`);ready=true;break;}catch{await new Promise(ok=>setTimeout(ok,200));}}
 if(!ready)throw new Error('The isolated candidate did not start.');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.on('response',response=>{if(response.status()>=400)httpFailures.push({path:new URL(response.url()).pathname,status:response.status()});});page.on('request',req=>{if(!req.url().startsWith(origin)&&req.url().startsWith('http'))externalHosts.add(new URL(req.url()).hostname);});
 const images=resolve(root,'docs/images');mkdirSync(images,{recursive:true});
 for(const [route,file] of [['/','app-home.png'],['/map','app-map.png'],['/plan','app-plan.png'],...(variant?[['/judge','app-judge.png'],['/partner','app-partner.png'],['/studio','app-studio.png']]:[])]){
  if(variant&&(route==='/partner'||route==='/studio')){await page.goto(origin+'/judge');await page.getByRole('button',{name:route==='/partner'?'以演示商户身份进入':'以运营人员身份进入',exact:true}).click();await page.waitForURL(route==='/partner'?'**/partner/workbench':'**/studio/reviews');}
  const response=await page.goto(origin+route,{waitUntil:'domcontentloaded'});expect(response.status()).toBe(200);await expect(page.locator(route==='/judge'?'h1':'main').first()).toBeVisible();await page.waitForTimeout(1300);
  await page.waitForFunction(()=>!document.querySelector('[data-map-load-status="loading"]'),null,{timeout:20000}).catch(()=>{});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&r.width>0;}).map(i=>i.decode().catch(()=>{}))));
  await page.screenshot({path:resolve(images,file),mask:[page.locator('input[type="password"]')]});checks.push(`actual Node page: ${route}`);
 }
 if(variant){
  // Deliberate synthetic precondition, limited to this fresh browser's demo store.
  await page.goto(origin+'/judge');await page.getByRole('button',{name:'以演示商户身份进入',exact:true}).click();await page.waitForURL('**/partner/workbench');
  const id=await page.evaluate(()=>{const key='yunmap-portal:submissions:v1',rows=JSON.parse(localStorage.getItem(key)??'[]'),row=rows.find(x=>x.organizationId==='org-liuzu-tea');if(!row)throw new Error('No synthetic demo submission');row.status='changes_requested';row.reviewNote='仅自动化演示：请补充示例摘要';localStorage.setItem(key,JSON.stringify(rows));return row.id;});
  await page.goto(origin+'/partner/submissions');await page.getByRole('button',{name:'重新修改并提交',exact:true}).first().click();
  await page.locator('form input[type=text]').fill('公开演示修改后的活动');await page.locator('form textarea').fill('仅隔离浏览器的虚构活动，用于验证重新提交后保留修改内容。');
  await page.getByRole('button',{name:'确认重新提交审核',exact:true}).click();await expect(page.getByRole('heading',{name:'公开演示修改后的活动',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'公开演示修改后的活动',exact:true})).toBeVisible();
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('yunmap-portal:submissions:v1')??'[]').find(x=>x.id===id),id);expect(saved.status).toBe('pending_review');expect(saved.snapshot.name).toBe('公开演示修改后的活动');checks.push('actual UI resubmission persists pending_review and edited snapshot across reload (synthetic demo fixture)');
 }
 await page.setViewportSize({width:390,height:844});await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForTimeout(1000);await page.screenshot({path:resolve(images,'app-mobile.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);checks.push('mobile root fits viewport');
 const health=await (await fetch(`${origin}/api/health`)).json();
 writeFileSync(resolve(root,'../anonymous-runtime-evidence.json'),JSON.stringify({checks,pageErrors,httpFailures,externalHosts:[...externalHosts],health,scope:'Actual anonymous, fresh browser storage. No DB, real account, model/map keys, geolocation permission or paid service. Screens are actual app, not prototype screenshots.'},null,2));
 expect(pageErrors).toEqual([]);
 const missingMedia=httpFailures.filter(x=>/\.(?:jpg|jpeg|png|webp|avif|woff2|mp4|svg|mjs|js|css)$/.test(x.path));expect(missingMedia).toEqual([]);
 console.log(JSON.stringify({checks:checks.length,pageErrors:pageErrors.length,httpFailures,externalHosts:[...externalHosts]}));
}finally{await browser?.close();server.kill();await new Promise(ok=>{if(server.exitCode!==null)ok();else{server.once('exit',ok);setTimeout(ok,5000);}});}
