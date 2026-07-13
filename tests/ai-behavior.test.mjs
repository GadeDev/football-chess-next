// COM AIの挙動テスト（2026-07-10改修の回帰固定）
// ユーザー指摘「フォーメーションの組み合わせでKICKOFFから必ず同じ手順でシュートまで行きワンパターン」への対策:
// ①同一条件のキックオフでも試合ごとに手が変わる（重み付き抽選＋評価ゆらぎ）
// ②守備は相手の位置とランク（SS級=高コスト駒）を見て、シュートレーン封鎖・突入・受け手マークを行う
import test from "node:test";
import assert from "node:assert/strict";
import { loadPrototype } from "./helpers/prototype-vm.mjs";

test("同一条件の赤キックオフでも、AIの初手プランが試合ごとに変わる", () => {
  const { run, seedRandom } = loadPrototype();
  seedRandom(20260710);
  const plans = new Set();
  const RUNS = 16;
  for (let i = 0; i < RUNS; i++) {
    run("buildKickoffForTeam('r'); oppCommands=[]; planOpponentAI();");
    plans.add(run("JSON.stringify(oppCommands.map(c=>[c.type,c.pieceId,c.tx,c.ty]))"));
  }
  // 旧実装（上位2択85/15＋支援移動は決定的）ではほぼ1〜2通りに固定されていた
  assert.ok(
    plans.size >= 4,
    `16回のキックオフで${plans.size}通りしか出ていない（4通り以上を期待）`,
  );
});

test("守備: 青保持者がシュート圏に入ると、レーン封鎖または突入で反応する", () => {
  const { run, seedRandom } = loadPrototype();
  seedRandom(7);
  const result = run(`
    buildKickoffForTeam('b');
    (()=>{
      const h=ballHolder();
      h.x=0; h.y=-2; h.sx=0; h.sy=-2; // 赤陣ゴール前（VA段）へ（シュート脅威を作る）
      oppCommands=[];
      planOpponentAI();
      const lane=new Set(['0,-3','-1,-3','1,-3']);
      getRoute(h.x,h.y,0,-4).forEach(([x,y])=>lane.add(x+','+y));
      const laneMoves=oppCommands.filter(c=>c.type==='move'&&lane.has(c.tx+','+c.ty)).length;
      const charges=oppCommands.filter(c=>c.type==='move'&&c.tx===h.x&&c.ty===h.y).length;
      return JSON.stringify({area:calcShoot(h).area,laneMoves,charges,total:oppCommands.length});
    })()
  `);
  const r = JSON.parse(result);
  assert.notEqual(r.area, "-", "テスト前提: 保持者はシュート圏にいること");
  assert.ok(
    r.laneMoves + r.charges >= 2,
    `シュート脅威への反応が薄い（レーン封鎖${r.laneMoves}＋突入${r.charges}。合計2以上を期待）`,
  );
  assert.ok(r.total > 0, "守備コマンドが生成されていること");
});

test("守備: 保持者が遠くても、ゴール側に居ない駒は帰陣コマンドを持つ", () => {
  const { run, seedRandom } = loadPrototype();
  seedRandom(11);
  const result = run(`
    buildKickoffForTeam('b');
    (()=>{
      oppCommands=[];
      planOpponentAI();
      const h=ballHolder();
      // 「保持者より自ゴール(0,-4)側へ動く」or「保持者へ寄せる」移動が存在すること
      const reactive=oppCommands.filter(c=>c.type==='move').length;
      return JSON.stringify({reactive});
    })()
  `);
  const r = JSON.parse(result);
  assert.ok(r.reactive >= 3, `青キックオフ時の守備反応が少なすぎる（${r.reactive}件）`);
});

test("攻撃: 自陣停滞中（遅延カウント進行）は必ず前進の手を選ぶ", () => {
  // ユーザー指摘「プレイヤーが動かないとAIが自陣から出てこず時間稼ぎになる」の回帰固定
  for (const seed of [3, 17, 101]) {
    const { run, seedRandom } = loadPrototype();
    seedRandom(seed);
    const r = JSON.parse(run(`
      (()=>{
        buildKickoffForTeam('r');
        battleDelayCounts.r=2; // 遅延成立(3)寸前
        oppCommands=[];
        planOpponentAI();
        const h=ballHolder();
        const act=oppCommands.find(c=>c.pieceId===h.id||c.type==='pass'||c.type==='throughpass');
        return JSON.stringify({fromY:h.sy,act:act?{type:act.type,ty:act.ty}:null});
      })()
    `));
    assert.ok(r.act, `seed=${seed}: 保持駒の行動が無い`);
    assert.ok(
      r.act.ty > r.fromY,
      `seed=${seed}: 遅延寸前なのに前進していない（${JSON.stringify(r.act)} from y=${r.fromY}）`,
    );
  }
});

test("守備: GK脇に張るSS駒（1トップ）を常時マークする", () => {
  const { run, seedRandom } = loadPrototype();
  seedRandom(5);
  // 青保持（守備局面）: SS駒をGK前の空きマス(0,-1)に張り付かせる
  const def = JSON.parse(run(`
    (()=>{
      buildKickoffForTeam('b');
      const ss=pieces.find(p=>p.team==='b'&&p.posType==='fw');
      ss.x=0; ss.y=-1; ss.sx=0; ss.sy=-1; ss.cost=3;
      oppCommands=[];
      planOpponentAI();
      const marked=oppCommands.some(c=>c.type==='move'&&c.tx===0&&c.ty===-1);
      return JSON.stringify({marked});
    })()
  `));
  assert.ok(def.marked, "守備局面で張り付きSS駒のマスにマークが入っていない");
  // 赤保持（攻撃局面）でも見張りを残す
  const atk = JSON.parse(run(`
    (()=>{
      buildKickoffForTeam('r');
      const ss=pieces.find(p=>p.team==='b'&&p.posType==='fw');
      ss.x=0; ss.y=-1; ss.sx=0; ss.sy=-1; ss.cost=3;
      oppCommands=[];
      planOpponentAI();
      const guard=oppCommands.some(c=>c.type==='move'&&c.tx===0&&c.ty===-1);
      // 「既に同マスで待機（移動コマンドなし）」のケースも許容するため、
      // マスに乗る移動 or そのマスへ近づく移動のどちらかがあればよい
      const closing=oppCommands.some(c=>c.type==='move'&&Math.abs(c.tx-0)+Math.abs(c.ty-(-1))<=1);
      return JSON.stringify({guard,closing});
    })()
  `));
  assert.ok(atk.guard||atk.closing, "攻撃局面で張り付きSS駒への見張りが残っていない");
});

test("ヘッダー相手名: 明示COM対戦は「COM」、秘匿フォールバックはペルソナ名", () => {
  const { run, seedRandom } = loadPrototype();
  seedRandom(9);
  // 明示的なCOM対戦（モード選択→COM対戦 相当＝予約なしのresetBtn）→「COM」表示
  const explicit = JSON.parse(run(`
    (()=>{ comPersonaNext=null; document.getElementById('resetBtn').click();
      return JSON.stringify({opp:headerTeamNames()[1],stealth:comPersona.stealth}); })()
  `));
  assert.equal(explicit.opp, "COM");
  assert.equal(explicit.stealth, false);
  // オンラインマッチングからの秘匿フォールバック（aiOpponentNameで予約）→ペルソナ名表示
  const stealth = JSON.parse(run(`
    (()=>{ const n=aiOpponentName(); document.getElementById('resetBtn').click();
      return JSON.stringify({flash:n,opp:headerTeamNames()[1],stealth:comPersona.stealth}); })()
  `));
  assert.equal(stealth.stealth, true);
  assert.equal(stealth.opp, stealth.flash, "成立演出の名前とヘッダー名が一致すること");
  assert.notEqual(stealth.opp, "COM", "秘匿フォールバックでCOMと表示してはいけない");
});

test("攻撃: 受け手の隣の強い駒（SS級）リスク関数が働いている", () => {
  const { run } = loadPrototype();
  const result = run(`
    buildKickoffForTeam('r');
    (()=>{
      // 赤陣の最奥（青から最も遠い）の駒を基準にする＝初期状態では青は誰も届かない
      const red=pieces.filter(p=>p.team==='r'&&p.posType!=='gk').sort((a,b)=>a.y-b.y)[0];
      const far=aiReachThreatAt(red,red.x,red.y);
      // 高ランク（SS級=コスト3）の青駒を隣にワープさせるとリスクが正になる
      const blue=pieces.find(p=>p.team==='b'&&p.posType!=='gk');
      blue.x=red.x; blue.y=red.y+1; blue.cost=3;
      const near=aiReachThreatAt(red,red.x,red.y);
      return JSON.stringify({near,far});
    })()
  `);
  const r = JSON.parse(result);
  assert.equal(r.far, 0, `誰も届かない位置でリスクが出ている（far=${r.far}）`);
  assert.ok(r.near > 0, `隣接する高ランク駒のリスクが0（near=${r.near}）`);
});

test("攻撃: 1ターン先読みはゴールへつながる地点を高く評価する", () => {
  const { run } = loadPrototype();
  const result = JSON.parse(run(`
    (()=>{
      buildKickoffForTeam('r');
      const p=ballHolder();
      const deep=aiFollowUpAttackValue(p,0,-2);
      const advanced=aiFollowUpAttackValue(p,0,2); // 縦8マス化：VA(y=3)の1マス手前
      return JSON.stringify({deep,advanced});
    })()
  `));
  assert.ok(result.advanced > result.deep,
    `前進地点の次手期待が自陣より高くない（deep=${result.deep}, advanced=${result.advanced}）`);
});

test("攻撃: 負けている後半終盤は攻撃性が上がる", () => {
  const { run } = loadPrototype();
  const result = JSON.parse(run(`
    (()=>{
      state.half='後半'; state.turn=14;
      state.scoreSelf=2; state.scoreOpp=0; const losing=aiAttackUrgency();
      state.scoreSelf=0; state.scoreOpp=2; const winning=aiAttackUrgency();
      return JSON.stringify({losing,winning});
    })()
  `));
  assert.ok(result.losing > 20, `負けている終盤の攻撃性が弱い（${result.losing}）`);
  assert.ok(result.winning < 0, `リード中終盤の抑制が働かない（${result.winning}）`);
});

test("攻撃: ゴール前に受け手がいればパスから同ターンにシュートする", () => {
  for (const seed of [1, 7, 17]) {
    const { run, seedRandom } = loadPrototype();
    seedRandom(seed);
    const commands = JSON.parse(run(`
      (()=>{
        pieces=[
          {id:1,team:'r',posType:'mf',x:0,y:2,sx:0,sy:2,cost:2.5},
          {id:2,team:'r',posType:'fw',x:1,y:3,sx:1,sy:3,cost:1},
          {id:3,team:'r',posType:'gk',x:0,y:-3,sx:0,sy:-3,cost:2},
          {id:4,team:'b',posType:'gk',x:0,y:4,sx:0,sy:4,cost:2},
          {id:5,team:'b',posType:'df',x:-1,y:4,sx:-1,sy:4,cost:2},
        ];
        ball={target:'piece',pieceId:1,x:0,y:2};
        oppCommands=[]; aiPlanHolder(pieces[0]);
        return JSON.stringify(oppCommands);
      })()
    `));
    assert.deepEqual(
      commands.map((c) => [c.type, c.pieceId, c.targetId ?? null]),
      [["pass", 1, 2], ["shoot", 2, null]],
      `seed=${seed}: ゴール前へのラストパスより別の手を選んだ`,
    );
  }
});

test("攻撃: 直接届かないゴール前へ中継パスからシュートまで連鎖する", () => {
  const { run, seedRandom } = loadPrototype();
  seedRandom(11);
  const result = JSON.parse(run(`
    (()=>{
      pieces=[
        {id:1,team:'r',posType:'mf',x:0,y:0,sx:0,sy:0,cost:2.5},
        {id:2,team:'r',posType:'mf',x:0,y:2,sx:0,sy:2,cost:2},
        {id:3,team:'r',posType:'fw',x:1,y:4,sx:1,sy:4,cost:3},
        {id:4,team:'r',posType:'gk',x:0,y:-3,sx:0,sy:-3,cost:2},
        {id:5,team:'b',posType:'gk',x:0,y:4,sx:0,sy:4,cost:2},
        {id:6,team:'b',posType:'df',x:-1,y:4,sx:-1,sy:4,cost:2},
      ];
      ball={target:'piece',pieceId:1,x:0,y:0};
      oppCommands=[]; aiPlanHolder(pieces[0]);
      return JSON.stringify({
        direct:isPassRangeRed(pieces[0],pieces[2].x,pieces[2].y),
        commands:oppCommands,
      });
    })()
  `));
  assert.equal(result.direct, false, "テスト前提: 保持者からフィニッシャーへ直接は届かないこと");
  assert.deepEqual(
    result.commands.map((c) => [c.type, c.pieceId, c.targetId ?? null]),
    [["pass", 1, 2], ["pass", 2, 3], ["shoot", 3, null]],
  );
});

test("COM編成: SSエース型3チームとSSなし連携型3チームをコスト16で使い分ける", () => {
  const { run } = loadPrototype();
  const teams = JSON.parse(run(`JSON.stringify(COM_PERSONAS.map(persona=>{
    comPersona=persona;
    const team=comTeamDef();
    return {
      name:persona.name,
      total:team.reduce((sum,p)=>sum+costOf(p.id),0),
      ss:team.filter(p=>p.id%5===0).length,
    };
  }))`));
  assert.equal(teams.filter((team) => team.ss > 0).length, 3, "SSありCOMが3チームではない");
  assert.equal(teams.filter((team) => team.ss === 0).length, 3, "SSなしCOMが3チームではない");
  for (const team of teams) assert.equal(team.total, 16, `${team.name}のチームコストが16ではない`);
});

test("攻撃戦術: SSありはエースへ預け、SSなしは前方スペースを使う", () => {
  const decide = (aceCost) => {
    const { run, seedRandom } = loadPrototype();
    seedRandom(7);
    return JSON.parse(run(`
      (()=>{
        pieces=[
          {id:1,team:'r',posType:'mf',x:0,y:0,sx:0,sy:0,cost:2},
          {id:2,team:'r',posType:'fw',x:0,y:1,sx:0,sy:1,cost:${aceCost}},
          {id:3,team:'r',posType:'mf',x:-2,y:-1,sx:-2,sy:-1,cost:2},
          {id:4,team:'r',posType:'gk',x:0,y:-3,sx:0,sy:-3,cost:2},
          {id:10,team:'b',posType:'gk',x:0,y:4,sx:0,sy:4,cost:2},
          {id:11,team:'b',posType:'df',x:-1,y:4,sx:-1,sy:4,cost:2},
        ];
        ball={target:'piece',pieceId:1,x:0,y:0};
        oppCommands=[]; aiPlanHolder(pieces[0]);
        return JSON.stringify({mode:aiTacticalProfile().attackMode,commands:oppCommands});
      })()
    `));
  };
  const withSS = decide(3);
  const withoutSS = decide(2.5);
  assert.equal(withSS.mode, "ace");
  assert.deepEqual(
    withSS.commands.map((c) => [c.type, c.targetId ?? null]),
    [["pass", 2]],
    "SSありなのにエースへボールを集めていない",
  );
  assert.equal(withoutSS.mode, "collective");
  assert.equal(withoutSS.commands[0]?.type, "throughpass", "SSなしで連携型のスペース攻撃を選んでいない");
});

test("守備戦術: 相手SSが保持者から遠くても専属マーカーを付ける", () => {
  const defend = (aceCost) => {
    const { run, seedRandom } = loadPrototype();
    seedRandom(4);
    return JSON.parse(run(`
      (()=>{
        pieces=[
          {id:1,team:'b',posType:'mf',x:2,y:1,sx:2,sy:1,cost:2},
          {id:2,team:'b',posType:'fw',x:-2,y:0,sx:-2,sy:0,cost:${aceCost}},
          {id:3,team:'b',posType:'gk',x:0,y:4,sx:0,sy:4,cost:2},
          {id:11,team:'r',posType:'df',x:-2,y:-1,sx:-2,sy:-1,cost:2.5},
          {id:12,team:'r',posType:'df',x:-1,y:-1,sx:-1,sy:-1,cost:2},
          {id:13,team:'r',posType:'df',x:0,y:-1,sx:0,sy:-1,cost:2},
          {id:14,team:'r',posType:'mf',x:1,y:-1,sx:1,sy:-1,cost:2},
          {id:15,team:'r',posType:'gk',x:0,y:-3,sx:0,sy:-3,cost:2},
        ];
        ball={target:'piece',pieceId:1,x:2,y:1};
        oppCommands=[]; planOpponentAI();
        return JSON.stringify(oppCommands);
      })()
    `));
  };
  const withSS = defend(3);
  const withoutSS = defend(2.5);
  assert.ok(
    withSS.some((c) => c.type === "move" && c.tx === -2 && c.ty === 0),
    "相手SSのいるマスへ専属マーカーを付けていない",
  );
  assert.ok(
    !withoutSS.some((c) => c.type === "move" && c.tx === -2 && c.ty === 0),
    "SSなしでも不要な専属マークを続けている",
  );
});
