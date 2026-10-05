/* eslint-disable @typescript-eslint/no-require-imports -- Firebase CLI modules use CommonJS. */
/* Validates candidate rules without deploying them or writing athlete records. */
const fs = require('node:fs');
const path = require('node:path');
let lib = process.env.FIREBASE_TOOLS_LIB;
if (!lib) {
  try { lib = path.dirname(require.resolve('firebase-tools/lib/auth.js')); }
  catch { lib = path.resolve(__dirname, '../.tools/node-v22.23.3-win-x64/node_modules/firebase-tools/lib'); }
}
const uid = 'rules-test-athlete-a';
const profile = { userId:uid, fullName:'Test athlete', photoUrl:'', sport:'Basketball', position:'', birthDate:'', heightCm:null, weightKg:null, team:'', classYear:null, experience:'Beginner', primaryGoal:'', secondaryGoals:'', updatedAt:'timestamp-string-fixture' };
const checkIn = { userId:uid, date:'2026-10-05', sleepHours:8, sleepQuality:8, energy:8, soreness:3, stress:3, motivation:8, updatedAt:profile.updatedAt };
const test = { userId:uid, id:'test', name:'10m Sprint', result:2, unit:'seconds', direction:'lower', date:checkIn.date, notes:'', protocol:'standing', createdAt:profile.updatedAt, updatedAt:profile.updatedAt };
const cases = [];
function add(name, subpath, method, authUid, expectation, value, previous) {
  const fullpath = `/databases/(default)/documents/athletes/${uid}/${subpath}`;
  const request = { path:fullpath, method, auth:authUid ? {uid:authUid} : null };
  if (value) request.resource = {data:value};
  cases.push({name, test:{expectation, expressionReportLevel:'FULL', request, ...(previous ? {resource:{data:previous}} : {}),
    functionMocks:[{function:'exists',args:[{any_value:{}}],result:{value:!!previous}}]}});
}
for (const [subpath,value] of [['profile/main',profile],['tests/test',test],['readiness/2026-10-05',checkIn]]) {
  add(`owner reads ${subpath}`,subpath,'get',uid,'ALLOW');
  add(`other athlete denied ${subpath}`,subpath,'get','rules-test-athlete-b','DENY');
  add(`signed out denied ${subpath}`,subpath,'get',null,'DENY');
  add(`owner creates ${subpath}`,subpath,'create',uid,'ALLOW',value);
  add(`other athlete cannot write ${subpath}`,subpath,'create','rules-test-athlete-b','DENY',value);
  add(`cannot spoof owner ${subpath}`,subpath,'create',uid,'DENY',{...value,userId:'other'});
  add(`owner can update ${subpath}`,subpath,'update',uid,'ALLOW',value,value);
  add(`owner can delete ${subpath}`,subpath,'delete',uid,'ALLOW');
}
add('invalid readiness rating','readiness/2026-10-05','create',uid,'DENY',{...checkIn,energy:11});
add('negative test result','tests/test','create',uid,'DENY',{...test,result:-1});
add('unsupported profile fields','profile/main','create',uid,'DENY',{...profile,role:'coach'});
add('standard sprint wrong direction','tests/test','create',uid,'DENY',{...test,direction:'higher'});
add('impossible test date','tests/test','create',uid,'DENY',{...test,date:'2026-02-30'});
add('negative height','profile/main','create',uid,'DENY',{...profile,heightCm:-1});
function falseExpressions(nodes) { const source = fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8'); const found=[]; function walk(n) { if (n.values?.some(v=>v.value===false) && n.sourcePosition.endOffset-n.sourcePosition.currentOffset<120) found.push(source.slice(n.sourcePosition.currentOffset,n.sourcePosition.endOffset)); for(const child of n.children??[]) walk(child); } nodes.forEach(walk); return found.slice(-10); }
async function main() {
  const account = require(path.join(lib,'auth.js')).getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in with the Firebase CLI first.');
  await require(path.join(lib,'requireAuth.js')).requireAuth({project:'loadfactor-c2e73',user:account.user,tokens:account.tokens,nonInteractive:true});
  const {Client} = require(path.join(lib,'apiv2.js'));
  const api = require(path.join(lib,'api.js'));
  const client = new Client({urlPrefix:api.rulesOrigin(),apiVersion:'v1'});
  const files = [{name:'firestore.rules',content:fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8')}];
  const response = await client.post('/projects/loadfactor-c2e73:test',{source:{files},testSuite:{testCases:cases.map(c=>c.test)}},{skipLog:{body:true,resBody:true}});
  const results = response.body.testResults ?? [];
  const issues = response.body.issues ?? [];
  const failed = results.map((r,i)=>({name:cases[i].name,state:r.state,falseExpressions: falseExpressions(r.expressionReports ?? [])})).filter(r=>r.state!=='SUCCESS');
  console.log(JSON.stringify({tests:results.length,expected:cases.length,failures:failed,issues:issues.map(i=>({description:i.description,severity:i.severity}))},null,2));
  if (failed.length || results.length!==cases.length || issues.some(i=>i.severity==='ERROR')) process.exitCode=1;
}
main().catch(error=>{ const message = String(error.message ?? 'Validation request failed').replace(/ya29\.[A-Za-z0-9._-]+|1\/\/[A-Za-z0-9_-]+/g,'[redacted]'); console.error(message); process.exitCode=1; });
