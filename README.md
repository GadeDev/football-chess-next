# Football Chess — Web版プロトタイプ

Unity製「Football Chess」（サッカー×将棋の同時ターン制対戦ゲーム）を、単一HTMLファイルとしてWeb移植したプロトタイプです。

## 使い方
`football-chess-prototype.html` をブラウザで開くだけ（スマホ対応・外部依存なし）。

オンライン対戦バーを使う場合は、別ターミナルでWorkerを起動してからHTMLを開きます。

## ドキュメント
- 引き継ぎ・仕様: [HANDOFF.md](./HANDOFF.md)
- Push手順: [PUSH_GUIDE.md](./PUSH_GUIDE.md)
- Cloudflare対人化計画: [MULTIPLAYER.md](./MULTIPLAYER.md)

## Cloudflare 対人対戦バックエンド
UniversoFutbol配下のコンテンツとして、Cloudflare Workers + Durable Objects の対戦ルーム基盤を追加中です。

```bash
npm install
npm run cf:types
npm test
npm run dev:worker
```

HTMLをローカル配信して開く例:

```bash
python3 -m http.server 5174
```

ブラウザ:
- `http://127.0.0.1:5174/football-chess-prototype.html`

オンラインバー:
- `ROOM作成`: 部屋を作って青で参加
- `参加`: ROOM CODE または `?room=...` 付きURLで参加
- `URL`: 共有URLをコピー
- `NAME`: 表示名を保存し、オンラインROOMの青/赤ロスターに反映
- `退出`: ROOMから抜けて席を空ける
- `投了`: オンライン試合を即終了し、相手勝利にする
- `再戦`: 試合終了後、両者が押すと同じROOMで再開
- 青/赤の席、観戦人数、自分の席、送信済み状態はオンラインバー内に表示
- 満席時の参加者は観戦になり、盤面操作とTURN ENDは読み取り専用
- ホームの編成デッキはオンラインROOM参加時にもサーバーへ送信され、検証後に青/赤の初期盤面へ反映
- 片側がTURN END後、相手が未送信なら3分後に空コマンドとしてターン解決
- 未接続で放置されたROOM/全員退出したROOMは30分後、終了済みROOMは全員退出後6時間でDurable Object内の状態を掃除
- オンラインでもサーバー側で前後半/AT/ハーフタイム/フルタイムを進行

ローカルAPI:
- `POST http://127.0.0.1:8787/api/universofutbol/football-chess/matches`
- `GET  http://127.0.0.1:8787/api/universofutbol/football-chess/matches/:roomCode`
- `WS   ws://127.0.0.1:8787/api/universofutbol/football-chess/matches/:roomCode/socket`
