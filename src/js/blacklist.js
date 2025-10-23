import * as settings from './settings.js';

const COAL_URL = 'https://corsproxy.io/?https://gitlab.com/blurt/openblurt/coal/-/raw/master/coal.json';
const LOCAL_BLACKLIST_URL = './local.json';

let blacklist = {
    authors: {},
    posts: []
};

export async function initBlacklist() {
    if (settings.getSetting('USE_COAL')) {
        try {
            const coalResponse = await fetch(COAL_URL);
            if (coalResponse.ok) {
                const coalData = await coalResponse.json();
                for (const author in coalData) {
                    blacklist.authors[author] = { reason: coalData[author].reason || 'Banned by COAL' };
                }
                console.log('COAL blacklist loaded.');
            }
        } catch (error) {
            console.warn("Could not load remote COAL blacklist. Continuing with local blacklist only.", error);
        }
    }

    try {
        const localResponse = await fetch(LOCAL_BLACKLIST_URL);
        if (localResponse.ok) {
            const localData = await localResponse.json();
            if (localData.authors) {
                Object.assign(blacklist.authors, localData.authors);
            }
            if (localData.posts) {
                blacklist.posts = [...new Set([...blacklist.posts, ...localData.posts])];
            }
            console.log('Local blacklist loaded.');
        }
    } catch (error) {
        console.error("Could not load local.json:", error);
    }
}

export function isBlacklisted(author, permlink = '') {
    if (blacklist.authors[author]) {
        return true;
    }
    if (permlink && blacklist.posts.includes(`${author}/${permlink}`)) {
        return true;
    }
    return false;
}