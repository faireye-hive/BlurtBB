// =========================================================================
// RENDER.JS: RESPONSÁVEL POR MONTAR TODO O HTML DA PÁGINA (VIEWS)
// =========================================================================

// Importações dos módulos que a renderização necessita:
import {CONFIG} from './config.js'; 
import * as blockchain from './blockchain.js';
import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import { showLoader, hideLoader, processPostTree, escapeSelector, getRoleBadge,renderMarkdown,getAllCategories } from './utils.js'; 
import { 
    handleVoteClick, 
    handleDeleteClick, 
    handlePostSubmit, 
    handleEditSubmit, 
    handleReplySubmit 
} from './ui.js';
import { startPostViewPoller, stopPostViewPoller } from './poller.js';
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
            html += `<a href="?category=${cat.id}" class="list-group-item list-group-item-action"><div class="d-flex w-100 justify-content-between"><h5 class="mb-1">${cat.title}</h5></div><p class="mb-1">${cat.description}</p></a>`;
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
            const lastPostHtml = `<div class="d-flex align-items-center" style="min-width: 180px;"><a href="?profile=${topic.lastPostAuthor}" class="me-2"><img src="${lastPostAvatarUrl}" class="rounded-circle" width="32" height="32" alt="${topic.lastPostAuthor}"></a><div><a href="?profile=${topic.lastPostAuthor}" class="text-break">@${topic.lastPostAuthor}</a><br><small class="text-muted"><a href="?post=@${topic.author}/${topic.permlink}" class="text-muted"><time datetime="${topic.lastPostDate}">${new Date(topic.lastPostDate).toLocaleString()}</time></a></small></div></div>`;
            topicsHtml += `<li class="list-group-item"><div class="d-flex w-100 align-items-center"><div class="flex-grow-1"><h5 class="mb-1"><a href="?post=@${topic.author}/${topic.permlink}">${topic.title}</a></h5><small class="text-muted">By <a href="?profile=${topic.author}">@${topic.author}</a>, ${new Date(topic.created).toLocaleString()}</small></div><div class="text-center mx-4" style="min-width: 80px;"><span class="d-block fs-5">${topic.children}</span><small class="text-muted">replies</small></div>${lastPostHtml}</div></li>`;
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
            if (voteBtn) handleVoteClick(voteBtn);
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
export async function renderNewTopicForm(categoryId) {
    if (easyMDEInstance) {
        try { easyMDEInstance.toTextArea(); } catch(e) {}
        easyMDEInstance = null;
    }

    const category = getAllCategories().find(c => c.id === categoryId);
    if (!category) { renderNotFound(); return; }
    if (!auth.getCurrentUser()) { renderError("You must be logged in to create a new topic."); return; }

    document.title = `New Topic in ${category.title} - ${CONFIG.forum_title}`;
    const draftKey = `draft-new-${categoryId}`;

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

    easyMDEInstance = new EasyMDE({
        element: bodyEl,
        spellChecker: false,
        placeholder: "Enter your content here...",
        autosave: { enabled: true, uniqueId: draftKey, delay: 1000 },
    });

    const fullDraftKey = `full-draft-${draftKey}`;
    const savedDraft = localStorage.getItem(fullDraftKey);
    if (savedDraft) {
        try {
            const draft = JSON.parse(savedDraft);
            titleEl.value = draft.title || '';
            easyMDEInstance.value(draft.body || '');
        } catch (e) { 
            easyMDEInstance.value(localStorage.getItem(draftKey) || '');
        }
    }

    const saveFullDraft = () => {
        const draft = { title: titleEl.value, body: easyMDEInstance.value() };
        localStorage.setItem(fullDraftKey, JSON.stringify(draft));
    };
    titleEl.addEventListener('input', saveFullDraft);
    easyMDEInstance.codemirror.on('change', saveFullDraft);

    document.getElementById('new-topic-form').addEventListener('submit', (e) => handlePostSubmit(e, fullDraftKey));
}


export async function renderEditView(author, permlink) {
    if (easyMDEInstance) {
        try { easyMDEInstance.toTextArea(); } catch(e) {}
        easyMDEInstance = null;
    }
    appContainer.innerHTML = '<div class="text-center mt-5"><div class="spinner-border"></div></div>';

    const post = await blockchain.getPostWithReplies(author, permlink);
    if (!post || post.author !== auth.getCurrentUser()) {
        renderError("You do not have permission to edit this.");
        return;
    }

    document.title = `Editing: ${post.title || 'Reply'}`;
    const draftKey = `draft-edit-${post.author}-${post.permlink}`;

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

    easyMDEInstance = new EasyMDE({
        element: bodyEl,
        spellChecker: false,
        autosave: { enabled: true, uniqueId: draftKey, delay: 1000 }
    });

    const savedDraft = localStorage.getItem(draftKey);
    easyMDEInstance.value(savedDraft || post.body);

    if (titleEl) {
        const savedTitleKey = `${draftKey}-title`;
        const savedTitle = localStorage.getItem(savedTitleKey);
        titleEl.value = savedTitle || post.title;
        titleEl.addEventListener('input', () => localStorage.setItem(savedTitleKey, titleEl.value));
    }

    document.getElementById('edit-form').addEventListener('submit', (e) => handleEditSubmit(e, post, draftKey));
}



