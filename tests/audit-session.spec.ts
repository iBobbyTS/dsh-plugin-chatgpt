import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChatGptAuth } from '../src/auth/manager.ts'
import { ChatGptSession } from '../src/session.ts'
const dirs:string[]=[]
const originalFetch=globalThis.fetch
const enc=(x:any)=>Buffer.from(JSON.stringify(x)).toString('base64url')
const makeSession=()=>{
 const stateDir=mkdtempSync(join(tmpdir(),'auth-followup-'));dirs.push(stateDir)
 const auth=new ChatGptAuth({stateDir,agentNameHint:'Audit',endpoints:{preferredPort:0,verifyIdTokenSignature:async()=>{}}})
 const adapter={listModels:async()=>[],forgetListing:()=>{}} as any
 return {auth,session:new ChatGptSession(auth,adapter)}
}
const response=(nonce:string,scope:string)=>new Response(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope,id_token:`${enc({alg:'none'})}.${enc({iss:'https://auth.openai.com',aud:'oaiapp_A',sub:'synthetic-user',nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}.`}),{status:200})
it('does not adopt cancelled exchanges and retains identity-only sign-in', async () => {
try{
 const {auth,session}=makeSession()
 const opened=await session.begin(); const p=new URL(opened.pending!.url).searchParams
 let release!:()=>void,entered!:()=>void
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r)
 globalThis.fetch=async()=>{entered();await gate;return response(p.get('nonce')!,'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct')}
 const submitting=session.submit(`${opened.pending!.redirectUri}?code=synthetic&state=${p.get('state')}&client_id=oaiapp_A`)
 await started
 const signOutResult=await session.signOut(); const signedInAfterSignOut=signOutResult.status.signedIn
 release(); await submitting
 assert.equal(signedInAfterSignOut, false)
 assert.equal(auth.status().signedIn, false)
 const second=makeSession();const begun=await second.session.begin();const params=new URL(begun.pending!.url).searchParams
 globalThis.fetch=async()=>response(params.get('nonce')!,'openid profile email offline_access resource.invoke')
 const result=await second.session.submit(`${begun.pending!.redirectUri}?code=synthetic&state=${params.get('state')}&client_id=oaiapp_A`)
 assert.equal(result.planUsageDenied, true)
 assert.equal(result.accounts.length, 1)
 await assert.rejects(second.auth.usable(), /plan usage is disabled/)
}finally{globalThis.fetch=originalFetch;for(const dir of dirs)rmSync(dir,{recursive:true,force:true})}
})
