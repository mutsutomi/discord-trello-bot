const Anthropic = require('@anthropic-ai/sdk');

// Claude APIクライアント
let anthropic = null;

/**
 * Claude APIクライアントを初期化
 * @param {string} apiKey - Anthropic API Key
 */
function initializeClaudeClient(apiKey) {
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY が設定されていません');
    }

    anthropic = new Anthropic({
        apiKey: apiKey
    });

    console.log('✅ Claude APIクライアントが初期化されました');
    return anthropic;
}

/**
 * 記事のカテゴリとタグを分類
 * @param {string} title - 記事のタイトル
 * @param {string} description - 記事の説明
 * @returns {Promise<Object>} 分類結果
 */
async function classifyArticle(title, description) {
    try {
        if (!anthropic) {
            throw new Error('Claude APIクライアントが初期化されていません');
        }

        const prompt = `以下の記事のタイトルと説明から、カテゴリとタグを判定してください。

タイトル: ${title}
説明: ${description}

以下のJSON形式で返してください:
{
  "category": "frontend|backend|infra|design|other",
  "tags": ["技術名やトピック（3-5個）"]
}

カテゴリの定義:
- frontend: フロントエンド開発、UI/UX、React、Vue、Angular、CSS、HTML、TypeScriptなど
- backend: バックエンド開発、API、データベース、サーバー、Node.js、Python、Java、Go、Rustなど
- infra: インフラ、DevOps、Docker、Kubernetes、AWS、GCP、Azure、CI/CD、監視など
- design: デザイン、UI/UX、Figma、プロトタイピング、デザインシステムなど
- other: 上記に当てはまらないもの（キャリア、チーム開発、マネジメント、ビジネスなど）

タグは具体的な技術名やトピックを3-5個選んでください。`;

        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        // レスポンスからJSONを抽出
        const responseText = message.content[0].text;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            console.error('Claude APIのレスポンスからJSONを抽出できませんでした:', responseText);
            return getDefaultClassification();
        }

        const classification = JSON.parse(jsonMatch[0]);

        // バリデーション
        const validCategories = ['frontend', 'backend', 'infra', 'design', 'other'];
        if (!validCategories.includes(classification.category)) {
            classification.category = 'other';
        }

        if (!Array.isArray(classification.tags) || classification.tags.length === 0) {
            classification.tags = ['未分類'];
        }

        console.log('✅ 記事を分類しました:', classification);
        return classification;

    } catch (error) {
        console.error('❌ Claude API分類エラー:', error);

        // エラー時はデフォルトの分類を返す
        return getDefaultClassification();
    }
}

/**
 * デフォルトの分類を取得（API失敗時のフォールバック）
 * @returns {Object} デフォルトの分類
 */
function getDefaultClassification() {
    return {
        category: 'other',
        tags: ['未分類']
    };
}

/**
 * カテゴリの日本語名を取得
 * @param {string} category - カテゴリ
 * @returns {string} カテゴリの日本語名
 */
function getCategoryDisplayName(category) {
    const categoryNames = {
        'frontend': 'フロントエンド',
        'backend': 'バックエンド',
        'infra': 'インフラ',
        'design': 'デザイン',
        'other': 'その他'
    };

    return categoryNames[category] || 'その他';
}

/**
 * カテゴリの絵文字を取得
 * @param {string} category - カテゴリ
 * @returns {string} カテゴリの絵文字
 */
function getCategoryEmoji(category) {
    const categoryEmojis = {
        'frontend': '🎨',
        'backend': '⚙️',
        'infra': '🏗️',
        'design': '✨',
        'other': '📝'
    };

    return categoryEmojis[category] || '📝';
}

/**
 * カテゴリの色を取得（Discord Embed用）
 * @param {string} category - カテゴリ
 * @returns {number} カラーコード
 */
function getCategoryColor(category) {
    const categoryColors = {
        'frontend': 0x61dafb, // React Blue
        'backend': 0x68a063,  // Node.js Green
        'infra': 0x326ce5,    // Kubernetes Blue
        'design': 0xf24e1e,   // Figma Orange
        'other': 0x95a5a6     // Gray
    };

    return categoryColors[category] || 0x95a5a6;
}

/**
 * Claude APIクライアントを取得
 * @returns {Anthropic} Claude APIクライアント
 */
function getClaudeClient() {
    return anthropic;
}

module.exports = {
    initializeClaudeClient,
    classifyArticle,
    getDefaultClassification,
    getCategoryDisplayName,
    getCategoryEmoji,
    getCategoryColor,
    getClaudeClient
};
