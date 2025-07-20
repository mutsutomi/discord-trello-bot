require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// 設定値（環境変数から読み込み）
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;

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
    static async createCard(name, description = '') {
        try {
            const response = await axios.post('https://api.trello.com/1/cards', {
                key: TRELLO_API_KEY,
                token: TRELLO_TOKEN,
                idList: TRELLO_LIST_ID,
                name: name,
                desc: description
            });
            return response.data;
        } catch (error) {
            console.error('Trelloカード作成エラー:', error.response?.data || error.message);
            throw error;
        }
    }

    static async getCards() {
        try {
            const response = await axios.get(`https://api.trello.com/1/lists/${TRELLO_LIST_ID}/cards`, {
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

// スラッシュコマンドの定義
const commands = [
    new SlashCommandBuilder()
        .setName('add-task')
        .setDescription('Trelloに新しいタスクを追加します')
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
        .setDescription('Trelloのタスク一覧を表示します'),
    
    new SlashCommandBuilder()
        .setName('delete-task')
        .setDescription('Trelloのタスクを削除します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('削除するタスクのタイトル')
                .setRequired(true))
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
});

// スラッシュコマンドの処理
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'add-task':
                await handleAddTask(interaction, options);
                break;
            case 'list-tasks':
                await handleListTasks(interaction);
                break;
            case 'delete-task':
                await handleDeleteTask(interaction, options);
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

// タスク追加の処理
async function handleAddTask(interaction, options) {
    await interaction.deferReply();
    
    const title = options.getString('title');
    const description = options.getString('description') || '';
    
    const card = await TrelloAPI.createCard(title, description);
    
    const embed = new EmbedBuilder()
        .setColor(0x0079bf)
        .setTitle('✅ タスクが追加されました')
        .addFields(
            { name: 'タイトル', value: title, inline: false },
            { name: '説明', value: description || 'なし', inline: false },
            { name: 'Trelloリンク', value: `[カードを開く](${card.shortUrl})`, inline: false }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// タスク一覧表示の処理
async function handleListTasks(interaction) {
    await interaction.deferReply();
    
    const cards = await TrelloAPI.getCards();
    
    if (cards.length === 0) {
        await interaction.editReply('現在タスクはありません。');
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x0079bf)
        .setTitle('📋 現在のタスク一覧')
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
}

// タスク削除の処理
async function handleDeleteTask(interaction, options) {
    await interaction.deferReply();
    
    const title = options.getString('title');
    const cards = await TrelloAPI.getCards();
    
    const targetCard = cards.find(card => 
        card.name.toLowerCase().includes(title.toLowerCase())
    );
    
    if (!targetCard) {
        await interaction.editReply(`「${title}」に一致するタスクが見つかりませんでした。`);
        return;
    }
    
    await TrelloAPI.deleteCard(targetCard.id);
    
    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🗑️ タスクが削除されました')
        .addFields({ name: 'タイトル', value: targetCard.name, inline: false })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// リアクションでタスク追加
client.on('messageReactionAdd', async (reaction, user) => {
    // ボット自身のリアクションは無視
    if (user.bot) return;
    
    // 📋 絵文字の場合のみ処理
    if (reaction.emoji.name === '📋') {
        try {
            const message = reaction.message;
            const title = `${user.username}からのタスク`;
            const description = `元メッセージ: ${message.content}\n送信者: ${message.author.username}\nチャンネル: ${message.channel.name}`;
            
            await TrelloAPI.createCard(title, description);
            
            // 確認メッセージを送信
            await message.reply(`📋 ${user.username}さん、メッセージをTrelloのタスクとして追加しました！`);
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