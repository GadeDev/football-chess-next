import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrototype } from './helpers/prototype-vm.mjs';

test('guest ace prompt preserves formation and scopes rankings to online matches', () => {
 const p = loadPrototype();
 const before = p.run('JSON.stringify(ogDeck)');
 p.run("idShowPrompt('feature')");
 assert.equal(p.getEl('idHeading').textContent, 'エース駒は無料IDで使えます');
 assert.match(p.getEl('idBody').textContent, /オンライン対戦の成績/);
 p.getEl('idDismiss').click();
 assert.equal(p.run('JSON.stringify(ogDeck)'), before);
});
test('only the first guest victory prompts, while draws, losses and members do not', () => {
 const p = loadPrototype();
 p.run("state.scoreSelf=0; state.scoreOpp=1; idPromptAfterFirstWin();");
 assert.equal(p.run('idFirstWinSeen'), false);
 p.run("state.scoreSelf=1; idPromptAfterFirstWin();");
 assert.equal(p.run('idFirstWinSeen'), false);
 p.run("ogAuth={token:'test',user:{name:'Member'}}; state.scoreSelf=2; idPromptAfterFirstWin();");
 assert.equal(p.run('idFirstWinSeen'), false);
 p.run("ogAuth={token:null,user:null}; idPromptAfterFirstWin();");
 assert.equal(p.getEl('idHeading').textContent, '初勝利、おめでとうございます');
 assert.equal(p.run("localStorage.getItem('fc.idPrompt.firstWin')"), '1');
 p.getEl('idDismiss').click();
 p.getEl('idHeading').textContent='closed';
 p.run('idPromptAfterFirstWin()');
 assert.equal(p.getEl('idHeading').textContent,'closed');
 p.run('idFirstWinSeen=false; idPromptAfterFirstWin()');
 assert.equal(p.getEl('idHeading').textContent,'closed');
});
test('signed-in players do not receive any registration prompt', () => {
 const p=loadPrototype();
 p.run("ogAuth={token:'test',user:{name:'Member'}};");
 for(const scene of ['menu','feature','result']) p.run(`idShowPrompt('${scene}')`);
 assert.equal(p.getEl('idHeading').textContent,'');
});
test('registration saves the current formation and uses register mode with an SSO return', () => {
 const p=loadPrototype(); let target='';
 p.context.location.assign=url=>{target=url;};
 p.run("idShowPrompt('menu')"); p.getEl('idSignup').click();
 const url=new URL(target);
 assert.equal(url.searchParams.get('mode'),'register');
 assert.equal(url.searchParams.get('return'),'/api/auth/launch?to=https%3A%2F%2Fmini.footballchess.io');
 assert.ok(p.run('localStorage.getItem(OG_DECK_KEY)'));
});
