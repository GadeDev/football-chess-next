import test from 'node:test';
import assert from 'node:assert/strict';
import {readPlatformSubscription} from '../.test-dist/src/platform-subscription.js';
import {loadPrototype} from './helpers/prototype-vm.mjs';
const item={kind:'subscription',game_id:null,state:'active',end_at:'2099-01-01'};
function env(items,identity={user_id:'qa',state:'active'}) {return {PLATFORM_API_ORIGIN:'https://example.invalid',PLATFORM_API:{fetch:async url=>Response.json(url.includes('/users/me')?identity:{items})}};}
test('current platform entitlement, period end, cancellation, and identity are enforced',async()=>{
 for(const [items,expected] of [[[item],true],[[],false],[[{...item,state:'canceled'}],false],[[{...item,end_at:'2000-01-01'}],false],[[{...item,game_id:'other'}],false],[[{...item,end_at:'invalid'}],false]]) {
  assert.equal((await readPlatformSubscription(env(items),'test','uf:qa')).active,expected);
 }
 assert.equal((await readPlatformSubscription(env([item],{user_id:'other',state:'active'}),'test','uf:qa')).active,false);
 assert.equal((await readPlatformSubscription({PLATFORM_API:{fetch:async()=>{throw Error('offline')}}},'test','uf:qa')).active,false);
});
test('save rechecks remote subscription and preserves existing data after cancellation or network failure',async()=>{
 const p=loadPrototype();
 p.run("ogAuth={token:'test',user:{subscription:{active:true}}}; localStorage.setItem(OG_SLOT_KEY+'0','old'); ogApi=async()=>({ok:true,user:{subscription:{active:false}}});");
 assert.equal(await p.run('ogSaveSlot(0)'),false);
 assert.equal(p.run("localStorage.getItem(OG_SLOT_KEY+'0')"),'old');
 p.run("ogAuth.user={subscription:{active:true}};ogApi=async()=>{throw Error('offline')};");
 assert.equal(await p.run('ogSaveSlot(0)'),false);
 assert.equal(p.run("localStorage.getItem(OG_SLOT_KEY+'0')"),'old');
});

test('legacy billing routes are retired',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 assert.match(source,/case "POST \/billing\/subscribe":\s*case "POST \/billing\/cancel":\s*return problem\(410/);
 assert.doesNotMatch(source,/accounts\.(subscribe|cancelSubscription)\(/);
});

test('AccountStore refreshes a paid session after cancellation without a new SSO',async()=>{
 const {readFileSync}=await import('node:fs');
 const {DatabaseSync}=await import('node:sqlite');
 const source=readFileSync(new URL('../.test-dist/src/accounts.js',import.meta.url),'utf8')
  .replace('import { DurableObject } from "cloudflare:workers";','class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}')
  .replace('"./ranking"',JSON.stringify(new URL('../.test-dist/src/ranking.js',import.meta.url).href))
  .replace('"./platform-subscription"',JSON.stringify(new URL('../.test-dist/src/platform-subscription.js',import.meta.url).href));
 const {AccountStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const db=new DatabaseSync(':memory:');
 const sql={exec(q,...args){const s=db.prepare(q);const rows=s.columns().length?s.all(...args):(s.run(...args),[]);return {toArray:()=>rows};}};
 let items=[item];
 const environment=env([]);environment.PLATFORM_API.fetch=async url=>Response.json(url.includes('/users/me')?{user_id:'qa',state:'active'}:{items});
 const store=new AccountStore({storage:{sql},blockConcurrencyWhile:fn=>fn()},environment);
 const session=await store.ssoLogin({externalId:'uf:qa',name:'QA',subscribed:true},'fake-platform-token');
 assert.equal(session.user.subscription.active,true);
 assert.equal(session.user.subscription.until,'2099-01-01');
 items=[];assert.equal((await store.me(session.token)).user.subscription.active,false);
 items=[item];assert.equal((await store.me(session.token)).user.subscription.active,true);
 const legacy=await store.ssoLogin({externalId:'uf:legacy',name:'Legacy',subscribed:true});
 assert.equal(legacy.user.subscription.active,false);
 assert.equal(typeof store.subscribe,'undefined');
 await store.logout(session.token);assert.equal((await store.me(session.token)).ok,false);
 db.close();
});
