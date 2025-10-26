/**
 * メッセージからURLを検出する
 * @param {string} message - 検出対象のメッセージ
 * @returns {Array<string>} 検出されたURLの配列
 */
function detectUrls(message) {
    if (!message || typeof message !== 'string') {
        return [];
    }

    // URLを検出する正規表現
    // https, http, wwwで始まるURL、および主要な技術サイトのドメイン
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|dev|co\.jp|jp)\/[^\s]+)/gi;

    const matches = message.match(urlRegex);

    if (!matches) {
        return [];
    }

    // 重複を除去し、正規化
    const urls = [...new Set(matches)].map(url => {
        // www.で始まるURLにhttps://を追加
        if (url.startsWith('www.')) {
            return `https://${url}`;
        }
        // その他のURLはそのまま
        return url;
    });

    // 末尾の記号を除去（カンマ、ピリオドなど）
    return urls.map(url => url.replace(/[.,;:!?)\]}>]+$/, ''));
}

/**
 * URLが技術記事サイトかどうかを判定
 * @param {string} url - 判定対象のURL
 * @returns {boolean} 技術記事サイトの場合true
 */
function isTechArticleUrl(url) {
    const techDomains = [
        'zenn.dev',
        'qiita.com',
        'note.com',
        'medium.com',
        'dev.to',
        'github.com',
        'stackoverflow.com',
        'techcrunch.com',
        'hatenablog.com',
        'hatena.ne.jp',
        'speakerdeck.com',
        'slideshare.net',
        'youtube.com',
        'youtu.be'
    ];

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        return techDomains.some(domain =>
            hostname === domain || hostname.endsWith(`.${domain}`)
        );
    } catch (error) {
        return false;
    }
}

/**
 * URLがTwitter/Xのリンクかどうかを判定
 * @param {string} url - 判定対象のURL
 * @returns {boolean} Twitter/Xのリンクの場合true
 */
function isTwitterUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        return hostname === 'twitter.com' ||
               hostname === 'x.com' ||
               hostname.endsWith('.twitter.com') ||
               hostname.endsWith('.x.com');
    } catch (error) {
        return false;
    }
}

/**
 * メッセージから技術記事のURLを検出
 * @param {string} message - 検出対象のメッセージ
 * @returns {Array<Object>} 検出されたURLとその種類の配列
 */
function detectTechUrls(message) {
    const urls = detectUrls(message);

    return urls.map(url => ({
        url,
        isTechArticle: isTechArticleUrl(url),
        isTwitter: isTwitterUrl(url),
        type: isTechArticleUrl(url) ? 'tech-article' :
              isTwitterUrl(url) ? 'twitter' : 'general'
    }));
}

/**
 * URLを正規化
 * @param {string} url - 正規化対象のURL
 * @returns {string} 正規化されたURL
 */
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);

        // クエリパラメータを削除（トラッキングパラメータなど）
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
        paramsToRemove.forEach(param => {
            urlObj.searchParams.delete(param);
        });

        // Twitter/XのURLを正規化
        if (isTwitterUrl(url)) {
            // twitter.com を x.com に統一
            urlObj.hostname = 'x.com';
        }

        return urlObj.toString();
    } catch (error) {
        return url;
    }
}

module.exports = {
    detectUrls,
    isTechArticleUrl,
    isTwitterUrl,
    detectTechUrls,
    normalizeUrl
};
