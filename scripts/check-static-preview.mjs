import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { writeFileSync,mkdirSync } from 'node:fs';
import { chromium,expect } from '@playwright/test';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'preview-dist'),prefix='/liuzu-cloud-map/',origin='http://127.0.0.1:17495';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,origin);if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}const raw=decodeURIComponent(url.pathname.slice(prefix.length)),target=resolve(dir,raw.endsWith('/')||!raw?raw+'index.html':raw);if(!target.startsWith(dir+sep)){res.writeHead(403);res.end();return;}const data=await readFile(target);res.writeHead(200,{'content-type':types[extname(target)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(ok=>server.listen(17495,'127.0.0.1',ok));let browser;const errors=[],external=[],api=[],checks=[];
try{browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());if(r.url().includes('/api/'))api.push(r.url());});
 expect((await page.goto(origin+prefix)).status()).toBe(200);await expect(page.locator('#plan-stops li')).not.toHaveCount(0);checks.push('real repository-prefix initial build');
 await page.evaluate(()=>Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode();})));checks.push('actual screenshot files decode');
 const names=[];for(const duration of ['2小时','3小时','半天'])for(const pace of ['轻松','均衡','深度'])for(const companion of ['独自','亲子','长辈同行','朋友同行']){
  await page.locator('[name=duration]').selectOption(duration);await page.locator('[name=pace]').selectOption(pace);await page.locator('[name=companion]').selectOption(companion);await page.getByRole('button',{name:'生成候选行程',exact:true}).click();await expect(page.locator('#plan-stops li')).not.toHaveCount(0);await expect(page.locator('#plan-notes')).toContainText('未经管理方与现场核验');names.push(await page.locator('#plan-status').textContent());checks.push(`actual domain result: ${duration}/${pace}/${companion}`);
 }
 expect(new Set(names).size).toBeGreaterThan(3);
 await page.locator('[name=interests]:checked').uncheck();await page.getByRole('button',{name:'生成候选行程',exact:true}).click();await expect(page.locator('#plan-stops li')).toHaveCount(0);await expect(page.locator('#plan-status')).toContainText('不完整');checks.push('invalid empty preferences fail clearly');
 await page.locator('[name=interests][value=摄影]').check();await context.setOffline(true);await page.getByRole('button',{name:'生成候选行程',exact:true}).click();await expect(page.locator('#plan-stops li')).not.toHaveCount(0);checks.push('actual algorithm remains usable fully offline');await context.setOffline(false);
 const images=resolve(root,'docs/images');mkdirSync(images,{recursive:true});await page.screenshot({path:resolve(images,'preview-desktop.png')});
 expect((await page.reload()).status()).toBe(200);await expect(page.locator('#plan-stops li')).not.toHaveCount(0);checks.push('repository path reload');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(images,'preview-mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);checks.push('mobile fits viewport');
 expect(errors).toEqual([]);expect(external).toEqual([]);expect(api).toEqual([]);
 writeFileSync(resolve(root,'../static-preview-evidence.json'),JSON.stringify({count:checks.length,checks,scriptAndHttpErrors:errors,externalRequests:external,apiRequests:api,scope:'Production bundle of the existing candidate-route domain function, no Node backend simulation.'},null,2));console.log(JSON.stringify({passed:checks.length,errors:errors.length,externalRequests:external.length,apiRequests:api.length}));
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
