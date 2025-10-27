// =========================================================================
// RENDER.JS: RESPONSÁVEL POR MONTAR TODO O HTML DA PÁGINA (VIEWS)
// =========================================================================

// Importações dos módulos que a renderização necessita:
import {CONFIG} from './config.js'; 
import * as blockchain from './blockchain.js';
import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import { showLoader, 
        hideLoader, 
        processPostTree, 
        escapeSelector, 
        getRoleBadge,
        renderMarkdown,
        getAllCategories,
        createSnippet,
        extractRootLinkFromUrl,
        formatLocalTime } from './utils.js'; 
import { 
    handleVoteClick, 
    handleDeleteClick, 
    handlePostSubmit, 
    handleEditSubmit, 
    handleReplySubmit 
} from './ui.js';
import { startPostViewPoller, stopPostViewPoller } from './poller.js';
import { setEasyMDEInstance, getEasyMDEInstance } from './app.js';
// Não precisa importar poller.js aqui, pois render.js não o inicia.

// Variáveis DOM que a renderização pode precisar (ajuste conforme o seu código):
const appContainer = document.getElementById('app'); 

function clearBreadcrumb() {
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (breadcrumbContainer) {
        breadcrumbContainer.innerHTML = '';
    }
}

const POSTS_PER_PAGE = 20; // Defina a quantidade de posts por página.

// Estado para armazenar todos os posts de um usuário e a página atual.
let profileState = {
    author: null,
    allProfilePosts: [],
    currentPostPage: 1,
    // Para Comentários/Replies:
    allProfileComments: [], // 🚨 Novo array para comentários
    currentCommentPage: 1  // 🚨 Nova variável de estado para a página de comentários
};

// -------------------------------------------------------------------
// FUNÇÕES DE TEMPLATE (Se houver, é bom movê-las para utils.js ou templates.js)
// Por enquanto, assumimos que estão dentro das funções de renderização.
// -------------------------------------------------------------------

// -------------------------------------------------------------------
// 1. ROTA PRINCIPAL (Home)
// -------------------------------------------------------------------
export async function renderMainView() {
    document.title = CONFIG.forum_title;
    let html = `<h1>${CONFIG.forum_title}</h1>`;
    clearBreadcrumb();
    CONFIG.category_groups.forEach(group => {
        html += `<div class="card mb-4"><div class="card-header"><h4>${group.group_title}</h4></div><div class="list-group list-group-flush">`;
        group.categories.forEach(cat => {
            const postCount = cat.count || 0; // Use o valor de contagem atualizado dinamicamente, ou 0 se não estiver definido. Isso garante que mesmo que a contagem não tenha sido atualizada, o layout ainda funcione corretamente. Se você tiver uma função para atualizar essas contagens dinamicamente, certifique-se de chamá-la antes de renderizar a visualização principal para garantir que os números estejam corretos.
            
            html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                        <div class="category-info">
                            <h5>
                                <span class="badge bg-secondary rounded-pill me-2">${postCount}</span>
                                
                                <a href="?category=${cat.id}" data-route>${cat.title}</a>
                            </h5>
                            <p class="text-muted mb-0">${cat.description}</p>
                        </div>
                        
                        </li>`;
        });
        html += `</div></div>`;
    });
    appContainer.innerHTML = html;
}


// -------------------------------------------------------------------
// 2. VISUALIZAÇÃO DE TÓPICOS/CATEGORIA
// -------------------------------------------------------------------
export async function renderCategoryView(categoryId) {
    showLoader();
    const params = new URLSearchParams(window.location.search);
    const startAuthor = params.get('start_author');
    const startPermlink = params.get('start_permlink');

    const category = getAllCategories().find(c => c.id === categoryId);
    if (!category) { renderNotFound(); return; }


    document.title = `${category.title} - ${CONFIG.forum_title}`;
    renderBreadcrumb([
        { text: 'Home', href: '?' },
        { text: category ? category.title : 'Category', href: null } 
    ]);


    const user = auth.getCurrentUser();
    let headerHtml = `<div class="d-flex justify-content-between align-items-center mb-3"><div><h2>${category.title}</h2><p class="mb-0">${category.description}</p></div>${user ? `<a href="?new_topic_in=${categoryId}" class="btn btn-primary">New Topic</a>` : ''}</div>`;

    let topics = await blockchain.getTopics(categoryId, startAuthor, startPermlink);
    topics = topics.filter(topic => !blacklist.isBlacklisted(topic.author, topic.permlink));

    let topicsHtml = '<ul class="list-group">';
    if (topics.length > 0) {
        let topicData = await Promise.all(topics.map(async topic => {
            const cacheKey = `last-reply-cache-${topic.author}-${topic.permlink}`;
            try {
                const cachedData = JSON.parse(localStorage.getItem(cacheKey));
                if (cachedData && cachedData.childrenCount === topic.children) {
                    return { ...topic, lastPostAuthor: cachedData.lastPostAuthor, lastPostDate: cachedData.lastPostDate };
                }
            } catch (e) {}
            const lastReply = await blockchain.getLastReply(topic.author, topic.permlink);
            const newData = {
                childrenCount: topic.children,
                lastPostAuthor: lastReply ? lastReply.author : topic.author,
                lastPostDate: lastReply ? lastReply.created : topic.created
            };
            localStorage.setItem(cacheKey, JSON.stringify(newData));
            return { ...topic, ...newData };
        }));

        topicData.sort((a, b) => new Date(b.lastPostDate) - new Date(a.lastPostDate));

        topicData.forEach(topic => {
            const lastPostAvatarUrl = blockchain.getAvatarUrl(topic.lastPostAuthor);
            
            // 1. Bloco de Informação da Última Postagem (Last Post Block)
            const lastPostHtml = `
                <div class="d-flex align-items-center topic-last-post" style="min-width: 190px;">
                    <a href="?profile=${topic.lastPostAuthor}" class="me-2 avatar-link">
                        <img src="${lastPostAvatarUrl}" class="rounded-circle" width="36" height="36" alt="${topic.lastPostAuthor}">
                    </a>
                    <div class="text-start">
                        <small class="text-muted d-block">
                        <a href="?post=@${topic.author}/${topic.permlink}#@${topic.lastPostAuthor}/${topic.lastPostPermlink}" class="text-muted topic-last-post-link">
                            ${formatLocalTime(topic.lastPostDate)}
                        </a>
                        </small>
                        <a href="?profile=${topic.lastPostAuthor}" class="text-break fw-bold topic-last-post-author">@${topic.lastPostAuthor}</a>
                    </div>
                </div>`;
            
            // 2. Montagem do Tópico Completo
            topicsHtml += `
                <li class="list-group-item list-group-item-action topic-row">
                    <div class="d-flex w-100 align-items-center">
                        
                        <div class="flex-grow-1 topic-main-info me-3">
                            <h5 class="mb-1 fw-bold">
                                <a href="?post=@${topic.author}/${topic.permlink}" class="text-decoration-none">${topic.title}</a>
                            </h5>
                            <small class="text-muted">
                                By <a href="?profile=${topic.author}">@${topic.author}</a>, 
                                <time datetime="${topic.created}">${new Date(topic.created).toLocaleDateString()}</time>
                            </small>
                        </div>
                        
                        <div class="text-center mx-4 topic-stats d-none d-sm-block" style="min-width: 80px;">
                            <span class="d-block fs-5 fw-bold">${topic.children}</span>
                            <small class="text-muted">replies</small>
                        </div>
                        
                        ${lastPostHtml}
                        
                    </div>
                </li>`;
        });
    } else {
        topicsHtml += '<li class="list-group-item">No topics found.</li>';
    }
    topicsHtml += '</ul>';

    let paginationHtml = '';
    if (topics.length === CONFIG.topics_per_page) {
        const lastTopic = topics[topics.length - 1];
        paginationHtml = `<div class="d-flex justify-content-end mt-3"><a href="?category=${categoryId}&start_author=${lastTopic.author}&start_permlink=${lastTopic.permlink}" class="btn btn-outline-primary">Next Page &rarr;</a></div>`;
    }

    appContainer.innerHTML = headerHtml + topicsHtml + paginationHtml;
    hideLoader();
}

// -------------------------------------------------------------------
// 3. VISUALIZAÇÃO DE POSTS (Post com Réplicas)
// -------------------------------------------------------------------
export async function renderPostView(author, permlink) {
    showLoader();
    if (blacklist.isBlacklisted(author, permlink)) {
        renderError("This content is unavailable because the author or post is blacklisted.");
        return;
    }
    const post = await blockchain.getPostWithReplies(author, permlink);

// O campo 'category' do post pode ser a tag completa (ex: 'fdsfdsf-off-topic').
    const rawCategory = post.category || CONFIG.main_tag;
    
    // 🚨 CORREÇÃO AQUI: Limpa o ID da categoria, removendo o prefixo
    let categoryId = rawCategory.startsWith(CONFIG.tag_prefix)
        ? rawCategory.substring(CONFIG.tag_prefix.length) // Remove 'fdsfdsf-'
        : rawCategory;
        
    // Se o ID for a tag principal, ela pode não estar na lista de categorias (se for só o tag do fórum)
    if (categoryId === CONFIG.main_tag) {
        categoryId = 'general'; // OU o ID de categoria que você quer como default
    }


    const categories = getAllCategories();
    let category = categories.find(c => c.id === categoryId);
    
    // Fallback caso a categoria não seja encontrada ou seja a tag principal que não está na lista
    if (!category) {
        // Cria um objeto temporário para garantir que o breadcrumb funcione.
        category = { id: categoryId, title: categoryId.toUpperCase() }; 
    }
    
    // 🚨 ATENÇÃO: Chame o Breadcrumb com a variável 'category' corrigida
    renderBreadcrumb([
        { text: 'Home', href: '?' },
        { text: category.title, href: `?category=${category.id}` }, // Link para a categoria
        { text: createSnippet(post.title, 50), href: null } // Título truncado, sem link
    ]);

    if (!post || !post.author) { renderNotFound(); return; }

    document.title = `${post.title} - ${CONFIG.forum_title}`;
    const user = auth.getCurrentUser();
    const postAuthorAvatarUrl = blockchain.getAvatarUrl(post.author);

    const { allReplies, contentMap } = processPostTree(post); // Usa a função exportada

    let html = `
        <div class="card mb-3">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-3 text-center border-end">
                        <a href="?profile=${post.author}"><img src="${postAuthorAvatarUrl}" alt="${post.author}" class="rounded-circle mb-2" width="60" height="60"><h5 class="mb-0">@${post.author}</h5></a>
                        ${getRoleBadge(post.author)}
                        <small class="text-muted d-block mt-2">Posted: ${formatLocalTime(post.created)}</small>
                    </div>
                    <div class="col-md-9">
                        <h1 class="card-title">${post.title}</h1>
                        <div class="card-text fs-5 mb-3 main-post-text">${renderMarkdown(post.body)}</div>
                        <div class="d-flex align-items-center justify-content-between mt-3">
                            <div class="d-flex align-items-center vote-section" id="main-post-vote-container" data-author="${post.author}" data-permlink="${post.permlink}"></div>
                            <div>
                                ${user ? `<button class="btn btn-sm btn-outline-primary me-2 reply-to-btn" data-author="${post.author}" data-permlink="${post.permlink}">Reply</button>` : ''}
                                ${user === post.author ? `<a href="?edit=@${post.author}/${post.permlink}" class="btn btn-sm btn-outline-secondary me-2">Edit</a><button id="delete-post-btn" class="btn btn-sm btn-outline-danger">Delete</button>` : ''}
                            </div>
                        </div>
                        <div class="reply-form-container mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
        <h3>Replies</h3>`;

    if (allReplies.length > 0) {
        html += '<div class="list-group">';
        allReplies.forEach(reply => {
            const replyAvatarUrl = blockchain.getAvatarUrl(reply.author);
            let quoteHtml = '';
            const parentKey = `@${reply.parent_author}/${reply.parent_permlink}`;
            const parent = contentMap[parentKey];
            if (parent) {
                const parentBody = parent.body.substring(0, 100) + (parent.body.length > 100 ? '...' : '');
                quoteHtml = `<blockquote class="blockquote-footer bg-light p-2 rounded-top"><a href="#${parentKey}">@${reply.parent_author}</a> wrote:<p class="mb-0 fst-italic">${parentBody}</p></blockquote>`;
            }

            html += `
                <div id="${parentKey}" class="list-group-item mt-3">
                    <div class="row">
                        <div class="col-md-3 text-center border-end">
                            <a href="?profile=${reply.author}"><img src="${replyAvatarUrl}" alt="${reply.author}" class="rounded-circle mb-2" width="40" height="40"><h6 class="mb-0">@${reply.author}</h6></a>
                            ${getRoleBadge(reply.author)}
                            <small class="text-muted d-block mt-2">${formatLocalTime(reply.created)}</small>
                        </div>
                        <div class="col-md-9">
                            ${quoteHtml}
                            <div class="mb-2 card-text main-post-text">${renderMarkdown(reply.body)}</div>
                            <div class="d-flex align-items-center justify-content-between mt-2">
                                <div class="d-flex align-items-center vote-section" data-author="${reply.author}" data-permlink="${reply.permlink}"></div>
                                <div>
                                    ${user ? `<button class="btn btn-sm btn-link text-secondary reply-to-btn" data-author="${reply.author}" data-permlink="${reply.permlink}">Reply</button>` : ''}
                                    ${user === reply.author ? `<a href="?edit=@${reply.author}/${reply.permlink}" class="btn btn-sm btn-link text-secondary">Edit</a><button class="btn btn-sm btn-link text-danger delete-reply-btn" data-permlink="${reply.permlink}">Delete</button>` : ''}
                                </div>
                            </div>
                            <div class="reply-form-container mt-3"></div>
                        </div>
                    </div>
                </div>`;
        });
        html += '</div>';
    } else {
        html += '<p>No replies yet.</p>';
    }

    //console.log(html);

    appContainer.innerHTML = html;

    if (user) {
        const deletePostBtn = document.getElementById('delete-post-btn');
        if (deletePostBtn) deletePostBtn.addEventListener('click', (e) => handleDeleteClick(e, post.author, post.permlink));
        document.querySelectorAll('.delete-reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleDeleteClick(e, user, e.target.dataset.permlink));
        });
        appContainer.addEventListener('click', function(e) {
            const voteBtn = e.target.closest('.vote-btn');
            if (voteBtn) {
                // ✅ Correto: Chama a função passando o objeto de evento 'e'
                handleVoteClick(e);
            }
            const replyBtn = e.target.closest('.reply-to-btn');
            if (replyBtn) {
                const { author, permlink } = replyBtn.dataset;
                const formContainer = replyBtn.closest('.col-md-9').querySelector('.reply-form-container');
                renderReplyForm(author, permlink, formContainer);
            }
        });
    }

    //startPostViewPoller(author, permlink,post);
    hideLoader();
    return post;
}
// -------------------------------------------------------------------
// 4. VISUALIZAÇÃO DE PERFIL
// -------------------------------------------------------------------
/**
 * [MUDANÇAS CHAVE PARA CARREGAMENTO RÁPIDO DO PERFIL]
 * * 1. PADRÃO SHELL RENDERING: A função agora é dividida em duas fases para evitar a tela branca:
 * - FASE 1 (RÁPIDA): Apenas espera por `blockchain.getAccount(username)` e renderiza
 * IMEDIATAMENTE a estrutura básica do perfil (header, abas) no appContainer.
 * - FASE 2 (LENTA/ASSÍNCRONA): A nova função `loadProfileContent(username)` é chamada 
 * SEM 'await', permitindo que a busca pesada (`getAllPosts`, `getAllComments`) 
 * ocorra em segundo plano. Ela injeta o Loader e, depois, os posts/comentários.
 * * 2. REINICIALIZAÇÃO DE ESTADO (CORREÇÃO DE BUG):
 * - Se o 'username' for diferente do `profileState.author` anterior, o `profileState`
 * (posts e comentários) é zerado ANTES de renderizar o HTML. Isso garante que:
 * a) O novo perfil não mostre dados do usuário antigo.
 * b) O Shell renderize corretamente os Loaders internos (já que os arrays estão vazios).
 * * 3. REMOÇÃO DOS 'AWAITS' LENTOS: As chamadas `await blockchain.getAll...` foram movidas
 * para dentro de `loadProfileContent` para não bloquear a renderização inicial.
 */
export async function renderProfileView(username) {
    // 1. Limpeza e Loader Principal
    clearBreadcrumb();
    stopPostViewPoller();
    showLoader(); // Loader principal aparece rapidamente

    // 2. BUSCA RÁPIDA (SOMENTE DADOS DA CONTA)
    let account = null;

    if (profileState.author !== username) {
        profileState.allProfilePosts = [];
        profileState.allProfileComments = [];
        profileState.currentPostPage = 1;
        profileState.currentCommentPage = 1;
    }
    
    try {
        // ESSA É A ÚNICA CHAMADA 'await' que BLOQUEIA, pois é necessária para o cabeçalho.
        account = await blockchain.getAccount(username); 
    } catch (error) {
        hideLoader();
        return renderError(`Could not load profile for @${username}. Error: ${error.message || 'Check RPC node or API call parameters.'}`);
    }

    if (!account) {
        hideLoader();
        return renderNotFound();
    }
    
    // 3. Atualiza o estado básico
    profileState.author = username;

    // 4. Prepara dados para o SHELL
    const avatarUrl = blockchain.getAvatarUrl(username);
    const jsonMetadata = JSON.parse(account.json_metadata || '{}');
    const profile = jsonMetadata.profile || {};
    const memberSince = new Date(account.created).toLocaleDateString();
    const voting_power = account.voting_power/100;
    const post_count = account.post_count;
    const blurt_power = Math.floor(parseFloat(account.vesting_shares.split(' ')[0]) * 1.13);
    const last_vote_time = formatLocalTime(account.last_vote_time);
    
    // 5. Breadcrumb
    renderBreadcrumb([
        { text: 'Home', href: '?' },
        { text: `Profile: @${username}`, href: null }
    ]);

    // 6. Montar e Injetar o HTML do Perfil (O SHELL)
    // O html não precisa mais dos dados de posts/comentários, apenas do tamanho do array no estado.
    let html = `
        <div class="row">
            <div class="col-md-3">
                <div class="card mb-3">
                    <div class="card-body text-center">
                        <img src="${avatarUrl}" alt="@${username}'s Avatar" class="rounded-circle mb-3" style="width: 100px; height: 100px; object-fit: cover;">
                        <h4>@${username}</h4>
                        <p class="text-muted">${profile.about || ''}</p>
                        <p class="text-muted">Last Activity ${last_vote_time}</p>
                        <hr>
                        <ul class="list-unstyled text-start small">
                            <li><strong>BLURT Balance:</strong> ${account.balance}</li>
                            <li><strong>Blurt Power:</strong> ${blurt_power} BP</li>
                            <li><strong>Posts:</strong> ${post_count}</li> 
                            <li><strong>Voting Power:</strong> ${voting_power}</li> 
                            <li><strong>Member since:</strong> ${memberSince}</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <div class="col-md-9">
                <div class="card">
                    <div class="card-header">
                        <ul class="nav nav-tabs card-header-tabs" id="profileTabs" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active" id="posts-tab" data-bs-toggle="tab" data-bs-target="#posts-content" type="button" role="tab" aria-controls="posts-content" aria-selected="true">Latest Posts</button>
                            </li>
                            <li class="nav-item" role="presentation">
                                <button class="nav-link" id="replies-tab" data-bs-toggle="tab" data-bs-target="#replies-content" type="button" role="tab" aria-controls="replies-content" aria-selected="false">Latest Activity</button>
                            </li>
                        </ul>
                    </div>
                    
                    <div class="card-body">
                        <div class="tab-content" id="profileTabsContent">
                            <div class="tab-pane fade show active" id="posts-content" role="tabpanel" aria-labelledby="posts-tab">
                                <div id="profile-posts-content-list">  
                                    </div>
                                <div id="profile-pagination-controls" class="d-flex justify-content-center">
                                </div>
                            </div>
                            <div class="tab-pane fade" id="replies-content" role="tabpanel" aria-labelledby="replies-tab">
                                <div id="profile-comments-content-list">
                                    </div>
                                <div id="replies-pagination-controls" class="d-flex justify-content-center">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.title = `@${username}'s Profile - ${CONFIG.forum_title}`;
    appContainer.innerHTML = html;
    
    // 7. ESCONDE O LOADER PRINCIPAL. A PÁGINA AGORA ESTÁ VISÍVEL!
    hideLoader();

    // 8. CHAMA O CARREGAMENTO LENTO (NÃO USAMOS 'await' aqui!)
    loadProfileContent(username);

    // 9. Configura Listeners (Continua como estava, mas sem a dependência imediata dos dados)
    const paginationContainer = document.getElementById('profile-pagination-controls');
    if (paginationContainer) {
        paginationContainer.addEventListener('click', handlePaginationClick); 
    }
    const commentPaginationContainer = document.getElementById('replies-pagination-controls');
    if (commentPaginationContainer) {
        commentPaginationContainer.addEventListener('click', handleCommentPaginationClick); 
    }
    
    const tabEl = document.getElementById('profileTabs');
    if (tabEl && window.bootstrap && window.bootstrap.Tab) {
        new bootstrap.Tab(document.getElementById('posts-tab')).show();
    }
}

/**
 * Função auxiliar que renderiza a lista de tópicos (posts) para uma dada coleção.
 * @param {Array<Object>} topics - Array de objetos post.
 * @returns {string} HTML da lista de tópicos.
 */
function renderTopicsList(topics) {
    if (!topics || topics.length === 0) {
        return '<p class="text-muted">Nenhum tópico encontrado.</p>';
    }

    let html = `
        <ul class="list-group list-group-flush">
    `;

    topics.forEach(topic => {
        // Ignora replies; mostra apenas tópicos principais (parent_author é vazio ou igual ao autor)
        if (topic.parent_author && topic.parent_author !== topic.author) {
             return; 
        }
        
        const repliesCount = topic.children; // Número de comentários
        const lastUpdate = formatLocalTime(topic.last_update);
        const authorLink = `?profile=@${topic.author}`;


        html += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <a href="?post=@${topic.author}/${topic.permlink}" class="fw-bold">${createSnippet(topic.title, 60)}</a>
                    <div class="text-muted small">
                        by <a href="${authorLink}">@${topic.author}</a> 
                        • ${lastUpdate}
                    </div>
                </div>
                <span class="badge bg-primary rounded-pill">${repliesCount} Replies</span>
            </li>
        `;
    });

    html += `
        </ul>
    `;
    return html;
}

// -------------------------------------------------------------------
// 5. VISUALIZAÇÃO DE EDIÇÃO E NOVO TÓPICO
// -------------------------------------------------------------------
// Local: js/modules/render(2).js (ou render.js)

export async function renderNewTopicForm(categoryId) {
    // 1. LIMPEZA E INFORMAÇÕES BÁSICAS (Sem alterações aqui)
    const currentMDE = getEasyMDEInstance();
    if (currentMDE) {
        try { currentMDE.toTextArea(); } catch(e) {}
        setEasyMDEInstance(null);
    }

    const category = getAllCategories().find(c => c.id === categoryId);
    if (!category) { renderNotFound(); return; }
    if (!auth.getCurrentUser()) { renderError("You must be logged in to create a new topic."); return; }

    document.title = `New Topic in ${category.title} - ${CONFIG.forum_title}`;
    
    // ✅ draftKey é definido aqui e é acessível dentro das funções aninhadas
    const draftKey = `draft-new-${categoryId}`; 
    // 🚨 CORREÇÃO: fullDraftKey deve ser definida ANTES de ser usada no bloco de rascunho.
    const fullDraftKey = `full-draft-${draftKey}`; // ⬅️ DEFINIÇÃO AQUI

    appContainer.innerHTML = `
        <h2>New Topic in ${category.title}</h2>
        <form id="new-topic-form">
            <div class="mb-3"><label for="topic-title" class="form-label">Title</label><input type="text" class="form-control" id="topic-title"></div>
            <div class="mb-3"><label for="topic-body" class="form-label">Content</label><textarea class="form-control" id="topic-body" rows="10"></textarea></div>
            <div id="post-error" class="alert alert-danger d-none"></div>
            <button type="submit" class="btn btn-primary">Submit Topic</button>
            <a href="?category=${categoryId}" class="btn btn-secondary">Cancel</a>
        </form>`;

    const titleEl = document.getElementById('topic-title');
    const bodyEl = document.getElementById('topic-body');

    // 2. INICIALIZAÇÃO DO EASYMDE
    const newInstance = new EasyMDE({
        element: bodyEl,
        spellChecker: false,
        placeholder: "Enter your content here...",
        autosave: { enabled: true, uniqueId: draftKey, delay: 1000 },
    });
    setEasyMDEInstance(newInstance); // Atribui a nova instância globalmente

    
    // 3. RECUPERAÇÃO DE RASCUNHO
    // O erro estava aqui. A linha 314 (aproximadamente) era 'const fullDraftKey = `full-draft-${draftKey}`;'
    // Mas essa linha foi movida para cima para a definição.

    const savedDraft = localStorage.getItem(fullDraftKey); // ✅ fullDraftKey é acessível
    if (savedDraft) {
        try {
            const draft = JSON.parse(savedDraft);
            titleEl.value = draft.title || '';
            newInstance.value(draft.body || '');
        } catch (e) { 
            newInstance.value(localStorage.getItem(draftKey) || '');
        }
    }

    // 4. SALVAMENTO DE RASCUNHO
    const saveFullDraft = () => {
        // ✅ draftKey é acessível (closure)
        // ✅ fullDraftKey é acessível (closure)
        // ✅ newInstance é acessível (closure)
        const draft = { title: titleEl.value, body: newInstance.value() }; 
        localStorage.setItem(fullDraftKey, JSON.stringify(draft)); 
    };
    titleEl.addEventListener('input', saveFullDraft);
    newInstance.codemirror.on('change', saveFullDraft);

    document.getElementById('new-topic-form').addEventListener('submit', (e) => handlePostSubmit(e, fullDraftKey));
}

// Local: js/modules/render(2).js (ou render.js)

export async function renderEditView(author, permlink) {
    // 1. PREPARAÇÃO E LIMPEZA
    const currentMDE = getEasyMDEInstance(); // ⬅️ Usa o getter para pegar a instância atual

    if (currentMDE) { // ✅ Usa a instância atual
        try { currentMDE.toTextArea(); } catch(e) {}
        setEasyMDEInstance(null); // ⬅️ CORREÇÃO: Limpa a referência usando o setter
    }
    
    appContainer.innerHTML = '<div class="text-center mt-5"><div class="spinner-border"></div></div>';

    const post = await blockchain.getPostWithReplies(author, permlink);

    if (!post || post.author !== auth.getCurrentUser()) {
        renderError("You do not have permission to edit this.");
        return;
    }

    document.title = `Editing: ${post.title || 'Reply'}`;
    const draftKey = `draft-edit-${post.author}-${post.permlink}`;

    let finalAuthor = author;
    let finalPermlink = permlink;
    // Se o post for um reply (o título está vazio) E tiver uma URL
    if (!post.title && post.url) {
        const rootLink = extractRootLinkFromUrl(post.url);
        
        if (rootLink) {
            finalAuthor = rootLink.author;
            finalPermlink = rootLink.permlink;
        }
    }

    const cancelUrl = `?post=@${finalAuthor}/${finalPermlink}`;

    // ... (restante da lógica de renderização do HTML) ...
    appContainer.innerHTML = `
        <h2>Editing ${post.title ? 'Topic' : 'Reply'}</h2>
        <form id="edit-form">
            ${post.title ? `<div class="mb-3"><label for="edit-title" class="form-label">Title</label><input type="text" class="form-control" id="edit-title"></div>` : ''}
            <div class="mb-3"><label for="edit-body" class="form-label">Content</label><textarea id="edit-body" rows="10"></textarea></div>
            <div id="edit-error" class="alert alert-danger d-none"></div>
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <a href="${cancelUrl}" class="btn btn-secondary">Cancel</a> 
        </form>`; // ⬅️ USA A VARIÁVEL CORRIGIDA
    
    const titleEl = document.getElementById('edit-title');
    const bodyEl = document.getElementById('edit-body');

    // 2. INICIALIZAÇÃO E ATRIBUIÇÃO
    const newInstance = new EasyMDE({ // ⬅️ Cria uma variável local para a nova instância
        element: bodyEl,
        spellChecker: false,
        autosave: { enabled: true, uniqueId: draftKey, delay: 1000 }
    });
    
    setEasyMDEInstance(newInstance); // ⬅️ CORREÇÃO: Atribui a nova instância globalmente usando o setter

    // 3. RECUPERAÇÃO DE RASCUNHO E CARREGAMENTO
    const savedDraft = localStorage.getItem(draftKey);
    newInstance.value(savedDraft || post.body); // ✅ Usa a nova instância local (newInstance)

    if (titleEl) {
        const savedTitleKey = `${draftKey}-title`;
        const savedTitle = localStorage.getItem(savedTitleKey);
        titleEl.value = savedTitle || post.title;
        titleEl.addEventListener('input', () => localStorage.setItem(savedTitleKey, titleEl.value));
    }

    document.getElementById('edit-form').addEventListener('submit', (e) => handleEditSubmit(e, post, draftKey));
}
export async function renderReplyForm(parentAuthor, parentPermlink, container) {
    // 1. Limpeza da instância anterior (usando getter e setter)
    const currentMDE = getEasyMDEInstance(); // ⬅️ Usa o getter
    
    if (currentMDE) {
        try { currentMDE.toTextArea(); } catch(e) {}
        setEasyMDEInstance(null); // ⬅️ CORREÇÃO: Usa o setter
    }
    
    const existingForm = document.getElementById('reply-form');
    if (existingForm) existingForm.parentElement.innerHTML = '';

    const formHtml = `
        <form id="reply-form" class="mt-3 mb-3 card card-body">
            <h4>Reply to @${parentAuthor}</h4>
            <div class="mb-3"><textarea class="form-control" id="reply-body" rows="5"></textarea></div>
            <div id="reply-error" class="alert alert-danger d-none"></div>
            <button type="submit" class="btn btn-primary">Submit Reply</button>
            <button type="button" class="btn btn-secondary mt-2" id="cancel-reply">Cancel</button>
        </form>`;
    
    if (container) {
        container.innerHTML = formHtml;
        
        // 2. Inicialização da nova instância (variável local)
        const newInstance = new EasyMDE({ // ⬅️ Variável local
            element: document.getElementById('reply-body'),
            spellChecker: false,
            placeholder: "Enter your reply...",
        });

        setEasyMDEInstance(newInstance); // ⬅️ CORREÇÃO: Atribui a nova instância globalmente
        
        // 3. Configurações e Event Listeners
        document.getElementById('reply-form').addEventListener('submit', (e) => {
             // handleReplySubmit não precisa de easyMDEInstance no argumento
             handleReplySubmit(e, parentAuthor, parentPermlink) 
        });

        document.getElementById('cancel-reply').addEventListener('click', () => {
            // Lógica de cancelamento (usa a nova instância local para limpar)
            if (newInstance) {
                try { newInstance.toTextArea(); } catch(e) {}
                setEasyMDEInstance(null); // ⬅️ CORREÇÃO: Limpa o global
            }
            container.innerHTML = '';
        });
        
        // Foca o novo editor (usa a nova instância local)
        newInstance.codemirror.focus();
    } else {
        console.error(`Could not find container for reply form to ${parentPermlink}`);
    }
}

/**
 * Cria e injeta o HTML do Breadcrumb no appContainer.
 * @param {Array<Object>} items - Array de objetos { text: string, href: string|null }.
 */
function renderBreadcrumb(items) {
    // 1. Encontra ou cria o container do breadcrumb
    let breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (!breadcrumbContainer) {
        // Se não existir (primeira vez), cria um elemento para segurar o breadcrumb
        breadcrumbContainer = document.createElement('div');
        breadcrumbContainer.id = 'breadcrumb-container';
        breadcrumbContainer.className = 'container my-3';
        
        // 🚨 IMPORTANTE: Injeta o container APÓS o menu e ANTES do appContainer (se a estrutura permitir)
        // Se o appContainer for o elemento principal, talvez seja melhor injetar o Breadcrumb
        // em um elemento pai ou antes de 'appContainer.innerHTML = ...'
        // Assumindo que o appContainer é o contêiner do conteúdo principal:
        const mainContentArea = document.getElementById('main-content-area') || appContainer.parentElement; 
        mainContentArea.insertBefore(breadcrumbContainer, appContainer);
    }
    
    // 2. Constrói o HTML do Breadcrumb do Bootstrap
    let html = '<nav aria-label="breadcrumb"><ol class="breadcrumb">';

    items.forEach((item, index) => {
        const isLast = index === items.length - 1;
        const activeClass = isLast ? 'active' : '';
        const link = item.href ? `<a href="${item.href}">${item.text}</a>` : item.text;

        html += `
            <li class="breadcrumb-item ${activeClass}" ${isLast ? 'aria-current="page"' : ''}>
                ${link}
            </li>
        `;
    });

    html += '</ol></nav>';
    
    // 3. Injeta o HTML
    breadcrumbContainer.innerHTML = html;
}

export async function renderError(message) {
    appContainer.innerHTML = `<div class="alert alert-danger">${message}</div><a href="/">Back to Home</a>`;
    hideLoader();
}

export async function renderNotFound() {
    appContainer.innerHTML = `
        <div class="alert alert-danger"><strong>404 Not Found</strong><p>The page you requested could not be found.</p></div>
        <a href="/">Back to Home</a>`;
    document.title = `Not Found - ${CONFIG.forum_title}`;
    hideLoader();
}


// js/modules/render.js (Novas funções auxiliares)

/**
 * Gera o HTML dos controles de paginação numérica.
 */
function renderPaginationControls(totalPosts, currentPostPage) {
    if (totalPosts === 0) return '';

    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
    if (totalPages <= 1) return '';

    let html = `
        <nav aria-label="Navegação de posts" class="mt-4">
            <ul class="pagination justify-content-center">
    `;

    // ... (Lógica para startPage e endPage) ...
    let startPage = Math.max(1, currentPostPage - 2);
    let endPage = Math.min(totalPages, currentPostPage + 2);

    if (currentPostPage <= 3) {
        endPage = Math.min(totalPages, 5);
        startPage = 1;
    }
    if (currentPostPage > totalPages - 2) {
        startPage = Math.max(1, totalPages - 4);
        endPage = totalPages;
    }


    // Botão Anterior
    html += `
        <li class="page-item ${currentPostPage === 1 ? 'disabled' : ''}">
            <a class="page-link page-nav-link" href="javascript:;" data-page="${currentPostPage - 1}">Anterior</a>
        </li>
    `;

    // Botões Numéricos
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPostPage ? 'active' : ''}">
                <a class="page-link page-nav-link" href="javascript:;" data-page="${i}">${i}</a>
            </li>
        `;
    }

    // Botão Próximo
    html += `
        <li class="page-item ${currentPostPage === totalPages ? 'disabled' : ''}">
            <a class="page-link page-nav-link" href="javascript:;" data-page="${currentPostPage + 1}">Próximo</a>
        </li>
    `;

    html += `
            </ul>
        </nav>
    `;
    return html;
}

/**
 * Lida com o clique nos botões de paginação (1, 2, 3, Anterior, Próximo).
 */
function handlePaginationClick(e) {
    // 🚨 Esta linha é CRÍTICA. Você deve prevenir a ação padrão (ir para #) IMEDIATAMENTE.
    e.preventDefault(); 
    
    const link = e.target.closest('.page-nav-link');
    
    // Se o clique não foi em um link de paginação (por exemplo, no '...' desabilitado), saia.
    if (!link || link.parentElement.classList.contains('disabled')) {
        return; 
    }
    
    const newPage = parseInt(link.dataset.page);
    const totalPages = Math.ceil(profileState.allProfilePosts.length / POSTS_PER_PAGE);

    if (newPage >= 1 && newPage <= totalPages) {
        profileState.currentPostPage = newPage;
        renderProfilePosts(); // Redesenha a página com o novo conteúdo
    }
    // Não precisa de history.pushState aqui, pois você não está mudando a URL
}

/**
 * Renderiza os posts para a página atual e atualiza os controles de paginação.
 */
function renderProfilePosts() {
    const { allProfilePosts, currentPostPage } = profileState;
    const postsContainer = document.getElementById('profile-posts-content-list');
    const paginationContainer = document.getElementById('profile-pagination-controls');

    if (!postsContainer) return;

    if (allProfilePosts.length === 0) {
        postsContainer.innerHTML = '<p class="text-muted text-center">Nenhum post encontrado.</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    // 1. Calcular o fatiamento (slice) para a página atual
    const startIndex = (currentPostPage - 1) * POSTS_PER_PAGE;
    const endIndex = startIndex + POSTS_PER_PAGE;
    const postsToDisplay = allProfilePosts.slice(startIndex, endIndex);

    // 2. Renderizar os posts
    // 🚨 ATENÇÃO: Verifique se 'renderTopicsList' existe e está sendo importado/definido
    postsContainer.innerHTML = renderTopicsList(postsToDisplay); 

    // 3. Renderizar e anexar os controles de paginação
    if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(
            allProfilePosts.length,
            currentPostPage
        );
    }
    
    // Rola para o topo do feed (boa UX)
    postsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// js/modules/render.js (Nova Função)

/**
 * Renderiza os comentários (Replies) para a página atual e atualiza os controles de paginação.
 */
function renderProfileComments() {
    // Usamos as variáveis específicas para comentários
    const { allProfileComments, currentCommentPage } = profileState;
    const commentsContainer = document.getElementById('profile-comments-content-list');
    const paginationContainer = document.getElementById('replies-pagination-controls');

    if (!commentsContainer) return;

    if (allProfileComments.length === 0) {
        commentsContainer.innerHTML = '<p class="text-muted text-center">Nenhum comentário encontrado.</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    // 1. Calcular o fatiamento (slice) para a página atual
    const totalLength = allProfileComments.length;
    const startIndex = (currentCommentPage - 1) * POSTS_PER_PAGE;
    const endIndex = Math.min(totalLength, startIndex + POSTS_PER_PAGE);
    const commentsToDisplay = allProfileComments.slice(startIndex, endIndex);

console.log('Total de Comentários:', allProfileComments.length);
console.log('Página Atual:', currentCommentPage);
console.log('Índices de Slicing:', startIndex, endIndex);
console.log('Comentários Exibidos:', commentsToDisplay.length);



    // 2. Renderizar os comentários
    // 🚨 ATENÇÃO: Você precisará de uma função de template para comentários, 
    // como `renderCommentList` ou `renderTopicsList` ajustada. 
    // Assumiremos uma função genérica renderCommentList.
    
    // Você pode usar o renderTopicsList por enquanto se ele aceitar o formato de post/comment
    // Se o seu renderTopicsList é o único que existe, vamos usá-lo:
    commentsContainer.innerHTML = renderCommentList(commentsToDisplay); 
    
    // 3. Renderizar e anexar os controles de paginação
    if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(
            allProfileComments.length,
            currentCommentPage
        );
    }
    
    // Rola para o topo do feed (boa UX)
    commentsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/**
 * Lida com o clique nos botões de paginação DA ABA DE COMENTÁRIOS.
 */
function handleCommentPaginationClick(e) {
    e.preventDefault();
    const link = e.target.closest('.page-nav-link');
    
    if (!link || link.parentElement.classList.contains('disabled')) {
        return; 
    }
    
    const newPage = parseInt(link.dataset.page);
    const totalPages = Math.ceil(profileState.allProfileComments.length / POSTS_PER_PAGE);

    if (newPage >= 1 && newPage <= totalPages) {
        profileState.currentCommentPage = newPage;
        renderProfileComments(); // Redesenha a página com o novo conteúdo
    }
}

function renderCommentList(comments) {
    if (!comments || comments.length === 0) return '';
    
    const isDOMPurifyAvailable = typeof window.DOMPurify !== 'undefined';

    return comments.map(comment => {
        // 1. EXTRAÇÃO DO LINK E INFORMAÇÕES DO POST RAIZ
        const rootInfo = extractRootLinkFromUrl(comment.url); 
        const rootPostLink = rootInfo ? `?post=@${rootInfo.author}/${rootInfo.permlink}` : '#';
        const rootTitle = comment.root_title || 'Post Original'; 
        
        // 2. CRIAÇÃO E SANITIZAÇÃO DO CONTEÚDO
        const textSnippet = createSnippet(comment.body, 150);
        const safeSnippet = isDOMPurifyAvailable 
            ? window.DOMPurify.sanitize(textSnippet) 
            : textSnippet;

        // 🚨 3. MELHORIA NA FORMATAÇÃO DA DATA
        // Inclui dia, mês, ano e hora/minuto.
        const createdDate = formatLocalTime(comment.created);
        
        // Link para o comentário específico (para rolar até ele no post)
        const commentLink = `${rootPostLink}#@${comment.author}/${comment.permlink}`;

        // 🚨 1. LÓGICA PARA EXTRAIR O NOME DO APP DO JSON_METADATA
        let appName = 'App Desconhecido';
        try {
            const metadata = JSON.parse(comment.json_metadata);
            if (metadata && metadata.app) {
                // Pega a primeira parte, ex: "blurtblog/1.0" -> "blurtblog"
                appName = metadata.app.split('/')[0];
            }
        } catch (e) {
            // Ignora se o JSON for inválido
        }

        return `
            <div class="card mb-3 comment-summary">
                <div class="card-body">
                    
                    <h5 class="card-title mb-2 fw-bold text-dark comment-meta-info">
                        
                        <a href="?profile=${comment.author}" class="meta-link">@${comment.author}</a> 
                        replied to 
                        
                        <a href="?profile=${comment.parent_author}" class="meta-link">@${comment.parent_author}</a> 
                        on the topic 
                        
                        [<a href="${rootPostLink}" class="meta-link">${rootTitle}</a>] 
                        at ${createdDate}

                        <span class="text-muted me-3" title="Postado via ${appName}">
                        via ${appName}
                        </span>
                    </h5>
                    
                    <div class="card-text mb-3">
                        <p>${safeSnippet}</p>
                    </div>

                    <div class="d-flex justify-content-between align-items-center">
                        
                        <div class="d-flex align-items-center">
                            
                            <span class="text-success small fw-bold me-3" title="Recompensa Pendente">
                                <i class="bi bi-cash-stack"></i> ${comment.pending_payout_value}
                            </span>
                            
                            <button class="btn btn-sm btn-outline-primary me-2 vote-btn" data-author="${comment.author}" data-permlink="${comment.permlink}" data-weight="100">
                                <i class="bi bi-hand-thumbs-up"></i> Vote 
                            </button>
                            
                            <a href="${commentLink}" class="btn btn-sm btn-outline-secondary">
                                View Reply <i class="bi bi-box-arrow-up-right"></i>
                            </a>
                        </div>
                        
                        <span class="badge bg-light text-dark">
                            ${comment.children || 0} Replies
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


// render.js

// ...

/**
 * Cria a estrutura HTML básica (Shell) do perfil com placeholders de conteúdo.
 * @param {object} profileData - Os dados da conta (obtidos rapidamente).
 */
function createProfileShellHtml(profileData) {
    const jsonMetadata = JSON.parse(profileData.json_metadata || '{}');
    const profile = jsonMetadata.profile || {};
    const about = profile.about || 'Nenhuma descrição disponível.';
    const avatarUrl = blockchain.getAvatarUrl(profileData.name); // Assumindo que você tem getAvatarUrl
    
    // Use IDs específicos que a função de carregamento irá preencher
    return `
        <div class="profile-header mb-4 card">
            <div class="card-body d-flex align-items-center">
                <img src="${avatarUrl}" alt="Avatar de ${profileData.name}" class="rounded-circle me-3" style="width: 80px; height: 80px;">
                <div>
                    <h2>@${profileData.name}</h2>
                    <p class="text-muted">${about}</p>
                </div>
            </div>
        </div>

        <ul class="nav nav-tabs" id="profileTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="posts-tab" data-bs-toggle="tab" data-bs-target="#posts-tab-pane" type="button" role="tab" aria-controls="posts-tab-pane" aria-selected="true">Posts</button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="comments-tab" data-bs-toggle="tab" data-bs-target="#comments-tab-pane" type="button" role="tab" aria-controls="comments-tab-pane" aria-selected="false">Comentários</button>
            </li>
        </ul>

        <div class="tab-content pt-3" id="profileTabsContent">
            
            <div class="tab-pane fade show active" id="posts-tab-pane" role="tabpanel" aria-labelledby="posts-tab">
                <div id="profile-posts-content-list">
                    </div>
                <div id="profile-pagination-controls" class="mt-3"></div>
            </div>
            
            <div class="tab-pane fade" id="comments-tab-pane" role="tabpanel" aria-labelledby="comments-tab">
                <div id="profile-comments-content-list">
                    </div>
                <div id="profile-comments-pagination-controls" class="mt-3"></div>
            </div>
        </div>
    `;
}

// render.js

// render.js

// ... (Mantenha as importações e variáveis de estado como profileState)

/**
 * Carrega posts e comentários de forma assíncrona (em segundo plano) e injeta no DOM.
 * @param {string} username - O nome do usuário.
 */
async function loadProfileContent(username) {
    const postsContainer = document.getElementById('profile-posts-content-list');
    const commentsContainer = document.getElementById('profile-comments-content-list');
    const loaderHtml = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Carregando conteúdo...</p></div>';

    // 1. Injeta os loaders imediatamente
    if (postsContainer) postsContainer.innerHTML = loaderHtml;
    if (commentsContainer) commentsContainer.innerHTML = loaderHtml.replace('conteúdo', 'comentários');

    try {
        // 2. Chama as funções LENTAS em paralelo
        // Só chama a API se o estado estiver vazio (evita chamadas redundantes)
        const loadPostsPromise = (profileState.allProfilePosts.length > 0 && profileState.author === username) 
            ? Promise.resolve(profileState.allProfilePosts)
            : blockchain.getAllPostsByAuthor(username);
            
        const loadCommentsPromise = (profileState.allProfileComments.length > 0 && profileState.author === username)
            ? Promise.resolve(profileState.allProfileComments)
            : blockchain.getAllCommentsByAuthor(username);

        const [initialPosts, initialComments] = await Promise.all([
            loadPostsPromise,
            loadCommentsPromise
        ]);
        
        // 3. ATUALIZA O ESTADO (Somente se não estava carregado)
        if (profileState.author !== username || profileState.allProfilePosts.length === 0) {
            profileState.allProfilePosts = initialPosts.sort((a, b) => new Date(b.created) - new Date(a.created)); 
            profileState.currentPostPage = 1;
        }

        if (profileState.author !== username || profileState.allProfileComments.length === 0) {
            profileState.allProfileComments = initialComments.sort((a, b) => new Date(b.created) - new Date(a.created)); 
            profileState.currentCommentPage = 1;
        }
        
        // 4. Renderiza e injeta o conteúdo final
        renderProfilePosts(); 
        renderProfileComments();
        
    } catch (error) {
        console.error("Erro ao carregar conteúdo do perfil:", error);
        if (postsContainer) postsContainer.innerHTML = '<p class="alert alert-danger">Erro ao carregar posts.</p>';
        if (commentsContainer) commentsContainer.innerHTML = '<p class="alert alert-danger">Erro ao carregar comentários.</p>';
    }
}