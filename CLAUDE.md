# CLAUDE.md — Football Chess Web版プロトタイプ 開発ガイド

Claude Code がこのリポジトリで作業する際の指針。詳細な背景は `HANDOFF.md` を参照。

## プロジェクト概要
- Unity製「Football Chess」（サッカー×将棋の同時ターン制対戦）を Web/PWA へ移植中。
- 現行のプレイ可能プロトタイプは単一ファイル `football-chess-prototype.html`（画像はbase64埋め込み、外部依存なし）。ダブルクリックで動作、スマホ対応。
- 対人対戦化はCloudflare Workers + Durable Objectsで追加中。`src/index.ts` がUniversoFutbol配下の対戦ルームAPI、`src/game-core.ts` がサーバー権威化に向けた純粋ゲームロジック抽出先。
- **現在の正しい作業対象はこのフォルダ**（`/Users/yanagiho-mba/football-chess-next/football-chess-repo/`）。`football-chess-next-clone` は別系統なので、このプロトタイプ修正では触らない。
- 方針：広告なし・サブスク課金・スマホ前提。**「面白く楽しめればよい、細部はおまかせ」**。グラフィック再現を重視。
- 正典＝Unity版実装。Unityソースは `/Users/yanagiho-mba/football-chess-unity-source/`（`Assets/_Chess/Scripts/`）。数値が食い違う場合は基本Unity実装を優先。CellDef準拠で1マス最大3駒。
- ユーザーは非エンジニア。**日本語で対応**。

## アーキテクチャ
- 現在は「単一HTMLのローカルプロトタイプ」＋「Cloudflare対人ルーム基盤」の二層構成。
- Cloudflare側の正式コンテンツパス想定は `/universofutbol/football-chess`、API prefix は `/api/universofutbol/football-chess`。
- `MatchRoom` Durable Object は1試合1インスタンス。青/赤/観戦者の席割り当て、WebSocket接続、コマンド受信、ルーム状態保存を担当。
- `src/game-core.ts` には盤面、初期配置、確率計算、seeded RNG、コマンド検証、サーバー側ターン解決の初期版を抽出済み。
- 青赤両方の `match.intent` が揃うと、`MatchRoom` は `resolveServerTurn` を呼び、移動/ドリブル/通常パス/スルーパス/こぼれ球/オフサイド/タックル/ファウル/PK/FK/CK/GK/シュート/得点後キックオフまでの結果イベントを `match.turn.resolved` で配信する。
- `football-chess-prototype.html` にはオンライン対戦バーを追加済み。`ROOM作成` / `参加` でWorkerへ接続し、オンライン中の `TURN END` はローカルAIではなく `match.intent` を送る。
- オンラインバーは `URL` ボタンで `?room=...` 共有URLをコピーでき、そのURLを開くと自動参加する。`退出` / `投了` / `再戦` も実装済み。再戦はフルタイムまたは投了後、青赤両者が希望すると同じROOMでターン1から再開する。ブラウザは `localStorage` にオンライン用 `clientId` を保持するため、リロード後も同じ席へ復帰しやすい。
- オンラインバーには表示名入力、青/赤の席、観戦人数、自分の席、送信済みマークを出すロスター行がある。表示名は `localStorage` に保存し、接続時の `name` パラメータと接続後の `client.hello` でROOMに反映する。`room.presence` / `match.intent.received` で更新され、観戦者にも同じ席状況が見える。
- 観戦者はスナップショット/ターン解決後も `phase='replay'` の読み取り専用を維持し、TURN ENDボタンもdisabledにする。観戦者から `match.intent` は送らない。
- `MatchRoom` は片側が `match.intent` を送った時点で3分の入力期限を設定する。期限までに相手が送らなければ、未送信側は空コマンドとしてサーバーでターン解決する。
- `MatchRoom` は `cleanupAt` を持つ。作成後未接続/全員退出のROOMは30分後、終了済みROOMは全員退出後6時間で `room_state` / `room_events` を削除する。WebSocket接続がある間は掃除予約を消し、観戦者の退出/切断でも `room.presence` を再配信する。
- オンライン時もサーバー側で15ターンハーフ、seeded AT（現HTML準拠: 前半0〜1/後半1〜3）、ハーフタイム後半キックオフ、フルタイム終了を処理する。`turn.additionalTurns` がスナップショットに含まれ、ブラウザ側はAT/ハーフタイム/フルタイムのイベントをログとカットインで再生する。
- ブラウザ側は `match.turn.resolved` を受けて `TurnEvent` を再生し、最終盤面はサーバースナップショットで同期する。通常移動/ドリブルの駒移動、シュートゴール/ブロック/ミス/GKセーブ、パス/スルーパス/パス失敗、パスカット、こぼれ球確保、オフサイド、PK/FK、CK/GK系の代表カットインとボール軌跡はオンライン再生にも反映済み。
- `MatchRoom` は `match.leave` / `match.resign` / `match.rematch.request` も受ける。明示退出は席と保留入力を解放、投了は即 `finished`、再戦は両者同意でサーバースナップショットを初期化する。

## 単一HTML内
- CSS+JS全部入り。ロジックは1つの `<script>` ブロック（末尾付近）。
- 状態は `state` オブジェクト：`turn/half/scoreSelf/scoreOpp/selected/mode/expanded/ballSelected/popup/atFirst/atSecond/matchOver/phase`。
  - `phase`: `'input'`（仕込み中）/ `'replay'`（再生中）/ `'ended'`（試合終了）。
- 重要グローバル：`myCommands`/`oppCommands`（予約操作）、`chainHolderId`（論理ボール保持駒）、`ball`（`{target:'piece'|'cell', pieceId, x, y}`）、`MAX_PER_CELL=3`、`REGULAR_TURNS=15`、`COLS`(5列)/`ROWS`(8行)、`BOARD`(エリア定義)。
- 盤座標：青(b)は -Y 方向（敵ゴール y=-3）へ攻める／赤(r)は +Y 方向（自ゴール y=4）へ。`.board` のCSSアスペクト比は画像実寸に合わせ `705/1143`。
- オンライン時は `localPlayerTeam()` が操作チームを返す。オフラインでは従来通り青固定、オンラインでは割り当てられた青/赤席を操作する。自分判定を新規追加する場合、`team==='b'` 固定に戻さないこと。
- ローカルHTMLを `127.0.0.1:5174` などから配信する場合、オンラインAPIは自動で `127.0.0.1:8787/api/universofutbol/football-chess` へ向く。Cloudflare本番配信では同一originのAPIを使う。

## 実装済み機能（このプロトタイプの現状）
- 盤面/エリア、デフォルト編成、Unity駒画像、ボール2状態、パス範囲24方向、確率テーブル一式。
- **同時ターン制**（仕込み→AI裏で計画→「TURN END（決定）」でマージ→リプレイ再生）。
- **シュート判定フロー**（`resolveShootCommand`）：①経路上の敵DFで確定ブロック ②PA/VAテーブルでDFブロック抽選（唯一の確率ゲート）③GK位置判定（コース差±1でキャッチ）。PK75%/FK50%固定。下部固定ボタンは廃止済み。ボール選択時の弧ポップアップ内に、シュート可能エリアにいる場合のみ「SHOOT」項目が現れ、そこから`tryShoot`を呼ぶ（`buildSelectItems`/`renderSelectFan`）。
- **こぼれ球共通処理**：`placeLooseBall`/`pickupLooseBall`（コスト最高→ホスト優先→id昇順で確保）。**クリア処理**（自陣PA/GAでの守備成功時は中盤方向へ1マス押し出し `clearPushCell`）。こぼれ球アイコン(`.ballfree`)は駒(`.piece`)と同じ「セル幅%＋max-width上限」方式でサイズ指定（固定pxではない。画面幅変化に連動）。
- **オフサイド**：方向補正済み `calcOffside`（`attackDir`でチーム別）＋成立後処理 `handleOffside`（位置戻し＋こぼれ球）。通常パス着地で自動判定。
- **Unity Calculateフェーズ寄せ**：`PrepareMoveOperations`準拠で「着地パス受け手の通常移動→非移動→その他移動」にソート。`mIsMoveBall`相当の `turnBallMoved` で、ドリブル接触時とボール未移動ターン末のタックルを通常処理に統合。フリーボール確保時は `lastHadBallTeam` を見て、同チーム回収ならターン開始位置ベースのオフサイドも判定する。
- **FOUL/パス確率**：FOUL演出/PK/FKはUnity `TackleAsync` 準拠で、ボール保持チームから見た攻撃側2列（GA/PA/VA/Cross）のみ。中盤などではファウル抽選に当たっても通常タックルへ落ちる。PASS確率表示はUnity `MoveRangeProvider.CalculatePassSuccessProbability` 準拠で、味方がいるマスのみ `経路上FlyingPass成功率の積 × 着地LandingPass成功率` を表示。空マス/相手だけのマスはスルーパス候補なのでPASS確率テキストを出さない。
- **ゴール後リキックオフ**：Unity `ReKickoffSetup` / `GetReKickOffTeamType` 準拠で、得点後は失点側ボールのキックオフ配置へ戻す。PA/GAへドリブル到達しただけでは得点にせず、得点はシュート/PK/FKなどの解決からのみ発生させる。
- **遅延行為/消極的戦術**：遅延行為はUnity条件に合わせ、「ターン開始時にボールを持っていたチームが、ターン終了時も同じチームとして自陣保持している場合のみ」カウントする。消極的戦術は「ボールが下2マス外、かつ対象チームの9コマ以上が下2マス」に合わせている。PassiveTacticsマスタJSONはUnityローカルに未同梱のため、PassCut/Tackleのデバフ量は現状-20%近似。
- **シュート失敗後のCK/GK**：通常シュート失敗後のCK/GKリトライはUnity現行 `ShootAsync` に合わせ、初回CK後の追加CK判定が過剰連鎖しないようにしている。PK/FK失敗後のCKループはUnity現行のタックル/ファウル処理に近い既存ループを維持。
- **15ターン制**：前半15＋AT(0〜1)、後半15＋AT(1〜3)。ChessClockはAT中「45+N」「90+N」表記。
- **ボール軌跡演出**：Unity版のTrailRenderer風に、パス/スルーパス/ドリブル/シュート/オンライン再生イベントで `animateBallFlight` を使う。オンラインでは `pass.cut` に `from` と `cutAt` を持たせ、カット地点までの軌跡とクリア移動を再生する。セットプレー由来の `shot.saved` / `shot.goal` には `details.kickLogs` が入り、CKカットイン再生に使う。
- **選択UI（Unity風＋独自調整）**：マスタップ→**弧状ポップアップ**で駒/ボールを選択（`renderSelectFan`/`#selectFan`、-60°〜+60°の弧）。駒1体のみは1タップで即選択。項目2つ以上は「タップ→弧→項目タップ（ポップ演出）→選択確定→範囲表示」。**選択確定後にのみ**移動/パス範囲をハイライト（大きな脈動円）。範囲外タップでキャンセル。ボールは常に独立項目（保持球は保持駒の隣、こぼれ球は独立）。
  - `onPieceClick`は、駒選択中に「有効な移動先/パス先として、相手駒や別の自駒が乗っているマス」をタップした場合、`onCellClick`と同じ判定（`isMovable`/`isPassable`）を先に行ってから通す。個別駒のクリックハンドラが`stopPropagation`でマスのクリックを奪うため、この処理がないと「相手駒のいるマスへ移動/パスできない」バグになる。
- **移動先/パス先ゴースト**：自分の予約コマンドの移動先/パス先に半透明プレビュー（`.ghost`、input時のみ・自分のみ）。既存駒より手前(z-index高め)・点線の丸枠＋点滅・セル中心から少しオフセットして描画し、既存駒と重なっても視認できるようにしている。
- 演出（カットイン）は、パス／ドリブルとも「経路上または着地/移動先マスに敵駒がいて、実際に競り合い・奪取判定が起こり得る場合」のみ発火（`hasDefensiveContact`）。敵が誰もいない「素通り」では出さない。
- **コマンド種別(type)の決定原則（重要・複数回の回帰の元凶）**：`move`/`dribble`/`pass`/`throughpass`のtypeは、常に「ユーザーがどの行動を選んだか」だけで決まる。仕込み側(`movePiece`)・実行側(`execCommand`)のどちらも、実行時のライブなボール保持状態(`ballHolder()`)を見て暗黙にtypeを上書きしてはならない。スルーパス（`doPassToCell`、スペースへのパス）は`movePiece`を一切経由しない別経路。過去に「ballHolder()でcarryを上書きする」修正を入れて別のバグを誘発したことがあるため、今後この手のライブ状態参照は要注意。
- **アウトゲーム（タイトル/ホーム/編成/設定。2026-07-06移植）**：起動時にタイトル(`#ogTitle`)→タップでホーム(`#ogHome`)→KICK OFFで試合。Unity `TitleMain`/`HomeMain`/`UIDeckEditDialog` 準拠。編成はコスト5段階(1〜3)・チーム上限16（Unity `TeamDef.MaxTeamCost`。**増加時のみ**超過を拒否）・1マス自チーム3体まで・フォーメーション6種＋保存スロット6。`TeamFormationMaster` はローカル未同梱のため6種は近似定義（#1はDefaultTeamMaster準拠で合計18.5=現行既定編成そのまま）。デッキは `localStorage`（`fcPrimaryDeck` / `fcDeckSlot0-5` / `fcClubName`）に保存し、**オフライン試合の青チームのみ**反映（`rebuildDefaultPieces` が `playerTeamDef()` を使用。赤AIとオンラインはサーバー/`DEFAULT_TEAM` のまま）。素材は `outgame_assets.json`（base64ソース）→ `--og*` CSS変数（`<style id="ogVars">`）。`?room=` 付き共有URLはアウトゲームをスキップして従来どおり自動参加。試合画面のHOMEボタンでホームへ戻れる。
- 移動プレビューの `.ghost` CSSは `.board .ghost` にスコープ済み（`.btn.ghost` ボタンとの衝突で下部ボタン列が崩れていたのを修正）。セレクタを戻さないこと。
- パス／スルーパス予約済みの駒（`chainPassedIds`で記録）は、同じターンに通常移動を追加できる。スペースへのスルーパス後にパスを出した駒を走らせても、`throughpass`を消さず`move`を追加する。ドリブルは「ボールを運ぶ」操作なので、同じ駒のパス/シュートとは排他。

## 次の残作業
- オンライン対戦への編成反映。現状デッキはオフライン青のみ。サーバー権威化するには `match.intent` 前のROOM参加時にデッキを送り、`src/game-core.ts` 側で検証（上限16・配置範囲・1マス3体）して初期盤面を作る必要がある。
- Unity版との差異をさらに潰す。優先は `StateBattleCalculate` 周辺の同時解決エッジケース、PK/FK後のCK/GK連鎖、シュートブロック順、消極的戦術マスタの正式値確認。
- サーバー権威化の回帰テストを増やす。`src/game-core.ts` に対して、HTML版/Unity版から拾った固定盤面・固定乱数のケースをテスト化する。
- オンライン再生の完全対応。現状は主要 `TurnEvent` を再生済みだが、全イベントをUnity風の正確な順序・間・カットイン・軌跡に寄せる。
- 本番運用準備。UniversoFutbol配下の正式ルーティング、会員/サブスク導線、ROOM作成制限、レート制限、観戦共有UX、エラー復帰表示を詰める。
- ~~公開URLでのプロトタイプHTML配信~~ → 2026-07-06 に static assets 方式で実装済み（下記デプロイ欄参照）。
- PWA/スマホ仕上げ。横幅の狭い端末でのオンラインバー、長い表示名、リプレイ中のタップ抑制、効果音/触覚フィードバックの有無を実機寄りに確認する。

## 検証方法
- **構文チェック**：`<script>`〜`</script>` を抽出して `node --check`。
  ```bash
  S=$(grep -n "<script>" football-chess-prototype.html | tail -1 | cut -d: -f1)
  E=$(grep -n "</script>" football-chess-prototype.html | tail -1 | cut -d: -f1)
  awk -v s="$S" -v e="$E" 'NR>s && NR<e' football-chess-prototype.html > /tmp/fc.js
  node --check /tmp/fc.js
  ```
- **ロジック検証**：DOMをスタブ化して `eval` し、対象関数を実行時テスト（このリポジトリでの標準手法）。
- **Worker型チェック**：Cloudflare側を触ったら `npm run check:worker` を必ず実行する。
- **Worker dry-run**：公開前やDurable Object変更後は `npx wrangler deploy --dry-run` でバンドル確認する。
- **⚠ ブラウザ実描画の確認**：Claude Code のこの環境からは**ローカルの `prototype.html` を起動・スクリーンショットできない**（拡張機能のChromeがローカルファイル/サーバーに到達不可。2026-07-06 に `localhost:8000` / `127.0.0.1:8000` の両方で再確認済み）。見た目の最終確認はユーザーに `! open <path>` で依頼し、必要ならスクリーンショットを貼ってもらう。

## 編集上の注意
- 画像base64を含む巨大な行があるため、`Read` は範囲指定で。`cat`/`sed` での全文出力は避ける。
- 内部ロジック（移動可否/パス範囲/確率/コマンド確定）の変更は慎重に。UI改修時は「表示のみ変更、ロジック不変」を原則とする。
- Codexで継続する場合は、実装・検証・ローカルURL確認までこの単一HTML版で完結させる。演出移植はUnity C#を調べ、ボール軌跡・駒移動・カットインなど小さい単位で移す。
- Git運用：remote は `origin https://github.com/GadeDev/football-chess-next.git`。最新作業は `origin/codex/prototype-throughpass-move-fix` にあり、ローカルにも同名の追跡ブランチを作成済み（2026-07-06。以前はローカル `master` が同リモートブランチを追跡していた）。`origin/main` は別履歴の古い系統なので、統合/上書きはユーザー確認なしに行わない。Pushはユーザーから明示依頼があった場合のみ行う。
- デプロイ：Worker公開は `npm run check:worker` → `npx wrangler deploy --dry-run` → `npm run deploy:worker`（= `build:assets` + `wrangler deploy`）の順で行う。公開URLは `https://universofutbol-football-chess.yanagiho.workers.dev`（デプロイ後の確認は `/api/universofutbol/football-chess/health` が `{"ok":true,...,"environment":"production"}` を返すこと）。ENVIRONMENTは2026-07-06からproduction。ローカル`wrangler dev`は`.dev.vars`（Git管理外）でdevelopment表示。
- HTML配信：公開URLの `/` はゲームHTML本体を static assets で配信する（2026-07-06実装）。ソースはリポジトリ直下の `football-chess-prototype.html` が唯一の正で、`npm run build:assets` が `public/index.html` へコピーする（`public/` はGit管理外の生成物。直接編集しない）。同一オリジン配信なのでHTML内のオンラインAPIは自動で本番Workerへ向く。ROOM共有URLは `https://universofutbol-football-chess.yanagiho.workers.dev/?room=FC-XXXX-XXXX` 形式。
