// =========================================================================
// RENDER.JS: RESPONSÁVEL POR MONTAR TODO O HTML DA PÁGINA (VIEWS)
// =========================================================================

// Importações dos módulos que a renderização necessita:
import {CONFIG} from './config.js'; 
import * as blockchain from './blockchain.js';
import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import { showLoader, hideLoader, processPostTree, escapeSelector, getRoleBadge,renderMarkdown,getAllCategories,createSnippet } from './utils.js'; 
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
    console.log("DEBUG: POST RETORNADO DE blockchain.getPostWithReplies:");
    console.log(post);

    if (!post || !post.author) { renderNotFound(); return; }

    document.title = `${post.title} - ${CONFIG.forum_title}`;
    const user = auth.getCurrentUser();
    const postAuthorAvatarUrl = blockchain.getAvatarUrl(post.author);

    const { allReplies, contentMap } = processPostTree(post); // Usa a função exportada

    //const renderedBody = await renderMarkdown(post.body);

    console.log(post.author, post.permlink);


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
    // Copie o conteúdo da sua função renderProfileView
    // ...
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

    // ... (restante da lógica de renderização do HTML) ...
    appContainer.innerHTML = `
        <h2>Editing ${post.title ? 'Topic' : 'Reply'}</h2>
        <form id="edit-form">
            ${post.title ? `<div class="mb-3"><label for="edit-title" class="form-label">Title</label><input type="text" class="form-control" id="edit-title"></div>` : ''}
            <div class="mb-3"><label for="edit-body" class="form-label">Content</label><textarea id="edit-body" rows="10"></textarea></div>
            <div id="edit-error" class="alert alert-danger d-none"></div>
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <a href="?post=@${author}/${permlink}" class="btn btn-secondary">Cancel</a>
        </form>`;
    
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

