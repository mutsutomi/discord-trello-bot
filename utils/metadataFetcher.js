const ogs = require('open-graph-scraper');

/**
 * URLからOGP情報を取得
 * @param {string} url - 取得対象のURL
 * @returns {Promise<Object>} メタデータ
 */
async function fetchMetadata(url) {
    try {
        const options = {
            url: url,
            timeout: 10000, // 10秒でタイムアウト
            retry: 2,
            headers: {
                'user-agent': 'Mozilla/5.0 (compatible; Discord Article Bot/1.0)'
            }
        };

        const { result, error } = await ogs(options);

        if (error) {
            console.error('OGP取得エラー:', error);
            return {
                title: url,
                description: '',
                image: null,
                siteName: null,
                success: false
            };
        }

        return {
            title: result.ogTitle || result.twitterTitle || result.dcTitle || url,
            description: result.ogDescription || result.twitterDescription || result.dcDescription || '',
            image: result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || null,
            siteName: result.ogSiteName || null,
            type: result.ogType || 'website',
            success: true
        };
    } catch (error) {
        console.error('メタデータ取得エラー:', error);
        return {
            title: url,
            description: '',
            image: null,
            siteName: null,
            success: false,
            error: error.message
        };
    }
}

/**
 * Twitter/XのURLからメタデータを取得
 * @param {string} url - Twitter/XのURL
 * @returns {Promise<Object>} メタデータ
 */
async function fetchTwitterMetadata(url) {
    try {
        // TwitterのOGPは通常のOGP取得で対応可能
        const metadata = await fetchMetadata(url);

        // Twitter特有の情報を追加
        metadata.platform = 'twitter';
        metadata.isTwitter = true;

        return metadata;
    } catch (error) {
        console.error('Twitter メタデータ取得エラー:', error);
        return {
            title: url,
            description: '',
            image: null,
            platform: 'twitter',
            isTwitter: true,
            success: false,
            error: error.message
        };
    }
}

/**
 * 複数のURLからメタデータを取得
 * @param {Array<string>} urls - URLの配列
 * @returns {Promise<Array<Object>>} メタデータの配列
 */
async function fetchMultipleMetadata(urls) {
    const promises = urls.map(url => fetchMetadata(url));
    return await Promise.allSettled(promises).then(results =>
        results.map((result, index) => ({
            url: urls[index],
            metadata: result.status === 'fulfilled' ? result.value : {
                title: urls[index],
                description: '',
                image: null,
                success: false,
                error: 'Failed to fetch'
            }
        }))
    );
}

/**
 * メタデータの要約を作成（Claude APIに送信する前の整形用）
 * @param {Object} metadata - メタデータ
 * @returns {string} 要約文
 */
function createMetadataSummary(metadata) {
    const parts = [];

    if (metadata.title && metadata.title !== metadata.url) {
        parts.push(`タイトル: ${metadata.title}`);
    }

    if (metadata.description) {
        // 説明文が長い場合は300文字に制限
        const desc = metadata.description.length > 300
            ? metadata.description.substring(0, 300) + '...'
            : metadata.description;
        parts.push(`説明: ${desc}`);
    }

    if (metadata.siteName) {
        parts.push(`サイト: ${metadata.siteName}`);
    }

    return parts.join('\n');
}

/**
 * URLが有効かどうかをチェック
 * @param {string} url - チェック対象のURL
 * @returns {boolean} 有効な場合true
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    fetchMetadata,
    fetchTwitterMetadata,
    fetchMultipleMetadata,
    createMetadataSummary,
    isValidUrl
};
