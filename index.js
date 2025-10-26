require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');

// 記事管理機能のインポート
const { initializeDatabase } = require('./utils/database');
const { initializeClaudeClient } = require('./utils/claudeClassifier');
const { handleMessage } = require('./handlers/messageHandler');
const { handleReactionAdd } = require('./handlers/reactionHandler');

// 設定値（環境変数から読み込み）
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;
// GitHub設定
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'Mahoroba-Organization';
const GITHUB_REPO_DEFAULT = 'mahoroba-planning';
const GITHUB_REPO_FRONT = 'mahoroba-ios';
const GITHUB_REPO_BACK = 'mahoroba-api';
const GITHUB_REPO_WEB = 'mahoroba-web';
// 記事管理機能設定
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Trelloリスト定義
const LISTS = {
    'アイデア': '687cb3801fab6e84274f5175',
    '決定要件': '687ceb5d93977d3a1f798ee5',
    '今回改修': '687cf40ce6cf47d1cd9f7ea7',
    '作業中': '687cf79876f2581e6875b7f5',
    'リリース待ち': '687cb3801fab6e84274f5173',
    'リリース済': '687cf3ea20e3fb8de2420588'
};

// デフォルトリスト（今回改修）
const DEFAULT_LIST_ID = '687cf40ce6cf47d1cd9f7ea7';

// GitHub API初期化
const github = new Octokit({
  auth: GITHUB_TOKEN
});

// キャッシュクラス
class TaskCache {
    constructor() {
        this.cache = null;
        this.lastUpdate = 0;
        this.CACHE_DURATION = 30 * 1000; // 30秒間キャッシュ
    }
    
    async getAllCards() {
        const now = Date.now();
        
        // キャッシュが有効な場合はそれを返す
        if (this.cache && (now - this.lastUpdate) < this.CACHE_DURATION) {
            console.log('📦 キャッシュからタスクデータを取得');
            return this.cache;
        }
        
        // キャッシュが古い場合は新しく取得
        console.log('🔄 TrelloAPIから最新データを取得');
        this.cache = await TrelloAPI.getAllCards();
        this.lastUpdate = now;
        return this.cache;
    }
    
    // キャッシュをクリア（タスクに変更があった時に呼び出し）
    clear() {
        console.log('🗑️ タスクキャッシュをクリア');
        this.cache = null;
        this.lastUpdate = 0;
    }
    
    // キャッシュの状態を確認
    getStatus() {
        const now = Date.now();
        const age = this.cache ? Math.floor((now - this.lastUpdate) / 1000) : null;
        return {
            hasCache: !!this.cache,
            ageSeconds: age,
            isValid: this.cache && (now - this.lastUpdate) < this.CACHE_DURATION
        };
    }
}

// キャッシュインスタンスを作成
const taskCache = new TaskCache();

// Discordクライアントの初期化
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Trello API関数
class TrelloAPI {
    static async createCard(name, description = '', listId = null) {
        try {
            const targetListId = listId || DEFAULT_LIST_ID;
            const response = await axios.post('https://api.trello.com/1/cards', {
                key: TRELLO_API_KEY,
                token: TRELLO_TOKEN,
                idList: targetListId,
                name: name,
                desc: description
            });
            return response.data;
        } catch (error) {
            console.error('Trelloカード作成エラー:', error.response?.data || error.message);
            throw error;
        }
    }

    static async getCards(listId = null) {
        try {
            const targetListId = listId || TRELLO_LIST_ID;
            const response = await axios.get(`https://api.trello.com/1/lists/${targetListId}/cards`, {
                params: {
                    key: TRELLO_API_KEY,
                    token: TRELLO_TOKEN
                }
            });
            return response.data;
        } catch (error) {
            console.error('Trelloカード取得エラー:', error.response?.data || error.message);
            throw error;
        }
    }

    static async getAllCards() {
        try {
            const allCards = [];
            for (const [listName, listId] of Object.entries(LISTS)) {
                const response = await axios.get(`https://api.trello.com/1/lists/${listId}/cards`, {
                    params: {
                        key: TRELLO_API_KEY,
                        token: TRELLO_TOKEN
                    }
                });
                const cardsWithList = response.data.map(card => ({
                    ...card,
                    listName: listName
                }));
                allCards.push(...cardsWithList);
            }
            return allCards;
        } catch (error) {
            console.error('Trello全カード取得エラー:', error.response?.data || error.message);
            throw error;
        }
    }

    static async moveCard(cardId, targetListId) {
        try {
            await axios.put(`https://api.trello.com/1/cards/${cardId}`, {
                key: TRELLO_API_KEY,
                token: TRELLO_TOKEN,
                idList: targetListId
            });
            return true;
        } catch (error) {
            console.error('Trelloカード移動エラー:', error.response?.data || error.message);
            throw error;
        }
    }

    static async deleteCard(cardId) {
        try {
            await axios.delete(`https://api.trello.com/1/cards/${cardId}`, {
                params: {
                    key: TRELLO_API_KEY,
                    token: TRELLO_TOKEN
                }
            });
            return true;
        } catch (error) {
            console.error('Trelloカード削除エラー:', error.response?.data || error.message);
            throw error;
        }
    }
}

// GitHub API関数
class GitHubAPI {
    static async createPlanningIssue(trelloCard) {
        try {
            const issue = await github.rest.issues.create({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO_DEFAULT,
                title: trelloCard.name,
                body: `## 📋 要件概要
${trelloCard.desc || ''}

## 🔍 実装検討
- [ ] 影響範囲の調査
- [ ] 技術仕様の決定
- [ ] 作業分担の決定
- [ ] 実装方針の確定

## 🔗 関連リソース
- **Trello Card**: ${trelloCard.shortUrl}

---
**Planning Issue**: 要件管理用Issue`,
                labels: ['requirements', 'planning']
            });
            
            return issue.data;
        } catch (error) {
            console.error('GitHub Planning Issue作成エラー:', error);
            throw error;
        }
    }
}

// スラッシュコマンドの定義
const commands = [
    // 基本コマンド
    new SlashCommandBuilder()
        .setName('add-task')
        .setDescription('指定したリストに新しいタスクを追加します')
        .addStringOption(option =>
            option.setName('list')
                .setDescription('追加先のリスト')
                .setRequired(true)
                .addChoices(
                    { name: 'アイデア', value: 'アイデア' },
                    { name: '決定要件', value: '決定要件' },
                    { name: '今回改修', value: '今回改修' },
                    { name: '作業中', value: '作業中' },
                    { name: 'リリース待ち', value: 'リリース待ち' },
                    { name: 'リリース済', value: 'リリース済' }
                ))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('タスクのタイトル')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('タスクの詳細説明')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('list-tasks')
        .setDescription('Trelloのタスク一覧を表示します')
        .addStringOption(option =>
            option.setName('list')
                .setDescription('表示するリスト')
                .setRequired(false)
                .addChoices(
                    { name: 'アイデア', value: 'アイデア' },
                    { name: '決定要件', value: '決定要件' },
                    { name: '今回改修', value: '今回改修' },
                    { name: '作業中', value: '作業中' },
                    { name: 'リリース待ち', value: 'リリース待ち' },
                    { name: 'リリース済', value: 'リリース済' }
                ))
        .addBooleanOption(option =>
            option.setName('all')
                .setDescription('完了済みタスクも含めて全て表示する')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('delete-task')
        .setDescription('Trelloのタスクを削除します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('削除するタスクのタイトル')
                .setRequired(true)
                .setAutocomplete(true)),

    new SlashCommandBuilder()
        .setName('show-lists')
        .setDescription('利用可能なリスト一覧を表示します'),

    // ワークフロー専用コマンド
    new SlashCommandBuilder()
        .setName('idea')
        .setDescription('新しいアイデアを追加します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('アイデアのタイトル')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('アイデアの詳細説明')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('spec')
        .setDescription('タスクを「決定要件」に移動します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('移動するタスクのタイトル')
                .setRequired(true)
                .setAutocomplete(true)),

    new SlashCommandBuilder()
        .setName('todo')
        .setDescription('タスクを「今回改修」に移動します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('移動するタスクのタイトル')
                .setRequired(true)
                .setAutocomplete(true)),

    new SlashCommandBuilder()
        .setName('doing')
        .setDescription('タスクを「作業中」に移動します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('移動するタスクのタイトル')
                .setRequired(true)
                .setAutocomplete(true)),

    new SlashCommandBuilder()
        .setName('ready')
        .setDescription('タスクを「リリース待ち」に移動します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('移動するタスクのタイトル')
                .setRequired(true)
                .setAutocomplete(true)),

    new SlashCommandBuilder()
        .setName('done')
        .setDescription('タスクを「リリース済」に移動します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('移動するタスクのタイトル')
                .setRequired(true)
                .setAutocomplete(true))
];

// ボット起動時の処理
client.once('ready', async () => {
    console.log(`${client.user.tag} がログインしました！`);

    // スラッシュコマンドを登録
    try {
        console.log('スラッシュコマンドを登録中...');
        await client.application.commands.set(commands);
        console.log('スラッシュコマンドの登録が完了しました');
    } catch (error) {
        console.error('スラッシュコマンドの登録に失敗:', error);
    }

    // 記事管理機能を初期化
    try {
        console.log('記事管理機能を初期化中...');
        initializeDatabase();
        if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
            initializeClaudeClient(ANTHROPIC_API_KEY);
            console.log('✅ 記事管理機能の初期化が完了しました');
        } else {
            console.warn('⚠️  ANTHROPIC_API_KEY が設定されていません。記事の自動分類は無効です。');
        }
    } catch (error) {
        console.error('記事管理機能の初期化に失敗:', error);
    }
});

// オートコンプリート処理
async function handleAutocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    console.log('オートコンプリート実行:', {
        optionName: focusedOption.name,
        userInput: focusedOption.value
    });
    
    if (focusedOption.name === 'title') {
        try {
            // キャッシュから全てのタスクを取得
            const allCards = await taskCache.getAllCards();
            console.log(`📋 取得したカード数: ${allCards.length}`);
            
            // キャッシュの状態をログ出力
            const cacheStatus = taskCache.getStatus();
            console.log('💾 キャッシュ状態:', cacheStatus);
            
            // デバッグ: 最初の3つのカードを表示
            if (allCards.length > 0) {
                console.log('最初の3つのカード:', allCards.slice(0, 3).map(card => ({
                    name: card.name,
                    listName: card.listName
                })));
            }
            
            // ユーザーの入力に基づいて候補をフィルタリング
            const input = focusedOption.value.toLowerCase();
            console.log('🔍 フィルタリング対象の入力:', input);
            
            let filtered;
            if (input === '') {
                // 入力が空の場合は全てのカードを表示（最大25個）
                filtered = allCards.slice(0, 25).map(card => ({
                    name: `${card.name} (${card.listName})`,
                    value: card.name
                }));
            } else {
                // 部分一致でフィルタリング
                filtered = allCards
                    .filter(card => card.name.toLowerCase().includes(input))
                    .slice(0, 25)
                    .map(card => ({
                        name: `${card.name} (${card.listName})`,
                        value: card.name
                    }));
            }
            
            console.log(`✅ フィルタリング結果: ${filtered.length}個の候補`);
            if (filtered.length > 0) {
                console.log('候補の例:', filtered.slice(0, 3));
            }
            
            await interaction.respond(filtered);
        } catch (error) {
            console.error('オートコンプリートエラー:', error);
            console.error('エラー詳細:', error.stack);
            // エラー時は空の配列を返す
            await interaction.respond([]);
        }
    }
}

// タスク追加の処理
async function handleAddTask(interaction, options) {
    await interaction.deferReply();
    
    const listName = options.getString('list');
    const title = options.getString('title');
    const description = options.getString('description') || '';
    
    const listId = LISTS[listName];
    if (!listId) {
        await interaction.editReply('指定されたリストが見つかりません。');
        return;
    }
    
    const card = await TrelloAPI.createCard(title, description, listId);
    
    // タスクが追加されたのでキャッシュをクリア
    taskCache.clear();
    
    const embed = new EmbedBuilder()
        .setColor(0x0079bf)
        .setTitle('✅ タスクが追加されました')
        .addFields(
            { name: 'タイトル', value: title, inline: false },
            { name: '説明', value: description || 'なし', inline: false },
            { name: 'リスト', value: listName, inline: false },
            { name: 'Trelloリンク', value: `[カードを開く](${card.shortUrl})`, inline: false }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// スラッシュコマンドの処理
client.on('interactionCreate', async interaction => {
    // オートコンプリートの処理
    if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'add-task':
                await handleAddTask(interaction, options);
                break;
            case 'list-tasks':
                await handleListTasks(interaction, options);
                break;
            case 'delete-task':
                await handleDeleteTask(interaction, options);
                break;
            case 'show-lists':
                await handleShowLists(interaction);
                break;
            // ワークフローコマンド
            case 'idea':
                await handleIdeaCommand(interaction, options);
                break;
            case 'spec':
                await handleSpecCommand(interaction, options);
                break;
            case 'todo':
                await handleWorkflowMove(interaction, options, '今回改修');
                break;
            case 'doing':
                await handleWorkflowMove(interaction, options, '作業中');
                break;
            case 'ready':
                await handleWorkflowMove(interaction, options, 'リリース待ち');
                break;
            case 'done':
                await handleWorkflowMove(interaction, options, 'リリース済');
                break;
        }
    } catch (error) {
        console.error('コマンド実行エラー:', error);
        const errorMessage = 'コマンドの実行中にエラーが発生しました。';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// タスク一覧表示の処理
async function handleListTasks(interaction, options) {
    await interaction.deferReply();
    
    const listName = options?.getString('list');
    const showAll = options?.getBoolean('all') || false;
    
    if (listName) {
        // 特定のリストのタスク表示
        const listId = LISTS[listName];
        if (!listId) {
            await interaction.editReply('指定されたリストが見つかりません。');
            return;
        }
        
        const cards = await TrelloAPI.getCards(listId);
        
        if (cards.length === 0) {
            await interaction.editReply(`「${listName}」にタスクはありません。`);
            return;
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x0079bf)
            .setTitle(`📋 ${listName} のタスク一覧`)
            .setTimestamp();
        
        cards.slice(0, 25).forEach((card, index) => {
            embed.addFields({
                name: `${index + 1}. ${card.name}`,
                value: card.desc || '説明なし',
                inline: false
            });
        });
        
        if (cards.length > 25) {
            embed.setFooter({ text: `他に${cards.length - 25}個のタスクがあります` });
        }
        
        await interaction.editReply({ embeds: [embed] });
    } else {
        // 全リストのタスク表示
        const allCards = await taskCache.getAllCards();
        
        // showAllがfalseの場合、「リリース済」を除外
        const filteredCards = showAll 
            ? allCards 
            : allCards.filter(card => card.listName !== 'リリース済');
        
        if (filteredCards.length === 0) {
            const message = showAll 
                ? '現在タスクはありません。' 
                : '現在進行中のタスクはありません。';
            await interaction.editReply(message);
            return;
        }
        
        const titleSuffix = showAll ? '全タスク一覧' : '進行中タスク一覧';
        const embed = new EmbedBuilder()
            .setColor(0x0079bf)
            .setTitle(`📋 ${titleSuffix}`)
            .setTimestamp();
        
        // リスト別にグループ化
        const cardsByList = {};
        filteredCards.forEach(card => {
            if (!cardsByList[card.listName]) {
                cardsByList[card.listName] = [];
            }
            cardsByList[card.listName].push(card);
        });
        
        // 表示対象のリストを決定
        const targetLists = showAll 
            ? Object.keys(LISTS)
            : Object.keys(LISTS).filter(listName => listName !== 'リリース済');
        
        // 各リストのタスクを表示
        targetLists.forEach(listName => {
            const listCards = cardsByList[listName] || [];
            if (listCards.length > 0) {
                const cardNames = listCards.slice(0, 5).map(card => `• ${card.name}`).join('\n');
                const additionalCount = listCards.length > 5 ? `\n...他${listCards.length - 5}個` : '';
                embed.addFields({
                    name: `${listName} (${listCards.length}個)`,
                    value: cardNames + additionalCount,
                    inline: false
                });
            }
        });
        
        // フッターに説明を追加
        if (!showAll) {
            embed.setFooter({ text: '完了済みタスクも見たい場合は all:True を指定してください' });
        }
        
        await interaction.editReply({ embeds: [embed] });
    }
}

// タスク削除の処理
async function handleDeleteTask(interaction, options) {
    await interaction.deferReply();
    
    const title = options.getString('title');
    const allCards = await taskCache.getAllCards();
    
    const targetCard = allCards.find(card => 
        card.name.toLowerCase().includes(title.toLowerCase())
    );
    
    if (!targetCard) {
        await interaction.editReply(`「${title}」に一致するタスクが見つかりませんでした。`);
        return;
    }
    
    await TrelloAPI.deleteCard(targetCard.id);
    
    // タスクが削除されたのでキャッシュをクリア
    taskCache.clear();
    
    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🗑️ タスクが削除されました')
        .addFields(
            { name: 'タイトル', value: targetCard.name, inline: false },
            { name: 'リスト', value: targetCard.listName, inline: false }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// リスト一覧表示の処理
async function handleShowLists(interaction) {
    await interaction.deferReply();
    
    const embed = new EmbedBuilder()
        .setColor(0x0079bf)
        .setTitle('📋 利用可能なリスト一覧')
        .setDescription(Object.keys(LISTS).map((listName, index) => 
            `${index + 1}. **${listName}**`
        ).join('\n'))
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// ワークフローコマンド: アイデア追加
async function handleIdeaCommand(interaction, options) {
    await interaction.deferReply();
    
    const title = options.getString('title');
    const description = options.getString('description') || '';
    const ideaListId = LISTS['アイデア'];
    
    const card = await TrelloAPI.createCard(title, description, ideaListId);
    
    // タスクが追加されたのでキャッシュをクリア
    taskCache.clear();
    
    const embed = new EmbedBuilder()
        .setColor(0xffeb3b)
        .setTitle('💡 アイデアが追加されました')
        .addFields(
            { name: 'タイトル', value: title, inline: false },
            { name: '説明', value: description || 'なし', inline: false },
            { name: 'リスト', value: 'アイデア', inline: false },
            { name: 'Trelloリンク', value: `[カードを開く](${card.shortUrl})`, inline: false }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// ワークフローコマンド: タスク移動
async function handleWorkflowMove(interaction, options, targetListName) {
    await interaction.deferReply();
    
    const title = options.getString('title');
    const targetListId = LISTS[targetListName];
    
    if (!targetListId) {
        await interaction.editReply('指定されたリストが見つかりません。');
        return;
    }
    
    const allCards = await taskCache.getAllCards();
    const targetCard = allCards.find(card => 
        card.name.toLowerCase().includes(title.toLowerCase())
    );
    
    if (!targetCard) {
        await interaction.editReply(`「${title}」に一致するタスクが見つかりませんでした。`);
        return;
    }
    
    await TrelloAPI.moveCard(targetCard.id, targetListId);
    
    // タスクが移動されたのでキャッシュをクリア
    taskCache.clear();
    
    // リストごとの絵文字とカラー
    const listConfig = {
        '決定要件': { emoji: '📋', color: 0x2196f3 },
        '今回改修': { emoji: '📝', color: 0xff9800 },
        '作業中': { emoji: '⚡', color: 0xe91e63 },
        'リリース待ち': { emoji: '🚀', color: 0x9c27b0 },
        'リリース済': { emoji: '✨', color: 0x4caf50 }
    };
    
    const config = listConfig[targetListName] || { emoji: '🔄', color: 0x607d8b };
    
    const embed = new EmbedBuilder()
        .setColor(config.color)
        .setTitle(`${config.emoji} タスクが「${targetListName}」に移動しました`)
        .addFields(
            { name: 'タイトル', value: targetCard.name, inline: false },
            { name: '移動元', value: targetCard.listName, inline: true },
            { name: '移動先', value: targetListName, inline: true }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// /spec コマンド専用処理（GitHub連携付き）
async function handleSpecCommand(interaction, options) {
    await interaction.deferReply();
    
    const title = options.getString('title');
    const targetListName = '決定要件';
    const targetListId = LISTS[targetListName];
    
    try {
        // 1. Trello処理（既存と同じ）
        const allCards = await taskCache.getAllCards();
        const targetCard = allCards.find(card => 
            card.name.toLowerCase().includes(title.toLowerCase())
        );
        
        if (!targetCard) {
            await interaction.editReply(`「${title}」に一致するタスクが見つかりませんでした。`);
            return;
        }
        
        await TrelloAPI.moveCard(targetCard.id, targetListId);
        taskCache.clear();
        
        // 2. GitHub Planning Issue作成（新機能）
        let githubResult = '';
        try {
            const planningIssue = await GitHubAPI.createPlanningIssue(targetCard);
            githubResult = `\n🐙 **GitHub**: Planning Issue #${planningIssue.number} を作成\n🔗 ${planningIssue.html_url}`;
        } catch (error) {
            console.error('GitHub連携エラー:', error);
            githubResult = '\n⚠️ **GitHub**: Issue作成に失敗しました';
        }
        
        // 3. 結果表示
        const embed = new EmbedBuilder()
            .setColor(0x2196f3)
            .setTitle('📋 要件決定完了！')
            .addFields(
                { name: 'タスク', value: targetCard.name, inline: false },
                { name: 'Trello', value: `「${targetCard.listName}」→「${targetListName}」に移動`, inline: false }
            )
            .setDescription(githubResult)
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('/spec コマンドエラー:', error);
        await interaction.editReply('処理中にエラーが発生しました。');
    }
}

// メッセージ受信時の処理（記事管理機能）
client.on('messageCreate', async (message) => {
    try {
        await handleMessage(message);
    } catch (error) {
        console.error('メッセージ処理エラー:', error);
    }
});

// リアクションでタスク追加
client.on('messageReactionAdd', async (reaction, user) => {
    // ボット自身のリアクションは無視
    if (user.bot) return;

    // 記事管理機能のリアクション処理
    await handleReactionAdd(reaction, user);

    // 📋 絵文字の場合のみ処理（既存のTrello機能）
    if (reaction.emoji.name === '📋') {
        try {
            const message = reaction.message;

            // メッセージからタイトルを生成（最大50文字に制限）
            let title = message.content.trim();
            if (title.length > 50) {
                title = title.substring(0, 47) + '...';
            }

            // メッセージが空の場合のフォールバック
            if (!title) {
                title = `${user.username}からのタスク`;
            }

            const description = `📋 ${user.username}さんがリアクションで追加\n\n元メッセージ: ${message.content}\n送信者: ${message.author.username}\nチャンネル: ${message.channel.name}`;

            // デフォルトで「アイデア」リストに追加
            await TrelloAPI.createCard(title, description, LISTS['アイデア']);

            // タスクが追加されたのでキャッシュをクリア
            taskCache.clear();

            // 確認メッセージを送信
            await message.reply(`📋 ${user.username}さん、「${title}」を「アイデア」リストのタスクとして追加しました！`);
        } catch (error) {
            console.error('リアクションタスク追加エラー:', error);
            await reaction.message.reply('タスクの追加中にエラーが発生しました。');
        }
    }
});

// エラーハンドリング
client.on('error', error => {
    console.error('Discordクライアントエラー:', error);
});

process.on('unhandledRejection', error => {
    console.error('未処理のPromise拒否:', error);
});

// ボットを起動
client.login(DISCORD_TOKEN);