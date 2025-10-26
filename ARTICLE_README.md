# Discord記事管理Bot - 使い方ガイド

## 概要
Discord Bot に技術記事やTwitterリンクを自動分類・蓄積する機能を追加しました。
URLを含むメッセージを送信すると、自動でOGP情報を取得し、Claude APIで記事をカテゴリとタグに分類します。

## セットアップ

### 1. 環境変数の設定
`.env` ファイルに以下を追加してください：

```env
# 記事管理機能設定
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DATABASE_PATH=./articles.db
```

**ANTHROPIC_API_KEY の取得方法:**
1. [Anthropic Console](https://console.anthropic.com/) にアクセス
2. API Keys から新しいキーを作成
3. 取得したキーを `.env` に設定

### 2. パッケージのインストール
既に以下のパッケージがインストール済みです：
- `@anthropic-ai/sdk` - Claude API
- `better-sqlite3` - SQLite データベース
- `open-graph-scraper` - OGP 情報取得

### 3. ボットの起動
```bash
npm start
# または開発モード（ホットリロード）
npm run dev
```

## 使い方

### 記事の保存

1. **URLを含むメッセージを送信**
   ```
   この記事参考になりそう！
   https://zenn.dev/example/articles/react-hooks
   ```

2. **ボットが自動で記事情報を取得**
   - OGP情報（タイトル、説明、サムネイル）を取得
   - Claude APIで記事を分類（カテゴリ＋タグ）
   - 確認メッセージを表示

3. **リアクションで承認**
   - 👍 : 記事を保存
   - ✏️ : 編集（今後実装予定）
   - ❌ : キャンセル
   - 30秒以内に反応がない場合は自動キャンセル

### 検索コマンド

記事を検索・閲覧するコマンド一覧：

#### `!search [キーワード]`
タイトル、説明、タグから記事を検索
```
!search React Hooks
!search TypeScript 型定義
```

#### `!tag [タグ名]`
特定のタグが付いた記事を一覧表示
```
!tag React
!tag Docker
```

#### `!category [カテゴリ名]`
カテゴリ別に記事を表示
```
!category frontend
!category backend
!category infra
!category design
!category other
```
日本語でも可：
```
!category フロントエンド
!category バックエンド
```

#### `!recent [件数]`
最新の記事を表示（デフォルト10件、最大25件）
```
!recent
!recent 5
!recent 20
```

#### `!help`
ヘルプメッセージを表示
```
!help
```

## カテゴリ一覧

| カテゴリ | 絵文字 | 説明 |
|---------|-------|------|
| **frontend** | 🎨 | フロントエンド開発、UI/UX、React、Vue、Angular、CSS、HTML、TypeScriptなど |
| **backend** | ⚙️ | バックエンド開発、API、データベース、サーバー、Node.js、Python、Java、Go、Rustなど |
| **infra** | 🏗️ | インフラ、DevOps、Docker、Kubernetes、AWS、GCP、Azure、CI/CD、監視など |
| **design** | ✨ | デザイン、UI/UX、Figma、プロトタイピング、デザインシステムなど |
| **other** | 📝 | その他（キャリア、チーム開発、マネジメント、ビジネスなど） |

## 対応サイト

以下のサイトは自動的に技術記事として認識されます：
- Zenn (zenn.dev)
- Qiita (qiita.com)
- note (note.com)
- Medium (medium.com)
- dev.to
- GitHub
- Stack Overflow
- はてなブログ
- Speaker Deck
- SlideShare
- YouTube

その他のサイトも一般的なWebページとして処理されます。

## データベース

記事は SQLite データベース (`articles.db`) に保存されます。

### テーブル構造: `articles`

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| url | TEXT | 記事のURL（ユニーク） |
| title | TEXT | 記事のタイトル |
| description | TEXT | 記事の説明 |
| tags | TEXT | タグ（JSON配列を文字列保存） |
| category | TEXT | カテゴリ |
| posted_by | TEXT | 投稿者 |
| posted_at | TEXT | 投稿日時 |
| discord_message_id | TEXT | DiscordメッセージID |
| thumbnail | TEXT | サムネイル画像URL |
| created_at | DATETIME | 作成日時 |

## ファイル構成

```
/discord-trello-bot
  /utils
    database.js         - データベース操作
    urlDetector.js      - URL検出機能
    metadataFetcher.js  - OGP情報取得
    claudeClassifier.js - Claude API連携
  /handlers
    messageHandler.js   - メッセージ処理
    reactionHandler.js  - リアクション処理
  /commands
    search.js           - 検索コマンド
  index.js              - メインファイル
  articles.db           - SQLiteデータベース
```

## トラブルシューティング

### Claude APIのエラー
- `ANTHROPIC_API_KEY` が正しく設定されているか確認
- APIキーの有効期限やクォータを確認
- エラー時はデフォルトカテゴリ（other）で保存されます

### OGP取得の失敗
- サイトによってはOGPが設定されていない場合があります
- タイムアウト（10秒）を過ぎると取得失敗となります
- その場合は手動で情報を入力してください（今後の機能追加予定）

### 重複URLのエラー
- 同じURLの記事は1回のみ保存できます
- 既に保存されている場合は通知メッセージが表示されます

## 今後の拡張予定

- [ ] 編集機能（カテゴリ・タグの変更）
- [ ] 記事の削除機能
- [ ] タグの一覧表示
- [ ] カテゴリごとの統計情報
- [ ] エクスポート機能（CSV、JSON）
- [ ] スレッド機能（記事ごとにディスカッション）
- [ ] お気に入り機能
- [ ] 検索結果のページネーション

## ライセンス

ISC

## お問い合わせ

問題や要望がある場合は、GitHubのIssueまでお願いします。
