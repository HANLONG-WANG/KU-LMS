import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
let data={},manifest=JSON.parse(fs.readFileSync('manifest.json','utf8')),authCalls=0,uploads=0;const cloud=[];
// Exercise the unconfigured state independently of the developer's real OAuth setup.
delete manifest.key; delete manifest.oauth2;
const source=f=>fs.readFileSync(`src/background/${f}`,'utf8'),clone=v=>JSON.parse(JSON.stringify(v));
const make=()=>{
 const handlers=[],changed=[],alarms=new Map();
 const chrome={runtime:{id:'fixture-extension',lastError:null,getURL:p=>`chrome-extension://fixture-extension/${p}`,getManifest:()=>manifest,onMessage:{addListener:f=>handlers.push(f)},onInstalled:{addListener(){}},onStartup:{addListener(){}}},identity:{getAuthToken(options,cb){authCalls++;cb('token-only-in-memory');},removeCachedAuthToken(_v,cb){cb();}},storage:{local:{get(k,cb){cb(clone(k in data?{[k]:data[k]}:{}));},set(v,cb){const diff={};for(const [k,value] of Object.entries(v)){diff[k]={oldValue:data[k],newValue:clone(value)};data[k]=clone(value);}cb();queueMicrotask(()=>changed.forEach(f=>f(diff,'local')));}},onChanged:{addListener:f=>changed.push(f)}},alarms:{onAlarm:{addListener(){}},create(n,v){alarms.set(n,v);},get(n,cb){cb(alarms.get(n));}},tabs:{onRemoved:{addListener(){}}}};
 const context=vm.createContext({chrome,URL,URLSearchParams,TextEncoder,AbortController,crypto:webcrypto,console,setTimeout:()=>1,clearTimeout(){},fetch:async(url,init={})=>{
  assert.equal(init.headers.Authorization,'Bearer token-only-in-memory');
  if(url.includes('/about?'))return new Response(JSON.stringify({user:{permissionId:'runtime_account',emailAddress:'runtime@example.test'}}));
  if(url.includes('/files?')&&init.method==='POST'){uploads++;const body=init.body;const json=body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0];const payload=JSON.parse(json);cloud.push({id:`cloud_${uploads}`,payload});return new Response(JSON.stringify({id:`cloud_${uploads}`}));}
  if(url.includes('/files?'))return new Response(JSON.stringify({files:cloud.map(f=>({id:f.id,size:'100'}))}));
  const id=url.match(/files\/([^?]+)/)?.[1];return new Response(JSON.stringify(cloud.find(f=>f.id===id)?.payload));
 }});
 context.importScripts=(...files)=>files.forEach(f=>vm.runInContext(source(f),context));vm.runInContext(source('service-worker.js'),context);
 const send=(message,lms=false)=>new Promise(resolve=>{for(const handler of handlers)handler(message,{id:'fixture-extension',url:lms?'https://kulms.tl.kansai-u.ac.jp/webclass/':'chrome-extension://fixture-extension/src/popup/popup.html'},resolve);});
 return {send,alarms};
};
let app=make();assert.ok(app.alarms.has('ku-lms-todo-sync'));
assert.equal((await app.send({type:'ku:todo-sync',action:'status'})).data.configured,false);assert.equal(authCalls,0);
assert.equal((await app.send({type:'ku:todo-sync',action:'prepare',workspaceId:'local'})).ok,false);assert.equal(authCalls,0,'missing configuration never requests authorization');
assert.equal((await app.send({type:'ku:todo-sync',action:'prepare',workspaceId:'local'},true)).ok,false,'host page cannot trigger OAuth');
manifest={...manifest,key:'fixture-key',oauth2:{client_id:'123-fixture.apps.googleusercontent.com',scopes:['https://www.googleapis.com/auth/drive.appdata']}};
const course='https://kulms.tl.kansai-u.ac.jp/webclass/course.php/123/';
await app.send({type:'ku:todo',action:'catalog',workspaceId:'local',operationId:'catalog',courses:[{key:course,title:'Course'}]},true);
await app.send({type:'ku:todo',action:'add',workspaceId:'local',operationId:'task',courseKey:course,text:'persistent runtime TODO'},true);
const preview=await app.send({type:'ku:todo-sync',action:'prepare',workspaceId:'local'});assert.equal(preview.ok,true);assert.equal(uploads,0,'authorization/preview alone never uploads');
const connected=await app.send({type:'ku:todo-sync',action:'confirm',ticket:preview.data.ticket});assert.equal(connected.ok,true);assert.equal(connected.data.enabled,true);assert.equal(connected.data.pending,0);assert.equal(uploads,1);
assert.ok(!JSON.stringify(data).includes('token-only-in-memory'),'access token never persists');
app=make();const restarted=await app.send({type:'ku:todo-sync',action:'now'});assert.equal(restarted.data.pending,0);assert.equal(uploads,1,'restart does not duplicate acknowledged upload');
const disconnected=await app.send({type:'ku:todo-sync',action:'disconnect'});assert.equal(disconnected.data.enabled,false);assert.equal((await app.send({type:'ku:todo',action:'read'},true)).data.workspaces[0].todos[0].text,'persistent runtime TODO');
console.log('PASS: service worker imports, OAuth boundary, preview gate, real message routing, alarm initialization and restart');
