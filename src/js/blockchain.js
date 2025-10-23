import { CONFIG } from './config.js';
import * as beneficiaries from './beneficiaries.js';
import * as settings from './settings.js';

/**
 * Initializes the Blurt API with the RPC URL from settings.
 * This must be called after settings are loaded.
 */
export function initBlockchain() {
    const rpcUrl = settings.getSetting('RPC_URL');
    blurt.api.setOptions({ url: rpcUrl });
    console.log(`Blockchain initialized with RPC node: ${rpcUrl}`);
}

/**
 * Constructs the URL for a user's avatar.
 * @param {string} username
 * @returns {string} The avatar URL.
 */
export function getAvatarUrl(username) {
    if (!username) return 'https://imgp.blurt.world/profileimage/null/64x64';
    return `https://imgp.blurt.world/profileimage/${username}/64x64`;
}

/**
 * Fetches topics for a given category.
 * @param {string} categoryId 
 * @param {string} startAuthor 
 * @param {string} startPermlink 
 * @returns {Promise<Array>}
 */
export async function getTopics(categoryId, startAuthor = null, startPermlink = null) {
    const tag = `${CONFIG.tag_prefix}${categoryId}`;
    const limit = 15;
    const query = {
        tag: tag,
        limit: limit,
        start_author: startAuthor,
        start_permlink: startPermlink
    };
    return new Promise((resolve, reject) => {
        blurt.api.getDiscussionsByCreated(query, (err, result) => {
            if (err) return reject(err);
            // Filter out the initial tag post if it appears
            const filtered = result.filter(p => p.permlink !== tag);
            resolve(filtered);
        });
    });
}

/**
 * Fetches a single post and all its replies.
 * @param {string} author 
 * @param {string} permlink 
 * @returns {Promise<Object>}
 */
export async function getPostAndReplies(author, permlink) {
    return new Promise((resolve, reject) => {
        blurt.api.getContent(author, permlink, (err, post) => {
            if (err) return reject(err);
            blurt.api.getContentReplies(author, permlink, (err, replies) => {
                if (err) return reject(err);
                resolve({ post, replies });
            });
        });
    });
}

/**
 * Fetches the last reply for a given post.
 * @param {string} author 
 * @param {string} permlink 
 * @returns {Promise<Object|null>} The last reply object or null if none.
 */
export async function getLastReply(author, permlink) {
    return new Promise((resolve) => {
        blurt.api.getContentReplies(author, permlink, (err, replies) => {
            if (err || !replies || replies.length === 0) {
                return resolve(null);
            }
            resolve(replies[replies.length - 1]);
        });
    });
}

/**
 * Broadcasts a new post to the blockchain.
 * @returns {Promise<Object>} An object containing the final permlink.
 */
export async function broadcastPost(author, key, categoryId, title, body) {
    const permlink = await generatePermlink(author, title);
    const parentPermlink = `${CONFIG.tag_prefix}${categoryId}`;
    const jsonMetadata = JSON.stringify({ tags: [parentPermlink], app: 'blurtbb/0.1' });

    const operations = [
        ['comment', {
            parent_author: '',
            parent_permlink: parentPermlink,
            author: author,
            permlink: permlink,
            title: title,
            body: body,
            json_metadata: jsonMetadata
        }]
    ];

    const beneficiaryOps = beneficiaries.getBeneficiaryOps(author, permlink);
    if (beneficiaryOps) {
        operations.push(beneficiaryOps);
    }

    return new Promise((resolve, reject) => {
        blurt.broadcast.send({ operations: operations, extensions: [] }, { posting: key }, (err, result) => {
            if (err) return reject(err);
            resolve({ result, finalPermlink: permlink });
        });
    });
}

/**
 * Broadcasts a reply to an existing post.
 */
export async function broadcastReply(author, key, parentAuthor, parentPermlink, body) {
    const permlink = await generatePermlink(author, `re-${parentAuthor}-${parentPermlink}`);
    const jsonMetadata = JSON.stringify({ tags: [parentPermlink], app: 'blurtbb/0.1' });

    const operations = [
        ['comment', {
            parent_author: parentAuthor,
            parent_permlink: parentPermlink,
            author: author,
            permlink: permlink,
            title: '',
            body: body,
            json_metadata: jsonMetadata
        }]
    ];

    const beneficiaryOps = beneficiaries.getBeneficiaryOps(author, permlink);
    if (beneficiaryOps) {
        operations.push(beneficiaryOps);
    }

    return new Promise((resolve, reject) => {
        blurt.broadcast.send({ operations: operations, extensions: [] }, { posting: key }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

/**
 * Broadcasts an edit of an existing post or reply.
 */
export async function broadcastEdit(author, key, originalPost, title, body) {
    const metadata = JSON.parse(originalPost.json_metadata);
    
    // Robustly determine parent_permlink
    // For top-level posts, it's the first tag. For replies, it's the parent_permlink property.
    const parentPermlink = (metadata.tags && metadata.tags.length > 0) ? metadata.tags[0] : originalPost.parent_permlink;
    
    const parentAuthor = originalPost.parent_author || '';
    const jsonMetadata = JSON.stringify(metadata); // We pass the original metadata back

    const operation = ['comment', {
        parent_author: parentAuthor,
        parent_permlink: parentPermlink,
        author: author,
        permlink: originalPost.permlink,
        title: title,
        body: body,
        json_metadata: jsonMetadata
    }];

    return new Promise((resolve, reject) => {
        blurt.broadcast.send({ operations: [operation], extensions: [] }, { posting: key }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

/**
 * Broadcasts a vote.
 */
export async function broadcastVote(voter, key, author, permlink, weight) {
    return new Promise((resolve, reject) => {
        blurt.broadcast.vote(key, voter, author, permlink, weight, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

/**
 * Broadcasts a delete operation.
 */
export async function broadcastDelete(author, key, permlink) {
    return new Promise((resolve, reject) => {
        blurt.broadcast.deleteComment(key, author, permlink, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

/**
 * Generates a unique permlink for a new post or reply.
 * @param {string} author 
 * @param {string} title 
 * @returns {Promise<string>}
 */
async function generatePermlink(author, title) {
    let permlink = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (permlink.length === 0) {
        permlink = 'post';
    }

    // Check for uniqueness
    try {
        const content = await blurt.api.getContentAsync(author, permlink);
        if (content && content.author) {
            // If it exists, append a random string
            const randomSuffix = Math.random().toString(36).substring(2, 7);
            permlink = `${permlink}-${randomSuffix}`;
        }
        return permlink;
    } catch (error) {
        // An error likely means the permlink doesn't exist, which is good.
        return permlink;
    }
}