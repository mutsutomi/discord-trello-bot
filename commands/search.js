const { EmbedBuilder } = require('discord.js');
const {
    searchArticles,
    findArticlesByTag,
    findArticlesByCategory,
    getRecentArticles
} = require('../utils/database');
const { getCategoryDisplayName, getCategoryEmoji, getCategoryColor } = require('../utils/claudeClassifier');

/**
 * キーワードで記事を検索
 * @param {Message} message - Discordメッセージ
 * @param {Array<string>} args - コマンド引数
 */
async function handleSearchCommand(message, args) {
    if (args.length === 0) {
        await message.reply('❌ 検索キーワードを指定してください。\n使い方: `!search キーワード`');
        return;
    }

    const keyword = args.join(' ');
    const articles = searchArticles(keyword, 10);

    if (articles.length === 0) {
        await message.reply(`🔍 「${keyword}」に一致する記事が見つかりませんでした。`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x2196f3)
        .setTitle(`🔍 検索結果: ${keyword}`)
        .setDescription(`${articles.length}件の記事が見つかりました`)
        .setTimestamp();

    articles.forEach((article, index) => {
        const categoryEmoji = getCategoryEmoji(article.category);
        const categoryName = getCategoryDisplayName(article.category);
        const tags = article.tags.slice(0, 3).join(', ');

        embed.addFields({
            name: `${index + 1}. ${categoryEmoji} ${article.title}`,
            value: `${categoryName} | ${tags}\n[記事を開く](${article.url})`,
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

/**
 * タグで記事を検索
 * @param {Message} message - Discordメッセージ
 * @param {Array<string>} args - コマンド引数
 */
async function handleTagCommand(message, args) {
    if (args.length === 0) {
        await message.reply('❌ タグを指定してください。\n使い方: `!tag タグ名`');
        return;
    }

    const tag = args.join(' ');
    const articles = findArticlesByTag(tag, 10);

    if (articles.length === 0) {
        await message.reply(`🏷️ 「${tag}」タグの記事が見つかりませんでした。`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0xff9800)
        .setTitle(`🏷️ タグ: ${tag}`)
        .setDescription(`${articles.length}件の記事が見つかりました`)
        .setTimestamp();

    articles.forEach((article, index) => {
        const categoryEmoji = getCategoryEmoji(article.category);
        const categoryName = getCategoryDisplayName(article.category);

        embed.addFields({
            name: `${index + 1}. ${categoryEmoji} ${article.title}`,
            value: `${categoryName}\n[記事を開く](${article.url})`,
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

/**
 * カテゴリで記事を検索
 * @param {Message} message - Discordメッセージ
 * @param {Array<string>} args - コマンド引数
 */
async function handleCategoryCommand(message, args) {
    if (args.length === 0) {
        await message.reply('❌ カテゴリを指定してください。\n使い方: `!category frontend|backend|infra|design|other`');
        return;
    }

    const categoryInput = args[0].toLowerCase();
    const categoryMap = {
        'frontend': 'frontend',
        'フロントエンド': 'frontend',
        'backend': 'backend',
        'バックエンド': 'backend',
        'infra': 'infra',
        'インフラ': 'infra',
        'design': 'design',
        'デザイン': 'design',
        'other': 'other',
        'その他': 'other'
    };

    const category = categoryMap[categoryInput];
    if (!category) {
        await message.reply('❌ 無効なカテゴリです。\n有効なカテゴリ: frontend, backend, infra, design, other');
        return;
    }

    const articles = findArticlesByCategory(category, 10);

    if (articles.length === 0) {
        await message.reply(`${getCategoryEmoji(category)} 「${getCategoryDisplayName(category)}」カテゴリの記事が見つかりませんでした。`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(getCategoryColor(category))
        .setTitle(`${getCategoryEmoji(category)} カテゴリ: ${getCategoryDisplayName(category)}`)
        .setDescription(`${articles.length}件の記事が見つかりました`)
        .setTimestamp();

    articles.forEach((article, index) => {
        const tags = article.tags.slice(0, 3).join(', ');

        embed.addFields({
            name: `${index + 1}. ${article.title}`,
            value: `${tags}\n[記事を開く](${article.url})`,
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

/**
 * 最新記事を表示
 * @param {Message} message - Discordメッセージ
 * @param {Array<string>} args - コマンド引数
 */
async function handleRecentCommand(message, args) {
    let limit = 10;

    if (args.length > 0) {
        const parsedLimit = parseInt(args[0], 10);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 25) {
            await message.reply('❌ 件数は1〜25の数値で指定してください。\n使い方: `!recent [件数]`');
            return;
        }
        limit = parsedLimit;
    }

    const articles = getRecentArticles(limit);

    if (articles.length === 0) {
        await message.reply('📚 保存されている記事がありません。');
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x4caf50)
        .setTitle('📚 最新記事')
        .setDescription(`最新${articles.length}件の記事`)
        .setTimestamp();

    articles.forEach((article, index) => {
        const categoryEmoji = getCategoryEmoji(article.category);
        const categoryName = getCategoryDisplayName(article.category);
        const tags = article.tags.slice(0, 3).join(', ');

        embed.addFields({
            name: `${index + 1}. ${categoryEmoji} ${article.title}`,
            value: `${categoryName} | ${tags}\n投稿者: ${article.posted_by}\n[記事を開く](${article.url})`,
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

/**
 * ヘルプメッセージを表示
 * @param {Message} message - Discordメッセージ
 */
async function handleHelpCommand(message) {
    const embed = new EmbedBuilder()
        .setColor(0x9c27b0)
        .setTitle('📖 記事管理Bot - ヘルプ')
        .setDescription('URLを含むメッセージを送信すると、自動で記事情報を取得して分類します。')
        .addFields(
            {
                name: '🔍 検索コマンド',
                value: '`!search [キーワード]` - タイトル・説明・タグから検索\n' +
                       '`!tag [タグ名]` - 特定タグの記事一覧\n' +
                       '`!recent [件数]` - 最新記事表示（デフォルト10件）\n' +
                       '`!category [名前]` - カテゴリ別表示',
                inline: false
            },
            {
                name: '📋 カテゴリ一覧',
                value: '🎨 **frontend** - フロントエンド開発\n' +
                       '⚙️ **backend** - バックエンド開発\n' +
                       '🏗️ **infra** - インフラ・DevOps\n' +
                       '✨ **design** - デザイン・UI/UX\n' +
                       '📝 **other** - その他',
                inline: false
            },
            {
                name: '💡 使い方',
                value: '1. URLを含むメッセージを送信\n' +
                       '2. ボットが記事情報を取得して分類\n' +
                       '3. 👍で承認、✏️で編集、❌でキャンセル\n' +
                       '4. 承認するとデータベースに保存',
                inline: false
            }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

module.exports = {
    handleSearchCommand,
    handleTagCommand,
    handleCategoryCommand,
    handleRecentCommand,
    handleHelpCommand
};
