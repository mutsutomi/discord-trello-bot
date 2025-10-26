const { EmbedBuilder } = require('discord.js');
const { detectTechUrls, normalizeUrl } = require('../utils/urlDetector');
const { fetchMetadata, createMetadataSummary } = require('../utils/metadataFetcher');
const { classifyArticle, getCategoryDisplayName, getCategoryEmoji, getCategoryColor } = require('../utils/claudeClassifier');
const { findArticleByUrl } = require('../utils/database');
const {
    handleSearchCommand,
    handleTagCommand,
    handleCategoryCommand,
    handleRecentCommand,
    handleHelpCommand
} = require('../commands/search');

// 確認待ちの記事データを一時保存
const pendingArticles = new Map();

/**
 * メッセージからURLを検出して処理
 * @param {Message} message - Discordメッセージ
 */
async function handleMessage(message) {
    // ボット自身のメッセージは無視
    if (message.author.bot) return;

    // コマンド処理
    if (message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/\s+/);
        const command = args.shift().toLowerCase();

        try {
            switch (command) {
                case 'search':
                    await handleSearchCommand(message, args);
                    return;
                case 'tag':
                    await handleTagCommand(message, args);
                    return;
                case 'category':
                    await handleCategoryCommand(message, args);
                    return;
                case 'recent':
                    await handleRecentCommand(message, args);
                    return;
                case 'help':
                case 'article-help':
                    await handleHelpCommand(message);
                    return;
            }
        } catch (error) {
            console.error('コマンド処理エラー:', error);
            await message.reply('❌ コマンドの処理中にエラーが発生しました。');
            return;
        }
    }

    // URLを検出
    const detectedUrls = detectTechUrls(message.content);

    if (detectedUrls.length === 0) {
        return;
    }

    console.log(`📝 ${detectedUrls.length}個のURLを検出:`, detectedUrls);

    // 各URLを処理
    for (const { url, isTechArticle, isTwitter, type } of detectedUrls) {
        try {
            await processArticleUrl(message, url, type);
        } catch (error) {
            console.error(`URLの処理中にエラーが発生しました (${url}):`, error);
            await message.reply(`❌ URLの処理中にエラーが発生しました: ${url}`);
        }
    }
}

/**
 * 記事URLを処理
 * @param {Message} message - Discordメッセージ
 * @param {string} url - 処理対象のURL
 * @param {string} type - URLのタイプ
 */
async function processArticleUrl(message, url, type) {
    // URLを正規化
    const normalizedUrl = normalizeUrl(url);

    // 既に保存されているかチェック
    const existingArticle = findArticleByUrl(normalizedUrl);
    if (existingArticle) {
        await message.reply(`📚 この記事は既に保存されています: ${existingArticle.title}`);
        return;
    }

    // 処理中メッセージを送信
    const processingMsg = await message.reply('🔄 記事情報を取得中...');

    try {
        // メタデータを取得
        const metadata = await fetchMetadata(normalizedUrl);

        if (!metadata.success) {
            await processingMsg.edit('⚠️ 記事情報の取得に失敗しました。手動で情報を入力してください。');
            return;
        }

        // Claude APIで分類
        const metadataSummary = createMetadataSummary(metadata);
        const classification = await classifyArticle(metadata.title, metadata.description);

        // 記事データを作成
        const articleData = {
            url: normalizedUrl,
            title: metadata.title,
            description: metadata.description,
            tags: classification.tags,
            category: classification.category,
            posted_by: message.author.username,
            posted_at: new Date().toISOString(),
            discord_message_id: message.id,
            thumbnail: metadata.image
        };

        // Embedで確認メッセージを作成
        const embed = new EmbedBuilder()
            .setColor(getCategoryColor(classification.category))
            .setTitle(`${getCategoryEmoji(classification.category)} ${metadata.title}`)
            .setURL(normalizedUrl)
            .setDescription(metadata.description ? metadata.description.substring(0, 200) + '...' : '説明なし')
            .addFields(
                { name: 'カテゴリ', value: getCategoryDisplayName(classification.category), inline: true },
                { name: 'タグ', value: classification.tags.join(', '), inline: true },
                { name: '投稿者', value: message.author.username, inline: true }
            )
            .setFooter({ text: '👍 保存 | ✏️ 編集 | ❌ キャンセル (30秒後に自動キャンセル)' })
            .setTimestamp();

        if (metadata.image) {
            embed.setThumbnail(metadata.image);
        }

        // 確認メッセージを送信
        await processingMsg.edit({ content: '📋 この内容で記事を保存しますか？', embeds: [embed] });

        // リアクションを追加
        await processingMsg.react('👍');
        await processingMsg.react('✏️');
        await processingMsg.react('❌');

        // 記事データを一時保存（リアクション処理で使用）
        pendingArticles.set(processingMsg.id, {
            articleData,
            originalMessage: message,
            confirmMessage: processingMsg,
            expiresAt: Date.now() + 30000 // 30秒後に期限切れ
        });

        // 30秒後にタイムアウト処理
        setTimeout(() => {
            if (pendingArticles.has(processingMsg.id)) {
                pendingArticles.delete(processingMsg.id);
                processingMsg.edit({ content: '⏱️ タイムアウト: 記事の保存をキャンセルしました。', embeds: [] })
                    .catch(console.error);
            }
        }, 30000);

    } catch (error) {
        console.error('記事処理エラー:', error);
        await processingMsg.edit('❌ 記事の処理中にエラーが発生しました。');
    }
}

/**
 * 保留中の記事データを取得
 * @param {string} messageId - メッセージID
 * @returns {Object|null} 記事データ
 */
function getPendingArticle(messageId) {
    return pendingArticles.get(messageId);
}

/**
 * 保留中の記事データを削除
 * @param {string} messageId - メッセージID
 */
function removePendingArticle(messageId) {
    pendingArticles.delete(messageId);
}

/**
 * 保留中の記事データを更新
 * @param {string} messageId - メッセージID
 * @param {Object} articleData - 更新する記事データ
 */
function updatePendingArticle(messageId, articleData) {
    const pending = pendingArticles.get(messageId);
    if (pending) {
        pending.articleData = articleData;
        pendingArticles.set(messageId, pending);
    }
}

module.exports = {
    handleMessage,
    processArticleUrl,
    getPendingArticle,
    removePendingArticle,
    updatePendingArticle
};
