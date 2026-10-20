import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrototype } from './helpers/prototype-vm.mjs';

test('formation saving requires a live subscription and preserves saved slots when denied',async()=>{
 const p=loadPrototype();
 p.run("ogApi=async()=>({ok:true,user:ogAuth.user});");
 p.run("localStorage.setItem(OG_SLOT_KEY+'0','previous'); ogAuth={token:null,user:null};");
 assert.equal(await p.run('ogSaveSlot(0)'),false);
 p.run("ogAuth={token:'test',user:{name:'Test',subscription:{active:false}}};");
 assert.equal(await p.run('ogSaveSlot(0)'),false);
 assert.equal(p.run("localStorage.getItem(OG_SLOT_KEY+'0')"),'previous');
 p.run("ogAuth.user.subscription={active:true,until:'2000-01-01T00:00:00Z'};");
 assert.equal(await p.run('ogSaveSlot(0)'),false);
 p.run("ogAuth.user.subscription={active:true,until:'2099-01-01T00:00:00Z'};");
 assert.equal(await p.run('ogSaveSlot(0)'),true);
 assert.equal(p.run("JSON.parse(localStorage.getItem(OG_SLOT_KEY+'0')).formationId"),p.run('ogDeck.formationId'));
 assert.equal(await p.run('ogSaveSlot(6)'),false);
});
test('free registered players receive rank controls and current copy in all seven languages',()=>{
 const p=loadPrototype();
 p.run("ogAuth={token:'test',user:{name:'Test',subscription:{active:false}}}; ogOpenCostPicker(0);");
 assert.equal(p.run('ogIsLoggedIn()'),true);
 assert.equal(p.run('ogIsPremium()'),false);
 assert.ok(p.getEl('ogCostHint').textContent);
 assert.equal(p.run('Object.keys(registrationBenefitCopy).length'),7);
});
