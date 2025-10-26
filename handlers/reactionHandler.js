const { EmbedBuilder } = require('discord.js');
const { getPendingArticle, removePendingArticle, updatePendingArticle } = require('./messageHandler');
const { saveArticle } = require('../utils/database');
const { getCategoryDisplayName, getCategoryEmoji, getCategoryColor } = require('../utils/claudeClassifier');

/**
 * リアクション追加時の処理
 * @param {MessageReaction} reaction - リアクション
 * @param {User} user - ユーザー
 */
async function handleReactionAdd(reaction, user) {
    // ボット自身のリアクションは無視
    if (user.bot) return;

    // パーシャルメッセージの場合はフェッチ
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('リアクションのフェッチに失敗:', error);
            return;
        }
    }

    // 保留中の記事データを取得
    const pending = getPendingArticle(reaction.message.id);
    if (!pending) {
        return; // このメッセージは記事確認メッセージではない
    }

    const { articleData, originalMessage, confirmMessage } = pending;

    try {
        switch (reaction.emoji.name) {
            case '👍':
                // 記事を保存
                await handleApprove(confirmMessage, articleData, user);
                removePendingArticle(reaction.message.id);
                break;

            case '✏️':
                // 編集モード（今後の拡張用）
                await handleEdit(confirmMessage, articleData, user);
                break;

            case '❌':
                // キャンセル
                await handleCancel(confirmMessage, user);
                removePendingArticle(reaction.message.id);
                break;
        }
    } catch (error) {
        console.error('リアクション処理エラー:', error);
        await confirmMessage.reply('❌ 処理中にエラーが発生しました。');
    }
}

/**
 * 記事の保存を承認
 * @param {Message} confirmMessage - 確認メッセージ
 * @param {Object} articleData - 記事データ
 * @param {User} user - ユーザー
 */
async function handleApprove(confirmMessage, articleData, user) {
    try {
        // データベースに保存
        const savedArticle = saveArticle(articleData);

        // 成功メッセージを作成
        const successEmbed = new EmbedBuilder()
            .setColor(0x4caf50) // Green
            .setTitle('✅ 記事を保存しました')
            .setDescription(`**${articleData.title}**`)
            .setURL(articleData.url)
            .addFields(
                { name: 'カテゴリ', value: getCategoryDisplayName(articleData.category), inline: true },
                { name: 'タグ', value: articleData.tags.join(', '), inline: true },
                { name: '投稿者', value: articleData.posted_by, inline: true },
                { name: '承認者', value: user.username, inline: true }
            )
            .setTimestamp();

        if (articleData.thumbnail) {
            successEmbed.setThumbnail(articleData.thumbnail);
        }

        await confirmMessage.edit({
            content: `✅ ${user.username}さんが記事を承認しました`,
            embeds: [successEmbed]
        });

        // 元のメッセージにも確認リアクションを追加
        // await originalMessage.react('✅');

    } catch (error) {
        if (error.message.includes('既に保存されています')) {
            await confirmMessage.edit({
                content: '⚠️ この記事は既に保存されています。',
                embeds: []
            });
        } else {
            console.error('記事保存エラー:', error);
            await confirmMessage.edit({
                content: '❌ 記事の保存に失敗しました。',
                embeds: []
            });
        }
    }
}

/**
 * 記事の編集モード（今後の拡張用）
 * @param {Message} confirmMessage - 確認メッセージ
 * @param {Object} articleData - 記事データ
 * @param {User} user - ユーザー
 */
async function handleEdit(confirmMessage, articleData, user) {
    // TODO: モーダルやスレッドを使った編集機能を実装
    await confirmMessage.reply({
        content: `✏️ 編集機能は今後実装予定です。\n現在のところ、カテゴリやタグの変更が必要な場合は、一度キャンセルして手動で登録してください。`,
        ephemeral: false
    });
}

/**
 * 記事の保存をキャンセル
 * @param {Message} confirmMessage - 確認メッセージ
 * @param {User} user - ユーザー
 */
async function handleCancel(confirmMessage, user) {
    const cancelEmbed = new EmbedBuilder()
        .setColor(0xf44336) // Red
        .setTitle('❌ 記事の保存をキャンセルしました')
        .setDescription(`${user.username}さんがキャンセルしました`)
        .setTimestamp();

    await confirmMessage.edit({
        content: '',
        embeds: [cancelEmbed]
    });
}

module.exports = {
    handleReactionAdd,
    handleApprove,
    handleEdit,
    handleCancel
};
