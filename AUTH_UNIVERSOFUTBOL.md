# UniversoFutbol 会員連携（ログイン/サブスク）仕様

Football Chess Web版を universofutbol.com に組み込むためのログイン・サブスク連携の設計。
現状の実装状態と、UniversoFutbol(WordPress)側で将来やることを分けて書く。

## 現状の実装（2026-07-06 時点・稼働中）

### 構成
- アカウント基盤: Cloudflare Worker 内の Durable Object `AccountStore`（`src/accounts.ts`、SQLite、単一インスタンス `global`）
- セッション: Bearer トークン（32バイトhex、30日、`sessions` テーブル）。ブラウザは `localStorage['fcSession']` に保持
- パスワード: PBKDF2-SHA256 100,000回 + ユーザー毎salt。平文は保存しない
- サブスク: **デモ課金**（実決済なし）。加入すると30日で自動失効。Unity版準拠で「駒コスト変更」がプレミアム限定

### API（prefix: `/api/universofutbol/football-chess`）
| Method | Path | Body / Header | 説明 |
|---|---|---|---|
| POST | `/auth/register` | `{name, password}` | 新規登録（名前2〜16字・パスワード8字以上）。セッション発行 |
| POST | `/auth/login` | `{name, password}` | ログイン。セッション発行 |
| POST | `/auth/logout` | `Authorization: Bearer` | セッション破棄 |
| GET | `/auth/me` | `Authorization: Bearer` | ログイン状態とサブスク状態を返す |
| POST | `/auth/sso` | `{token: <JWT>}` | UniversoFutbol発行のSSOトークンでログイン（下記） |
| POST | `/billing/subscribe` | `Authorization: Bearer` | デモサブスク加入（30日） |
| POST | `/billing/cancel` | `Authorization: Bearer` | サブスク解約 |

レスポンスは共通で `{ok, error?, token?, user?}`。`user.subscription = {active, plan, until, demo}`。

### クライアント（football-chess-prototype.html）
- タイトルタップ → 未ログインならログインダイアログ（ログイン/新規登録/ゲスト続行）
- ホームのフッターに「サブスク」タブ（Unity UISubscriptionPage 相当）。加入/解約/状態表示
- コスト変更はプレミアム限定（非加入者はサブスクページへ誘導）。フォーメーション変更・保存スロットは無料のまま
- ログインするとオンライン対戦の表示名もアカウント名に同期

## UniversoFutbol(WordPress) 側で将来やること — SSO 連携

ゲームを `https://universofutbol.com/universofutbol/football-chess` に組み込み、
WordPress 会員でそのままログインさせる。

### フロー
1. WordPress にログイン済みのユーザーが「Football Chess をプレイ」リンクを押す
2. WordPress プラグインが **HS256 JWT** を発行し、ゲームURLに `?sso=<JWT>` を付けてリダイレクト
3. ゲーム側は起動時に `?sso=` を検出 → `POST /auth/sso` で Worker が署名・期限を検証
4. 検証OKなら `external_id`（WordPress会員ID）でアカウントを自動作成/紐づけし、通常セッションを発行
5. URLから `?sso=` は即座に除去される（history.replaceState）

### JWT 仕様
- アルゴリズム: HS256（共有シークレット）
- クレーム:
  - `sub`: WordPress ユーザーID（文字列/数値）**必須**
  - `name`: 表示名（16字まで）
  - `subscribed`: `true/false` — UniversoFutbol側のサブスク状態。**ログインの度にこの値でゲーム側サブスクを上書き同期**
  - `exp`: 有効期限（unix秒）。**短命推奨（発行から60秒程度）** — URLに載るため
- シークレット設定（Cloudflare側）: `npx wrangler secret put SSO_SECRET`
  - 未設定の間 `/auth/sso` は 501 を返す（デモアカウント運用のまま）

### WordPress側の実装イメージ（プラグイン or functions.php）
```php
$payload = [
  'sub' => (string) get_current_user_id(),
  'name' => wp_get_current_user()->display_name,
  'subscribed' => uf_user_has_active_subscription(get_current_user_id()),
  'exp' => time() + 60,
];
$jwt = uf_jwt_encode_hs256($payload, UF_FOOTBALL_CHESS_SSO_SECRET);
wp_redirect('https://universofutbol.com/universofutbol/football-chess?sso=' . $jwt);
```

### 決済の一元化方針
- 本番のサブスク決済は UniversoFutbol(WordPress) 側で行い、ゲームは `subscribed` クレームを信じるだけにする（ゲーム側に決済を持たない）
- 途中解約の即時反映が必要になったら、WordPress → Worker への Webhook（`POST /auth/sso` と同じシークレットで署名）を追加する
- ゲーム内の「デモ加入」ボタンは本番SSO運用開始時に非表示にする（`ogAuth.user.subscription.demo` で判別可能）

## 進捗（2026-07-07更新）
- ✅ `SSO_SECRET` 設定済み（`/auth/sso` 稼働中。正当JWTログイン・改ざん拒否をE2E確認済み）。シークレット値はローカルの `.sso-secret.txt`（Git管理外）— WordPress の `UF_FC_SSO_SECRET` に同じ値を設定すること
- ✅ WordPressプラグイン同梱: `wordpress/universofutbol-football-chess-sso.php`（`/?uf_fc_play=1` でSSOリダイレクト、ショートコード `[football_chess_button]`）。サブスク判定は `uf_fc_user_subscribed` フィルタで会員プラグインに接続する
- ✅ レート制限: 認証系10回/10分/IP、課金系30回/時/IP、ROOM作成12回/時/IP（`AccountStore.checkRateLimit`、超過は429）

## 残課題
- **正式ルーティング（要・別アカウント作業）**: universofutbol.com のCloudflareゾーンは**このWorkerのアカウント（yanagiho@gade.jp / b38024ba…）には存在しない**（別アカウント管理）。ルート追加を試行したが「Could not find zone」で失敗し、ロールバック済み。選択肢: ①ゾーンがあるアカウントへこのWorkerを移す ②ゾーンをこのアカウントへ移管 ③ゾーン側アカウントで `universofutbol.com/universofutbol/football-chess*` と `/api/universofutbol/football-chess*` の2ルートをこのWorkerに向ける（Workerのベースパス配信コードは実装済みで、ルートを張るだけで動く）
- パスワードリセット: デモアカウントには未実装（本番はWordPress側の機能を使うため不要になる想定）
