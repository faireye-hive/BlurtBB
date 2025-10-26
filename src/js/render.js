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
        extractRootLinkFromUrl } from './utils.js'; 
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

let profilePaginationState = {
    author: null,
    lastAuthor: null,
    lastPermlink: null,
    isLoading: false,
    hasMore: true,
    limit: 20,
    postsContainerId: 'profile-posts-content-list'
};

function clearBreadcrumb() {
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (breadcrumbContainer) {
        breadcrumbContainer.innerHTML = '';
    }
}

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

/**
 * Carrega posts adicionais para o perfil e anexa ao DOM.
 * @param {boolean} isInitialLoad - Se for o primeiro carregamento, limpa o container.
 */
async function loadMoreProfilePosts(isInitialLoad = false) {
    if (profilePaginationState.isLoading || (!profilePaginationState.hasMore && !isInitialLoad)) {
        return; // Não faz nada se já estiver carregando ou se não houver mais posts
    }
    
    profilePaginationState.isLoading = true;
    
    const loadMoreBtn = document.getElementById('load-more-profile-posts');
    const postsContainer = document.getElementById(profilePaginationState.postsContainerId);
    
    if (loadMoreBtn) loadMoreBtn.disabled = true;

    try {
        // 1. Chamar a API com os parâmetros de paginação
        const newPosts = await blockchain.getPostsByAuthor(
            profilePaginationState.author, 
            profilePaginationState.limit,
            profilePaginationState.lastAuthor, 
            profilePaginationState.lastPermlink
        );

        // 2. Anexar os posts
        const newHtml = renderTopicsList(newPosts);
        
        if (isInitialLoad) {
            // Se for o carregamento inicial, substitui o conteúdo
            postsContainer.innerHTML = newHtml; 
        } else {
            // Se for 'load more', apenas adiciona
            postsContainer.insertAdjacentHTML('beforeend', newHtml);
        }

        // 3. Atualizar o estado da paginação
        if (newPosts.length < profilePaginationState.limit) {
            profilePaginationState.hasMore = false;
        }
        
        if (newPosts.length > 0) {
            const lastPost = newPosts[newPosts.length - 1];
            profilePaginationState.lastAuthor = lastPost.author;
            profilePaginationState.lastPermlink = lastPost.permlink;
        }

    } catch (error) {
        console.error("Failed to load more profile posts:", error);
        // Deixe a mensagem de erro no topo, não no botão
    } finally {
        profilePaginationState.isLoading = false;
        
        // 4. Lógica do botão "Load More"
        if (loadMoreBtn) {
            if (profilePaginationState.hasMore) {
                loadMoreBtn.disabled = false;
                loadMoreBtn.textContent = 'Load More Topics';
            } else {
                loadMoreBtn.textContent = 'End of Feed';
                loadMoreBtn.disabled = true;
            }
        }
    }
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
                                ${new Date(topic.lastPostDate).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                        <small class="text-muted d-block mt-2">Posted: ${new Date(post.created).toLocaleString()}</small>
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
                            <small class="text-muted d-block mt-2">${new Date(reply.created).toLocaleString()}</small>
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
export async function renderProfileView(username) {
    // 1. Limpeza e Loader
    clearBreadcrumb();
    stopPostViewPoller();
    showLoader();
    
    // 2. Carregar dados do usuário e primeira página de posts
    let account = null;
    let initialPosts = [];
    
    try {
        account = await blockchain.getAccount(username); 
        // 🚨 Puxa 21 posts: 20 para exibir + 1 para a paginação
        initialPosts = await blockchain.getPostsByAuthor(username, 21); 

    } catch (error) {
        hideLoader();
        return renderError(`Could not load profile for @${username}. Error: ${error.message || 'Check RPC node or API call parameters.'}`);
    }

    if (!account) {
        hideLoader();
        return renderNotFound();
    }
    
    // Configuração inicial da paginação
    const postsToDisplay = initialPosts.slice(0, 20); // Exibe apenas os primeiros 20
    const hasMore = initialPosts.length > 20;

    profilePaginationState = {
        author: username,
        lastAuthor: hasMore ? postsToDisplay[postsToDisplay.length - 1].author : null,
        lastPermlink: hasMore ? postsToDisplay[postsToDisplay.length - 1].permlink : null,
        isLoading: false,
        hasMore: hasMore,
        limit: 20,
        postsContainerId: 'profile-posts-content-list'
    };
    
    // 3. Preparar dados
    const avatarUrl = blockchain.getAvatarUrl(username);
    const memberSince = new Date(account.created).toLocaleDateString();
    
    // 4. Breadcrumb
    renderBreadcrumb([
        { text: 'Home', href: '?' },
        { text: `Profile: @${username}`, href: null }
    ]);
    
    // 5. Montar o HTML do Perfil
    let html = `
        <div class="row">
            <div class="col-md-3">
                <div class="card mb-3">
                    <div class="card-body text-center">
                        <img src="${avatarUrl}" alt="@${username}'s Avatar" class="rounded-circle mb-3" style="width: 100px; height: 100px; object-fit: cover;">
                        <h4>@${username}</h4>
                        <p class="text-muted">Member since ${memberSince}</p>
                        <hr>
                        <ul class="list-unstyled text-start small">
                            <li><strong>BLURT Balance:</strong> ${account.balance}</li>
                            <li><strong>Blurt Power:</strong> ${account.vesting_shares.split(' ')[0]} BP</li>
                            <li><strong>Posts:</strong> ${postsToDisplay.length}${hasMore ? '+' : ''}</li> 
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
                                <button class="nav-link" id="replies-tab" data-bs-toggle="tab" data-bs-target="#replies-content" type="button" role="tab" aria-controls="replies-content" aria-selected="false">Replies (Not Implemented)</button>
                            </li>
                        </ul>
                    </div>
                    
                    <div class="card-body">
                        <div class="tab-content" id="profileTabsContent">
                            <div class="tab-pane fade show active" id="posts-content" role="tabpanel" aria-labelledby="posts-tab">
                                <div id="profile-posts-content-list">
                                    ${renderTopicsList(postsToDisplay)}
                                </div>
                                <div class="text-center mt-3">
                                    <button id="load-more-profile-posts" class="btn btn-secondary btn-sm" ${!hasMore ? 'disabled' : ''}>
                                        ${hasMore ? 'Load More Topics' : 'End of Feed'}
                                    </button>
                                </div>
                            </div>
                            <div class="tab-pane fade" id="replies-content" role="tabpanel" aria-labelledby="replies-tab">
                                <p class="text-muted">Replies functionality will be implemented soon.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.title = `@${username}'s Profile - ${CONFIG.forum_title}`;
    appContainer.innerHTML = html;
    hideLoader();
    
    // 6. Configurações Finais e Event Listeners
    const loadMoreBtn = document.getElementById('load-more-profile-posts');
    if (loadMoreBtn) {
        // Adiciona o listener para o clique (para carregamentos subsequentes)
        loadMoreBtn.addEventListener('click', () => loadMoreProfilePosts('profile-posts-content-list'));
    }
    
    const tabEl = document.getElementById('profileTabs');
    if (tabEl && window.bootstrap && window.bootstrap.Tab) {
        // Inicializa as abas do Bootstrap se a biblioteca estiver carregada
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
        const lastUpdate = new Date(topic.last_update).toLocaleString();
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