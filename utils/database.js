const Database = require('better-sqlite3');
const path = require('path');

// データベースパス（環境変数から取得、デフォルトは./articles.db）
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'articles.db');

// データベース接続
let db = null;

/**
 * データベースを初期化
 */
function initializeDatabase() {
    try {
        db = new Database(DB_PATH);

        // articlesテーブルの作成
        db.exec(`
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE NOT NULL,
                title TEXT,
                description TEXT,
                tags TEXT,
                category TEXT,
                posted_by TEXT,
                posted_at TEXT NOT NULL,
                discord_message_id TEXT,
                thumbnail TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ データベースが初期化されました:', DB_PATH);
        return db;
    } catch (error) {
        console.error('❌ データベース初期化エラー:', error);
        throw error;
    }
}

/**
 * 記事を保存
 * @param {Object} article - 記事データ
 * @returns {Object} 保存された記事データ
 */
function saveArticle(article) {
    try {
        const stmt = db.prepare(`
            INSERT INTO articles (
                url, title, description, tags, category,
                posted_by, posted_at, discord_message_id, thumbnail
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = stmt.run(
            article.url,
            article.title,
            article.description,
            JSON.stringify(article.tags || []),
            article.category,
            article.posted_by,
            article.posted_at,
            article.discord_message_id,
            article.thumbnail
        );

        console.log('✅ 記事を保存しました:', article.title);
        return { id: info.lastInsertRowid, ...article };
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new Error('この記事は既に保存されています');
        }
        console.error('❌ 記事保存エラー:', error);
        throw error;
    }
}

/**
 * URLで記事を検索
 * @param {string} url - 検索するURL
 * @returns {Object|null} 記事データ
 */
function findArticleByUrl(url) {
    try {
        const stmt = db.prepare('SELECT * FROM articles WHERE url = ?');
        const article = stmt.get(url);

        if (article && article.tags) {
            article.tags = JSON.parse(article.tags);
        }

        return article;
    } catch (error) {
        console.error('❌ 記事検索エラー:', error);
        throw error;
    }
}

/**
 * キーワードで記事を検索
 * @param {string} keyword - 検索キーワード
 * @param {number} limit - 取得件数
 * @returns {Array} 記事データの配列
 */
function searchArticles(keyword, limit = 10) {
    try {
        const stmt = db.prepare(`
            SELECT * FROM articles
            WHERE title LIKE ? OR description LIKE ? OR tags LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
        `);

        const searchPattern = `%${keyword}%`;
        const articles = stmt.all(searchPattern, searchPattern, searchPattern, limit);

        return articles.map(article => ({
            ...article,
            tags: article.tags ? JSON.parse(article.tags) : []
        }));
    } catch (error) {
        console.error('❌ 記事検索エラー:', error);
        throw error;
    }
}

/**
 * タグで記事を検索
 * @param {string} tag - タグ名
 * @param {number} limit - 取得件数
 * @returns {Array} 記事データの配列
 */
function findArticlesByTag(tag, limit = 10) {
    try {
        const stmt = db.prepare(`
            SELECT * FROM articles
            WHERE tags LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
        `);

        const articles = stmt.all(`%"${tag}"%`, limit);

        return articles.map(article => ({
            ...article,
            tags: article.tags ? JSON.parse(article.tags) : []
        }));
    } catch (error) {
        console.error('❌ タグ検索エラー:', error);
        throw error;
    }
}

/**
 * カテゴリで記事を検索
 * @param {string} category - カテゴリ名
 * @param {number} limit - 取得件数
 * @returns {Array} 記事データの配列
 */
function findArticlesByCategory(category, limit = 10) {
    try {
        const stmt = db.prepare(`
            SELECT * FROM articles
            WHERE category = ?
            ORDER BY created_at DESC
            LIMIT ?
        `);

        const articles = stmt.all(category, limit);

        return articles.map(article => ({
            ...article,
            tags: article.tags ? JSON.parse(article.tags) : []
        }));
    } catch (error) {
        console.error('❌ カテゴリ検索エラー:', error);
        throw error;
    }
}

/**
 * 最新記事を取得
 * @param {number} limit - 取得件数
 * @returns {Array} 記事データの配列
 */
function getRecentArticles(limit = 10) {
    try {
        const stmt = db.prepare(`
            SELECT * FROM articles
            ORDER BY created_at DESC
            LIMIT ?
        `);

        const articles = stmt.all(limit);

        return articles.map(article => ({
            ...article,
            tags: article.tags ? JSON.parse(article.tags) : []
        }));
    } catch (error) {
        console.error('❌ 最新記事取得エラー:', error);
        throw error;
    }
}

/**
 * データベース接続を取得
 * @returns {Database} データベースインスタンス
 */
function getDatabase() {
    if (!db) {
        initializeDatabase();
    }
    return db;
}

/**
 * データベースを閉じる
 */
function closeDatabase() {
    if (db) {
        db.close();
        console.log('✅ データベース接続を閉じました');
    }
}

module.exports = {
    initializeDatabase,
    saveArticle,
    findArticleByUrl,
    searchArticles,
    findArticlesByTag,
    findArticlesByCategory,
    getRecentArticles,
    getDatabase,
    closeDatabase
};
