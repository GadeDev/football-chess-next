import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Run the compiled AccountStore SQL against SQLite with an in-memory DO storage adapter.
const source=readFileSync(new URL('../.test-dist/src/accounts.js',import.meta.url),'utf8')
 .replace('import { DurableObject } from "cloudflare:workers";', 'class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }')
 .replace('"./ranking"',JSON.stringify(new URL('../.test-dist/src/ranking.js',import.meta.url).href));
const {AccountStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('free and expired registered players rank, guests cannot write results, prior scores remain',async()=>{
 const db=new DatabaseSync(':memory:');
 const sql={exec(query,...args){const statement=db.prepare(query);const rows=statement.columns().length?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>rows};}};
 const store=new AccountStore({storage:{sql},blockConcurrencyWhile:fn=>fn()},{});
 for(const [id,active] of [['free',0],['expired',1]]){
  sql.exec('INSERT INTO users(id,name,name_key,created_at,sub_active,sub_until) VALUES(?,?,?,?,?,?)',id,id,id,'2026-01-01',active,'2000-01-01');
 }
 sql.exec('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)','token','free','2026-01-01',Date.now()+60000);
 assert.deepEqual((await store.recordRankedResult('free','expired','b')).recorded,['b','r']);
 let result=await store.rankingTop('token');
 assert.equal(result.rankings.length,2);
 assert.equal(result.me.wins,1);
 assert.equal(result.me.rank,1);
 assert.equal(result.rankings.find(r=>r.name==='expired').losses,1);
 assert.deepEqual((await store.recordRankedResult(null,null,'b')).recorded,[]);
 assert.deepEqual((await store.recordRankedResult('free','free','b')).recorded,[]);
 assert.equal((await store.rankingTop(null)).me,undefined);
 assert.equal((await store.rankingTop('token')).me.wins,1);
 db.close();
});
