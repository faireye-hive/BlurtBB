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
export async function getPostWithReplies(author, permlink) {
    // 1. Fetch the root post
    const post = await new Promise((resolve, reject) => {
        blurt.api.getContent(author, permlink, (err, result) => err ? reject(err) : resolve(result));
    });

    if (!post || post.author === '') {
        throw new Error('Post not found');
    }

    // 2. Create a recursive function to fetch all descendants
    const fetchRepliesRecursive = async (parentAuthor, parentPermlink) => {
        const replies = await new Promise((resolve, reject) => {
            blurt.api.getContentReplies(parentAuthor, parentPermlink, (err, result) => err ? reject(err) : resolve(result));
        });

        // For each reply, recursively fetch its own replies
        const repliesWithChildren = await Promise.all(
            replies.map(async (reply) => {
                const children = await fetchRepliesRecursive(reply.author, reply.permlink);
                reply.replies = children; // Attach the fetched children
                return reply;
            })
        );

        return repliesWithChildren;
    };

    // 3. Start the recursive fetch from the root post
    post.replies = await fetchRepliesRecursive(author, permlink);
    return post;
}

/**
 * Fetches a single post and its direct replies (non-recursive).
 * Used for lightweight polling.
 * @param {string} author 
 * @param {string} permlink 
 * @returns {Promise<Object>}
 */
export async function getPostAndDirectReplies(author, permlink) {
    return new Promise((resolve, reject) => {
        blurt.api.getContent(author, permlink, (err, post) => {
            if (err) return reject(err);
            blurt.api.getContentReplies(author, permlink, (err, replies) => {
                if (err) return reject(err);
                // The poller expects an object with 'post' and 'replies' properties.
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
        blurt.broadcast.send({ operations, extensions: [] }, { posting: key }, (err, result) => {
            if (err) return reject(err);
            resolve({ result, finalPermlink: permlink });
        });
    });
}

/**
 * Broadcasts a reply to an existing post.
 */
export async function broadcastReply(author, key, parentAuthor, parentPermlink, body) {
    const timestamp = new Date().getTime();
    const permlink = `re-${parentPermlink}-${timestamp}`;
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
        blurt.broadcast.send({ operations, extensions: [] }, { posting: key }, (err, result) => {
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

/**
 * Busca os dados detalhados de uma conta.
 * Usa blurt.api.getAccounts.
 * @param {string} username - O nome de usuário.
 * @returns {Promise<Object|null>} O objeto da conta ou null se não for encontrado.
 */
export async function getAccount(username) {
    if (!username) return null;
    
    return new Promise((resolve, reject) => {
        // blurt.api.getAccounts recebe um array de nomes de usuário
        blurt.api.getAccounts([username], (err, result) => {
            if (err) return reject(err);
            
            // Retorna o primeiro (e único) objeto da conta
            if (result && result.length > 0) {
                // O resultado contém todos os dados da conta (saldo, BP, created)
                resolve(result[0]);
            } else {
                resolve(null);
            }
        });
    });
}

/**
 * Busca posts/tópicos criados por um autor, usando o feed 'blog', com suporte à paginação.
 * Usa blurt.api.getDiscussionsByBlog.
 * @param {string} author - O autor dos posts.
 * @param {number} limit - Número máximo de itens para buscar.
 * @param {string|null} startAuthor - O autor do último post da lista anterior (para paginação).
 * @param {string|null} startPermlink - O permlink do último post da lista anterior (para paginação).
 * @returns {Promise<Array>} Um array de objetos post/discussão.
 */
export async function getPostsByAuthor(author, limit = 20, startAuthor = null, startPermlink = null) {
    const query = {
        tag: author, 
        limit: limit,
        // Adiciona os parâmetros de paginação
        start_author: startAuthor || undefined, // undefined não envia o parâmetro se for null
        start_permlink: startPermlink || undefined
    };
    
    return new Promise((resolve, reject) => {
        blurt.api.getDiscussionsByBlog(query, (err, result) => {
            if (err) {
                return reject(new Error(`API Error fetching blog for ${author}: ${err.message || JSON.stringify(err)}`));
            }
            // A API retorna 1 item duplicado (o post de partida) se start_author for usado. 
            // Precisamos removê-lo.
            if (startAuthor && result.length > 0) {
                 // Se o primeiro item for o que usamos como ponto de partida, ele é duplicado (exceto na primeira chamada)
                 if (result[0].author === startAuthor && result[0].permlink === startPermlink) {
                     // Remove o duplicado e retorna o restante (os novos posts)
                     return resolve(result.slice(1) || []);
                 }
            }
            
            resolve(result || []);
        });
    });
}

export async function getAllPostsByAuthor(author, batchSize = 100) {
  let allPosts = [];
  let startAuthor = null;
  let startPermlink = null;
  let keepGoing = true;

  while (keepGoing) {
    const posts = await getPostsByAuthor(author, batchSize, startAuthor, startPermlink);

    if (posts.length === 0) break;

    const ownPosts = posts.filter(
      (p) => p.author === author && (!p.reblogged_by || p.reblogged_by.length === 0)
    );
    allPosts.push(...ownPosts);

    // Atualiza o ponto de partida para a próxima requisição
    const last = posts[posts.length - 1];
    startAuthor = last.author;
    startPermlink = last.permlink;

    // A API retorna o mesmo último item na próxima chamada — evita loop infinito
    if (posts.length < batchSize) {
      keepGoing = false;
    }
  }
  console.log('allPosts');
  console.log(allPosts);
  return allPosts;
}


/**
 * Busca todos os comentários feitos por um autor no Hive.
 * 
 * @param {string} author - Nome do autor (ex: 'meunome').
 * @param {number} batchSize - Quantos comentários por chamada (máx: 100).
 * @returns {Promise<Array>} Lista completa de comentários do autor.
 */
export async function getAllCommentsByAuthor(author, batchSize = 100) {
  let allComments = [];
  let startAuthor = null;
  let startPermlink = null;
  let keepGoing = true;

  console.log(`Iniciando busca de comentários para o autor: ${author}`);

  while (keepGoing) {
    const comments = await getCommentsByAuthor(author, batchSize, startAuthor, startPermlink);

    if (comments.length === 0) break;

    // 🔹 Filtra só comentários do autor (às vezes vem algum post raiz, raro)
    const onlyComments = comments.filter(
      c => c.author === author && c.parent_author && c.parent_author.length > 0
    );

    allComments.push(...onlyComments);

    const last = comments[comments.length - 1];
    startAuthor = last.author;
    startPermlink = last.permlink;

    if (comments.length < batchSize) keepGoing = false;
  }

  return allComments;
}

/**
 * Função auxiliar para pegar um lote de comentários.
 */
export async function getCommentsByAuthor(author, limit = 20, startAuthor = null, startPermlink = null) {
  const query = {
    start_author: author || undefined,
    start_permlink: startPermlink || undefined,
    limit,
  };

  return new Promise((resolve, reject) => {
    blurt.api.getDiscussionsByComments(query, (err, result) => {
      if (err) {
        return reject(new Error(`Erro ao buscar comentários de ${author}: ${err.message || JSON.stringify(err)}`));
      }
      console.log('result aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      console.log(result);
      // Remove duplicado se for paginação
      if (startAuthor && result.length > 0) {
        if (result[0].author === startAuthor && result[0].permlink === startPermlink) {
          return resolve(result.slice(1));
        }
      }

      resolve(result || []);
    });
  });
}

/**
 * Prepara o array de operações para um novo post (sem fazer o broadcast).
 * Isso é usado principalmente pelo Blurt Keychain, que precisa do array de operações.
 * @param {string} author - O nome de usuário do autor.
 * @param {string} categoryId - A categoria do post.
 * @param {string} title - O título do post.
 * @param {string} body - O corpo do post (conteúdo).
 * @returns {Array} O array de operações do Blurt ([['comment', {...}], ['comment_options', {...}]]).
 */
export function preparePostOperations(author, categoryId, title, body) {
    const permlink = blurt.formatter.commentPermlink(author, title);
    const parentPermlink = categoryId;
    const parentAuthor = ''; // Post de nível superior
    const jsonMetadata = JSON.stringify({
        tags: [categoryId],
        app: CONFIG.app_name, // Assumindo que CONFIG está disponível
        version: CONFIG.app_version,
    });

    const commentOp = [
        'comment',
        {
            parent_author: parentAuthor,
            parent_permlink: parentPermlink,
            author: author,
            permlink: permlink,
            title: title,
            body: body,
            json_metadata: jsonMetadata,
        },
    ];

    const commentOptions = [
        'comment_options',
        {
            author: author,
            permlink: permlink,
            max_accepted_payout: '1000000.000 BLURT', // Padrão, ajuste conforme necessário
            percent_blurt_dollars: 10000, // 50% BLURT POWER, 50% BLURT. Ajuste se usar SBD ou apenas BLURT POWER.
            allow_votes: true,
            allow_curation_rewards: true,
            extensions: [
                // Adicione a extensão de beneficiários se necessário (Seu código já deve ter isso)
            ],
        },
    ];

    // O finalPermlink é retornado aqui para a função pollForPost
    commentOp.finalPermlink = permlink;

    return [commentOp, commentOptions];
}

export function prepareReplyOperations(author, parentAuthor, parentPermlink, body) {
    // Permlink da resposta: único para cada comentário no post
    const permlink = blurt.formatter.commentPermlink(author, parentPermlink); 
    const title = ''; 
    const jsonMetadata = JSON.stringify({
        // Inclua tags, app, etc., se necessário para a sua lógica de metadados
        app: 'blurtbb-app',
    });

    const commentOp = [
        'comment',
        {
            parent_author: parentAuthor,
            parent_permlink: parentPermlink,
            author: author,
            permlink: permlink,
            title: title, // Título vazio para comentários
            body: body,
            json_metadata: jsonMetadata,
        },
    ];

    // Para comentários, a operação 'comment' é suficiente. 
    // Se você precisar de opções avançadas (ex: beneficiários), adicione 'comment_options' aqui.
    return [commentOp];
}

export function prepareEditOperations(originalPost, newTitle, newBody) {
    // 1. O permlink e o autor devem ser os mesmos
    const author = originalPost.author;
    const permlink = originalPost.permlink;
    const parentAuthor = originalPost.parent_author;
    const parentPermlink = originalPost.parent_permlink;
    
    // 2. Os metadados devem ser mantidos ou recriados
    // Se o post original tiver json_metadata, você deve carregá-lo e atualizá-lo.
    let jsonMetadata = {};
    try {
        jsonMetadata = JSON.parse(originalPost.json_metadata);
        // Atualiza a timestamp de edição, se o seu app fizer isso
        jsonMetadata.app = CONFIG.app_name; 
    } catch (e) {
        // Se houver um erro ao analisar, cria um metadado básico
        jsonMetadata = { app: CONFIG.app_name };
    }
    
    // 3. Cria a operação 'comment' com os novos dados
    const commentOp = [
        'comment',
        {
            parent_author: parentAuthor,
            parent_permlink: parentPermlink,
            author: author,
            permlink: permlink,
            title: newTitle,
            body: newBody,
            json_metadata: JSON.stringify(jsonMetadata),
        },
    ];

    // Para edições, normalmente você só precisa da operação 'comment'
    return [commentOp];
}

export function prepareDeleteOperations(author, permlink) {
    const deleteOp = [
        'delete_comment',
        {
            author: author,
            permlink: permlink,
        },
    ];

    return [deleteOp];
}