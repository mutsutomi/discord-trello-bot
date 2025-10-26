const { Pool } = require('pg');

// PostgreSQL接続プール
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 接続エラーハンドリング
pool.on('error', (err) => {
    console.error('❌ PostgreSQL接続エラー:', err);
});

/**
 * データベース接続をテスト
 */
async function testDatabaseConnection() {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ データベース接続成功:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ データベース接続失敗:', error);
        throw error;
    }
}

/**
 * データベースを初期化（テーブル作成）
 */
async function initializeDatabase() {
    try {
        // articlesテーブルの作成
        await pool.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                title TEXT,
                description TEXT,
                tags JSONB,
                category TEXT CHECK (category IN ('frontend', 'backend', 'infra', 'design', 'other')),
                posted_by TEXT NOT NULL,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                discord_message_id TEXT,
                thumbnail TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // インデックスの作成
        await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_tags ON articles USING GIN(tags)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_posted_at ON articles(posted_at DESC)');

        console.log('✅ データベースが初期化されました');

        // 接続テスト
        await testDatabaseConnection();

        return pool;
    } catch (error) {
        console.error('❌ データベース初期化エラー:', error);
        throw error;
    }
}

/**
 * 記事を保存
 * @param {Object} article - 記事データ
 * @returns {Promise<Object>} 保存された記事データ
 */
async function saveArticle(article) {
    try {
        const query = `
            INSERT INTO articles (
                url, title, description, tags, category,
                posted_by, posted_at, discord_message_id, thumbnail
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (url) DO NOTHING
            RETURNING *
        `;

        const values = [
            article.url,
            article.title,
            article.description,
            JSON.stringify(article.tags || []),
            article.category,
            article.posted_by,
            article.posted_at || new Date().toISOString(),
            article.discord_message_id,
            article.thumbnail
        ];

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            throw new Error('この記事は既に保存されています');
        }

        console.log('✅ 記事を保存しました:', article.title);
        return result.rows[0];
    } catch (error) {
        if (error.message.includes('既に保存されています')) {
            throw error;
        }
        console.error('❌ 記事保存エラー:', error);
        throw error;
    }
}

/**
 * URLで記事を検索
 * @param {string} url - 検索するURL
 * @returns {Promise<Object|null>} 記事データ
 */
async function findArticleByUrl(url) {
    try {
        const query = 'SELECT * FROM articles WHERE url = $1';
        const result = await pool.query(query, [url]);

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    } catch (error) {
        console.error('❌ 記事検索エラー:', error);
        throw error;
    }
}

/**
 * キーワードで記事を検索
 * @param {string} keyword - 検索キーワード
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>} 記事データの配列
 */
async function searchArticles(keyword, limit = 10) {
    try {
        const query = `
            SELECT * FROM articles
            WHERE title ILIKE $1 OR description ILIKE $1
            ORDER BY posted_at DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [`%${keyword}%`, limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ 記事検索エラー:', error);
        throw error;
    }
}

/**
 * タグで記事を検索
 * @param {string} tag - タグ名
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>} 記事データの配列
 */
async function findArticlesByTag(tag, limit = 10) {
    try {
        const query = `
            SELECT * FROM articles
            WHERE tags @> $1
            ORDER BY posted_at DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [JSON.stringify([tag]), limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ タグ検索エラー:', error);
        throw error;
    }
}

/**
 * カテゴリで記事を検索
 * @param {string} category - カテゴリ名
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>} 記事データの配列
 */
async function findArticlesByCategory(category, limit = 10) {
    try {
        const query = `
            SELECT * FROM articles
            WHERE category = $1
            ORDER BY posted_at DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [category, limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ カテゴリ検索エラー:', error);
        throw error;
    }
}

/**
 * 最新記事を取得
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>} 記事データの配列
 */
async function getRecentArticles(limit = 10) {
    try {
        const query = `
            SELECT * FROM articles
            ORDER BY posted_at DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ 最新記事取得エラー:', error);
        throw error;
    }
}

/**
 * データベース接続プールを取得
 * @returns {Pool} データベース接続プール
 */
function getDatabase() {
    return pool;
}

/**
 * データベース接続を閉じる
 */
async function closeDatabase() {
    try {
        await pool.end();
        console.log('✅ データベース接続を閉じました');
    } catch (error) {
        console.error('❌ データベース接続終了エラー:', error);
        throw error;
    }
}

module.exports = {
    initializeDatabase,
    testDatabaseConnection,
    saveArticle,
    findArticleByUrl,
    searchArticles,
    findArticlesByTag,
    findArticlesByCategory,
    getRecentArticles,
    getDatabase,
    closeDatabase
};
