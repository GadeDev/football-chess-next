# Push手順ガイド（PUSH_GUIDE.md）

このリポジトリはコミット済みです。リモート（GitHub等）へのPushは、認証が必要なため
**あなたの環境で**行ってください。以下の手順でできます。

## 前提
- このフォルダ一式（`.git` フォルダを含む）をあなたのPCにダウンロード／展開済みであること
- GitHub等にリポジトリを作成済み、もしくはこれから作ること

## 手順

### 1. このフォルダでターミナルを開く
ダウンロードしたフォルダ（`football-chess-prototype.html` や `HANDOFF.md` がある場所）に移動します。

### 2. （新規リポジトリの場合）GitHubで空のリポジトリを作る
GitHub上で「New repository」から空のリポジトリを作成します（READMEなどは追加しない）。
例: `football-chess-web`

### 3. リモートを登録してPush
作成したリポジトリのURLを使って、以下を実行します。

```bash
# HTTPSの場合（URLは自分のものに置き換え）
git remote add origin https://github.com/GadeDev/football-chess-next.git

# 既存の origin が別URLを向いている場合は
git remote set-url origin https://github.com/GadeDev/football-chess-next.git

git branch -M main
git push -u origin main
```

実行すると GitHub のユーザー名と**Personal Access Token**（パスワードの代わり）を聞かれます。
トークンは GitHub の Settings → Developer settings → Personal access tokens で発行できます。

### 4. 確認
GitHub のリポジトリページを開き、ファイルが上がっていれば完了です。

---

## よくあるケース

- **既存の football-chess-next に統合したい場合**:
  そのリポジトリをクローンし、この成果物ファイルを適切なフォルダにコピーして、通常通りコミット＆Pushするのが安全です（履歴の衝突を避けるため）。

- **大きいファイルで弾かれる場合**:
  `football-chess-prototype.html` は約2MBで通常は問題ありませんが、もしGitHubの容量制限に当たる場合は Git LFS の利用を検討してください。

---

困ったら、エラーメッセージをそのまま次のセッションに貼ってもらえれば対応します。
