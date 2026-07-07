# Football Chess — Web移植プロジェクト 引き継ぎ資料 (HANDOFF)

最終更新: 2026-07-07

---

## 1. プロジェクト概要

Unity製ゲーム「Football Chess」（サッカー×将棋の同時ターン制対戦ゲーム / GadeDev・GADE Inc.）を、
Web/PWA + Cloudflare 構成へ移植するプロジェクト。

- **方針**: 広告なし・サブスク課金・スマホ前提
- **正典（最優先の仕様根拠）**: **Unity版の実装**。GDDは初期構想であり、数値が食い違う場合は基本Unity実装を優先する。現行Web版は `CellDef.MaxPieceNum` / `CellDef.MaxMyTeamPieceNum` 準拠で1マス最大3駒。
- **最終ゴール**: 「面白く楽しめればよい、細部はおまかせ」。特に**グラフィックの作り込み（タイマー等）の再現を重視**
- **過去の失敗**: 以前Codexで挫折。真因は画像流用ではなく、Zenject/UniRx/MagicOnion など重量級フレームワークごと移植しようとしたこと
- **正しい方針**: 画像はそのままコピー流用、ルールとデータは純粋ロジックとしてJSへ移植、フレームワークは捨てる

### 関連リポジトリ
- 元のUnityリポジトリ: GadeDev/football-chess-app
- 現在のNext/Cloudflareリポジトリ: https://github.com/GadeDev/football-chess-next

---

## 2. 現在の成果物

**主な成果物**:
- `football-chess-prototype.html`: ローカル単体試遊版。スマホ対応、外部依存なし。
- `src/game-core.ts`: サーバー権威の試合ロジック。
- `src/index.ts`: Cloudflare Workers + Durable Objects のオンライン対戦ROOM。
- `tests/game-core.test.mjs`: Unity差分を固定盤面・固定乱数で検証する回帰テスト。
- 画像はすべてbase64で埋め込み済み（駒・カットイン演出・UI素材・ChessClock）

### ファイル構成（このリポジトリ）
```
football-chess-prototype.html   ← ローカル単体試遊版
src/game-core.ts                ← サーバー権威ロジック
src/index.ts                    ← Cloudflare Worker / Durable Object
tests/game-core.test.mjs        ← ゲームコア回帰テスト
HANDOFF.md                      ← 本資料
imgdata.json / imgdata.js       ← 駒画像のbase64（素材ソース）
cutins.json                     ← カットイン演出18種のbase64（素材ソース）
ui_assets.json                  ← フィールド/HUD/ボタン素材のbase64（素材ソース）
clock_assets.json               ← ChessClock(試合時計)素材のbase64（素材ソース）
assets/                         ← 補助素材
```
※ `*.json` は素材の中間ファイル。本体HTMLには既に埋め込み済みなので、HTML単体で動く。

---

## 3. 移植済みのUnity正典ルール（すべて実装・検証済み）

すべて Unity の `Assets/_Chess/Scripts/` から忠実移植。

| 項目 | 内容 | 出典ファイル |
|---|---|---|
| 盤面 | 5列×6行=25マス(X:-2..2,Y:-3..4)+ゴール2マス。エリア=Normal/PA/VA(バイタル)/GA/Cross/Goal | BoardDef.cs |
| 最大コマ数 | **3**。Unity `CellDef.MaxPieceNum` / `MaxMyTeamPieceNum` 準拠。 | CellDef.cs |
| 駒 | FW/MF/DF/GK × コスト1,1.5,2,2.5,3（計20種）。デフォルト11人編成 | PieceMaster.json |
| 移動 | 上下左右1マス。コスト3のみ斜めも(8方向)。ターン開始位置基準、1ターン1回 | PieceMoveLimitDef |
| パス範囲 | ルーク型(縦横2)+ビショップ型(斜め2)+ナイト型=計24方向 | BallMoveLimitDef |
| ボール2状態 | Piece(駒保持)/Cell(マス単独) | BallModel.cs |
| 確率計算 | コスト→indexの行列テーブル。着地パス/通過パス/タックル/シュート(PA/VA)/PK/FK/CK/オフサイド/Buff | ProbabilityCalculator.cs + JSON |
| 同時ターン制 | ホスト/ゲスト操作を交互マージ→「移動後にパス受けた駒→移動以外→残り移動」順ソート→上から再生 | StateBattleCalculate.cs |
| パス連鎖 | パスは移動と独立(hasBallなら蹴れる)。連鎖継続条件=「パス先に敵がいない or まだ一度もパスしてない」 | PieceModel.cs |
| パスカット経路 | GetRoute()で経路中間マスを出し、各敵マスで「100-通過成功率」のカット率抽選。GKのGAパスは100%カット | PassToCellAsync |
| 相手AI | StmBattleRandomAICommandCalculate.cs(299行)を採用。駒ごとに止まる/移動/パス/スルーパス/シュート抽選 | (同左) |

※Foul/PassiveTactics/TeamFormationの一部マスタJSONはUnityローカル/現GitHub側ともに未同梱のため、現行Web版では確認済みのEntry/Repository参照と既存Buff値から近似している。AdditionalTimeは現HTML/Workerともに前半0〜1、後半1〜3ターンのseeded抽選。

---

## 4. プロトタイプ実装状況

### ✅ 完成・検証済み（COMPLETED）
- 盤面/エリア区分、デフォルト編成、Unity駒画像流用
- ボール2状態、パス範囲24方向、全確率計算テーブル
- 同一マス複数駒の展開選択（人数バッジ表示）、移動ルール（開始位置基準・コスト別範囲）
- **最大3コマ**（MAX_PER_CELL=3、Unity `CellDef` 準拠）
- **同時ターン制**（仕込み→相手AI裏で計画→「決定（実行）」でマージ→リプレイ再生）。予約駒に緑✓
- **パス連鎖（ボール回し）**（未行動の味方へ連鎖、ドリブルも連鎖継続）
- **「ここで保持」ボタン**（連鎖終了し保持確定）
- **パスカット経路判定**（経路上の敵で停止＆奪取、敵を通り越すと取られる）
- **カットイン演出**（Unity画像19種、キュー方式で順次再生。AIの行動にも付与）
- **Unity版グラフィックUI**：field.png背景、上部HUD（スコア青赤・タイマーバー）、下部ボタン（決定=青光沢/シュート=金/各種ghost）
- **ChessClock（試合時計）**：game_time_bar.png（円形レインボー文字盤）+ game_time_bar_frame.png（MATCH TIMEフレーム）。針が経過時間で回転、中央に分数表示。GDDの「1ターン3分・15ターンで前半45分」準拠で90分一周

### ⏳ 未着手・要検討（PENDING）
GDD/Unity差分をさらに詰める部分:
1. **オンライン再生の完全調整**: 全イベントのカットイン順、間、ボール軌跡、駒移動の見え方をUnityにさらに寄せる。
2. **未同梱マスタの扱い**: Foul/PassiveTactics/TeamFormationの不足JSONについて、Unity実機・追加資料・GitHub側の更新が得られたら近似値を置き換える。
3. **本番運用**: universofutbol.com 側のCloudflareアカウント/ゾーン接続、サブスク導線、レーティング/マッチング。

### 🔮 将来構想
- UniversoFutbol本体への導線設計
- サブスク課金化
- イロレーティングによるマッチング

---

## 5. 技術メモ（次に作業する人へ）

- **アーキテクチャ**: ローカル試遊は単一HTMLにCSS+JS全部入り。オンライン対戦は `src/game-core.ts` をサーバー権威ロジック、`src/index.ts` をCloudflare Worker/Durable Objectとして扱う。
- **重要なグローバル**: `myCommands`/`oppCommands`（操作配列）、`chainHolderId`（論理ボール保持駒）、`MAX_PER_CELL=3`
- **画像の埋め込み方**: 素材は `*.json` から base64 を読み、HTMLの `:root` にCSS変数（`--fieldImg` 等）として注入。要素の `background-image:var(--xxx)` で表示
- **ChessClockの仕組み**: `.chessClock` 内に `.clockDial`(文字盤) `.clockFrame`(枠) `.clockHand`(針) `.clockMin`(分数)。針は `render()` 内で `rotate((mm/90)*360deg)`
- **検証方法**: `npm test`、`npm run check:worker`、HTML内スクリプト抽出後の `node --check`、`git diff --check`。
- **作業フロー**: 作業ディレクトリは `/Users/yanagiho-mba/football-chess-next/football-chess-repo`。Unity参照元は `/Users/yanagiho-mba/football-chess-unity-source`。
- **ユーザー**: 非エンジニア。日本語で対応。行き来とコピペを最小化したい。グラフィック再現を重視

### Unityソースの場所（このコンテナ内・参照用）
`/Users/yanagiho-mba/football-chess-unity-source/`
- ゲーム本体ロジック: `Assets/_Chess/Scripts/`
- 画像素材: `Assets/_ChessBundles/Resources/Static/Texture/002_InGame/`
  - `field.png`, `Hud/`（time_bar, score_bg, game_time_bar, turn_end_btn, shoot_btn 等）
  - `Piece/`（fw/mf/df/gk × b/r）, `Ball/`, `Cost/`, `cutin/`（演出18種）

---

## 6. このリポジトリのGit運用について

現在の作業ブランチは主に `codex/prototype-throughpass-move-fix`。リモートは `GadeDev/football-chess-next`。
Pushはユーザーの明示依頼があるときだけ行う。
