/* eslint-disable @typescript-eslint/no-require-imports -- Firebase CLI uses CommonJS. */
/* Candidate-rule tests only. No deployments, writes or real athlete data. */
const fs=require('node:fs'),path=require('node:path');
const lib=process.env.FIREBASE_TOOLS_LIB||path.resolve(__dirname,'../.tools/node-v22.23.3-win-x64/node_modules/firebase-tools/lib');
const uid='video-test-athlete',id='c392aa96-30e4-4ae4-81c0-cd3dc4111bb4',file={size:5000,contentType:'video/mp4'};
const cases=[];
function add(name,method,authUid,expectation,metadata=file,reportId=id){cases.push({name,test:{expectation,request:{path:`/b/loadfactor-c2e73.firebasestorage.app/o/athletes/${uid}/videos/${reportId}/source`,method,auth:authUid?{uid:authUid}:null,resource:metadata},resource:file}});}
add('owner read','get',uid,'ALLOW');add('other account read','get','other','DENY');add('signed out read','get',null,'DENY');
add('owner upload','create',uid,'ALLOW');add('other account upload','create','other','DENY');add('signed out upload','create',null,'DENY');
add('owner delete','delete',uid,'ALLOW');add('other account delete','delete','other','DENY');
add('oversized video','create',uid,'DENY',{...file,size:101*1024*1024});add('empty video','create',uid,'DENY',{...file,size:0});
add('non-video content','create',uid,'DENY',{...file,contentType:'text/html'});add('invalid report ID','create',uid,'DENY',file,'not-a-report-id');
async function main(){
  const account=require(path.join(lib,'auth.js')).getGlobalDefaultAccount();if(!account)throw Error('Firebase CLI sign-in required.');
  await require(path.join(lib,'requireAuth.js')).requireAuth({project:'loadfactor-c2e73',user:account.user,tokens:account.tokens,nonInteractive:true});
  const {Client}=require(path.join(lib,'apiv2.js')),api=require(path.join(lib,'api.js'));
  const client=new Client({urlPrefix:api.rulesOrigin(),apiVersion:'v1'});
  const response=await client.post('/projects/loadfactor-c2e73:test',{source:{files:[{name:'storage.rules',content:fs.readFileSync(path.resolve(__dirname,'../storage.rules'),'utf8')}]},testSuite:{testCases:cases.map(c=>c.test)}},{skipLog:{body:true,resBody:true}});
  const results=response.body.testResults??[],issues=response.body.issues??[],failures=results.map((r,i)=>({name:cases[i].name,state:r.state})).filter(r=>r.state!=='SUCCESS');
  console.log(JSON.stringify({tests:results.length,expected:cases.length,failures,issues:issues.map(i=>({description:i.description,severity:i.severity}))},null,2));
  if(results.length!==cases.length||failures.length||issues.some(i=>i.severity==='ERROR'))process.exitCode=1;
}
main().catch(error=>{console.error(String(error.message??'Rule checks failed').replace(/ya29\.[A-Za-z0-9._-]+|1\/\/[A-Za-z0-9_-]+/g,'[redacted]'));process.exitCode=1;});
