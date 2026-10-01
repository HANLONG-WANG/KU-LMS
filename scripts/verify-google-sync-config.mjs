import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ku-google-config-'));
try{
 const manifest=path.join(dir,'manifest.json'),config=path.join(dir,'config.json');
 const original={manifest_version:3,version:'0.1.0',name:'fixture'};fs.writeFileSync(manifest,JSON.stringify(original));
 const run=(...args)=>spawnSync(process.execPath,['scripts/configure-google-sync.mjs','--manifest',manifest,'--config',config,...args],{encoding:'utf8'});
 assert.equal(run('--prepare').status,0);const first=fs.readFileSync(config,'utf8');assert.equal(run('--prepare').status,0);assert.equal(fs.readFileSync(config,'utf8'),first,'stable key on rerun');assert.deepEqual(JSON.parse(fs.readFileSync(manifest)),original,'prepare never changes installed identity');
 assert.notEqual(run('--apply','--client-id','123-fixture.apps.googleusercontent.com').status,0,'identity change requires explicit backup acknowledgement');
 assert.notEqual(run('--apply','--client-id','not-an-oauth-id','--confirm-backup').status,0);assert.deepEqual(JSON.parse(fs.readFileSync(manifest)),original);
 assert.equal(run('--apply','--client-id','123-fixture.apps.googleusercontent.com','--confirm-backup').status,0);
 const result=JSON.parse(fs.readFileSync(manifest));assert.ok(result.key);assert.equal(result.oauth2.client_id,'123-fixture.apps.googleusercontent.com');assert.deepEqual(result.oauth2.scopes,['https://www.googleapis.com/auth/drive.appdata']);assert.ok(!JSON.stringify(result).includes('PRIVATE KEY'));
 assert.equal(run('--apply').status,0,'same identity can reapply public config without migration');
 const prepared=JSON.parse(first);assert.match(prepared.extensionId,/^[a-p]{32}$/);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS: stable extension identity preparation, backup gate, OAuth validation and idempotent configuration');
