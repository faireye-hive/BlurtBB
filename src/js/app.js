import { CONFIG } from './config.js';
import * as blockchain from './blockchain.js';
import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import * as beneficiaries from './beneficiaries.js';
import * as settings from './settings.js';

// Get DOM elements once
const appContainer = document.getElementById('app');
const authContainer = document.getElementById('auth-container');
const loginModalElement = document.getElementById('loginModal');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

let postViewPoller = null; // To hold the setInterval for dynamic updates
let currentRenderVotes = null; // To hold a reference to the current post's vote render function

// --- LOADER LOGIC ---
const loaderOverlay = document.getElementById('loader-overlay');
function showLoader() { loaderOverlay.classList.remove('d-none'); }
function hideLoader() { loaderOverlay.classList.add('d-none'); }

// --- AUTHENTICATION LOGIC ---

function updateAuthUI() {
    const user = auth.getCurrentUser();
    if (user) {
        const avatarUrl = blockchain.getAvatarUrl(user);
        authContainer.innerHTML = `
            <div class="dropdown text-end">
                <a href="#" class="d-block link-dark text-decoration-none dropdown-toggle" id="dropdownUser1" data-bs-toggle="dropdown" aria-expanded="false">
                    <img src="${avatarUrl}" alt="${user}" width="32" height="32" class="rounded-circle">
                </a>
                <ul class="dropdown-menu text-small" aria-labelledby="dropdownUser1">
                    <li><a class="dropdown-item" data-bs-toggle="modal" data-bs-target="#newPostModal">New Post...</a></li>
                    <li><a class="dropdown-item" data-bs-toggle="modal" data-bs-target="#configModal">Configuration</a></li>
                    <li><a class="dropdown-item" href="https://blurtwallet.com/@${user}" target="_blank">Wallet</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" id="logout-button">Logout</a></li>
                </ul>
            </div>`;
        document.getElementById('logout-button').addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
            updateAuthUI();
            handleRouteChange();
        });

        const dropdownElement = document.getElementById('dropdownUser1');
        if (dropdownElement) {
            setTimeout(() => {
                if (window.bootstrap && window.bootstrap.Dropdown) {
                    new window.bootstrap.Dropdown(dropdownElement);
                } else {
                    console.warn("Bootstrap Dropdown could not be initialized after timeout.");
                }
            }, 100);
        }

    } else {
        authContainer.innerHTML = `
            <button type="button" class="btn btn-outline-primary me-2" data-bs-toggle="modal" data-bs-target="#loginModal">
                Login
            </button>`;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    loginError.classList.add('d-none');
    const username = loginForm.username.value.trim();
    const postingKey = loginForm.postingKey.value.trim();
    const keepLoggedIn = loginForm.keepLoggedIn.checked;

    if (!username || !postingKey) {
        loginError.textContent = 'Username and posting key are required.';
        loginError.classList.remove('d-none');
        return;
    }

    try {
        const success = await auth.login(username, postingKey, keepLoggedIn);
        if (success) {
            const modal = bootstrap.Modal.getInstance(loginModalElement);
            modal.hide();
            updateAuthUI();
            handleRouteChange();
            loginForm.reset();
        }
    } catch (error) {
        loginError.textContent = error.message;
        loginError.classList.remove('d-none');
    }
}

// --- FORM SUBMISSION HANDLERS ---

async function handlePostSubmit(e, draftKey) {
    e.preventDefault();
    const title = document.getElementById('topic-title').value;
    const body = document.getElementById('topic-body').value;
    const errorDiv = document.getElementById('post-error');
    const categoryId = new URLSearchParams(window.location.search).get('new_topic_in');

    if (!title.trim() || !body.trim()) {
        errorDiv.textContent = "Title and content cannot be empty.";
        errorDiv.classList.remove('d-none');
        return;
    }

    e.target.querySelector('button[type="submit"]').disabled = true;
    errorDiv.classList.add('d-none');

    try {
        const author = auth.getCurrentUser();
        const key = auth.getPostingKey();
        const result = await blockchain.broadcastPost(author, key, categoryId, title, body);

        if (draftKey) {
            localStorage.removeItem(draftKey);
        }

        appContainer.innerHTML = `
            <div class="text-center mt-5">
                <h4>Post submitted successfully!</h4>
                <p>Waiting for it to be confirmed on the blockchain...</p>
                <div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>
            </div>`;
        pollForPost(author, result.finalPermlink);

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
}

async function handleReplySubmit(e, parentAuthor, parentPermlink) {
    e.preventDefault();
    const body = document.getElementById('reply-body').value;
    const errorDiv = document.getElementById('reply-error');

    if (!body.trim()) {
        errorDiv.textContent = "Reply content cannot be empty.";
        errorDiv.classList.remove('d-none');
        return;
    }

    e.target.querySelector('button[type="submit"]').disabled = true;
    errorDiv.classList.add('d-none');

    try {
        const author = auth.getCurrentUser();
        const key = auth.getPostingKey();
        const originalReplyCount = (await blockchain.getPostAndReplies(parentAuthor, parentPermlink)).replies.length;

        await blockchain.broadcastReply(author, key, parentAuthor, parentPermlink, body);

        e.target.querySelector('button[type="submit"]').innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Posting...';

        let attempts = 0;
        const maxAttempts = 15;
        const poller = setInterval(async () => {
            attempts++;
            const data = await blockchain.getPostAndReplies(parentAuthor, parentPermlink);
            if (data && data.replies.length > originalReplyCount) {
                clearInterval(poller);
                handleRouteChange();
            } else if (attempts >= maxAttempts) {
                clearInterval(poller);
                Toastify({ text: "Reply was submitted, but it is taking a long time to appear.", duration: 5000, backgroundColor: "orange" }).showToast();
                e.target.querySelector('button[type="submit"]').disabled = false;
                e.target.querySelector('button[type="submit"]').innerHTML = 'Submit Reply';
            }
        }, 2000);

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
}

async function handleEditSubmit(e, originalPost, draftKey) {
    e.preventDefault();
    const titleInput = document.getElementById('edit-title');
    const title = titleInput ? titleInput.value : originalPost.title;
    const body = document.getElementById('edit-body').value;
    const errorDiv = document.getElementById('edit-error');

    if (!body.trim() || (originalPost.title && !title.trim())) {
        errorDiv.textContent = "Title and content cannot be empty.";
        errorDiv.classList.remove('d-none');
        return;
    }

    e.target.querySelector('button[type="submit"]').disabled = true;

    try {
        const key = auth.getPostingKey();
        const metadata = JSON.parse(originalPost.json_metadata);
        await blockchain.broadcastEdit(originalPost.author, key, originalPost.permlink, title, body, metadata);

        if (draftKey) {
            localStorage.removeItem(draftKey);
        }

        appContainer.innerHTML = `<div class="text-center mt-5"><h4>Changes submitted!</h4><p>Waiting for confirmation...</p><div class="spinner-border"></div></div>`;
        pollForPost(originalPost.author, originalPost.permlink);

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
}

async function handleVoteClick(btn) {
    const { author, permlink } = btn.dataset;
    const voter = auth.getCurrentUser();
    const key = auth.getPostingKey();

    if (!voter || !key) {
        Toastify({ text: "You must be logged in to vote.", backgroundColor: "orange" }).showToast();
        return;
    }

    const isUnvoting = btn.classList.contains('btn-success');
    const weight = isUnvoting ? 0 : 10000;
    const actionText = isUnvoting ? 'Removing vote...' : 'Submitting vote...';

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${actionText}`;

    try {
        await blockchain.broadcastVote(voter, key, author, permlink, weight);
        Toastify({ text: "Vote submitted successfully!", backgroundColor: "green" }).showToast();
        
        // Immediately refresh the vote section instead of just toggling the button
        if (currentRenderVotes) {
            await currentRenderVotes();
        }

    } catch (error) {
        console.error("Vote failed:", error);
        Toastify({ text: `Vote failed: ${error.message}`, backgroundColor: "red" }).showToast();
        // Restore button on failure
        if (currentRenderVotes) {
            await currentRenderVotes(); // Also refresh on failure to restore the correct state
        }
    }
}

async function handleDeleteClick(e, author, permlink) {
    e.preventDefault();
    
    Toastify({
        text: "Are you sure you want to delete this? This action cannot be undone.",
        duration: 10000,
        close: true,
        gravity: "top",
        position: "center",
        backgroundColor: "linear-gradient(to right, #ff6e40, #ffc107)",
        stopOnFocus: true,
        onClick: async function() {
            try {
                const key = auth.getPostingKey();
                await blockchain.broadcastDelete(author, key, permlink);
                e.target.closest('.list-group-item, .card').innerHTML = '<p class="text-muted">[This content has been deleted]</p>';
                Toastify({ text: "Content deleted.", backgroundColor: "green" }).showToast();
            } catch (error) {
                console.error("Delete failed:", error);
                Toastify({ text: `Failed to delete: ${error.message}`, backgroundColor: "red" }).showToast();
            }
        }
    }).showToast();
}

// --- HELPER FUNCTIONS ---

function getRoleBadge(username) {
    if (CONFIG.admins.includes(username)) {
        return `<span class="badge bg-danger ms-2">Admin</span>`;
    }
    if (CONFIG.moderators.includes(username)) {
        return `<span class="badge bg-success ms-2">Moderator</span>`;
    }
    return '';
}

function getAllCategories() {
    return CONFIG.category_groups.flatMap(group => group.categories);
}

function pollForPost(author, permlink) {
    let attempts = 0;
    const maxAttempts = 15;
    const interval = 2000;

    const poller = setInterval(async () => {
        attempts++;
        console.log(`Polling for post... Attempt ${attempts}`);
        const data = await blockchain.getPostAndReplies(author, permlink);
        
        if (data && data.post && data.post.author) {
            clearInterval(poller);
            history.pushState({}, '', `?post=@${author}/${permlink}`);
            handleRouteChange();
        } else if (attempts >= maxAttempts) {
            clearInterval(poller);
            Toastify({ text: "Post was submitted, but it is taking a long time to appear. You will be redirected to the home page.", duration: 5000, backgroundColor: "orange" }).showToast();
            history.pushState({}, '', '/');
            handleRouteChange();
        }
    }, interval);
}

// --- RENDER FUNCTIONS ---

function renderMainView() {
    document.title = CONFIG.forum_title;
    let html = `<h1>${CONFIG.forum_title}</h1>`;
    CONFIG.category_groups.forEach(group => {
        html += `
            <div class="card mb-4">
                <div class="card-header">
                    <h4>${group.group_title}</h4>
                </div>
                <div class="list-group list-group-flush">`;
        group.categories.forEach(cat => {
            html += `
                <a href="?category=${cat.id}" class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1">${cat.title}</h5>
                    </div>
                    <p class="mb-1">${cat.description}</p>
                </a>`;
        });
        html += `</div></div>`;
    });
    appContainer.innerHTML = html;
}

async function renderCategoryView(categoryId) {
    showLoader();
    const params = new URLSearchParams(window.location.search);
    const startAuthor = params.get('start_author');
    const startPermlink = params.get('start_permlink');

    const category = getAllCategories().find(c => c.id === categoryId);
    if (!category) {
        renderNotFound();
        return;
    }

    document.title = `${category.title} - ${CONFIG.forum_title}`;
    const user = auth.getCurrentUser();
    let headerHtml = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h2>${category.title}</h2>
                <p class="mb-0">${category.description}</p>
            </div>
            ${user ? `<a href="?new_topic_in=${categoryId}" class="btn btn-primary">New Topic</a>` : ''}
        </div>`;

    let topics = await blockchain.getTopics(categoryId, startAuthor, startPermlink);
    topics = topics.filter(topic => !blacklist.isBlacklisted(topic.author, topic.permlink));

    let topicsHtml = '<ul class="list-group">';
    if (topics.length > 0) {
        let topicData = await Promise.all(topics.map(async topic => {
            const cacheKey = `last-reply-cache-${topic.author}-${topic.permlink}`;
            try {
                const cachedData = JSON.parse(localStorage.getItem(cacheKey));
                if (cachedData && cachedData.childrenCount === topic.children) {
                    console.log(`Cache HIT for ${topic.permlink} (children: ${topic.children})`);
                    return { ...topic, lastPostAuthor: cachedData.lastPostAuthor, lastPostDate: cachedData.lastPostDate };
                }
            } catch (e) {
                console.warn(`Could not parse cache for ${cacheKey}`, e);
            }

            console.log(`Cache MISS for ${topic.permlink} (children: ${topic.children}). Fetching from API.`);
            const lastReply = await blockchain.getLastReply(topic.author, topic.permlink);
            
            const newData = {
                childrenCount: topic.children,
                lastPostAuthor: lastReply ? lastReply.author : topic.author,
                lastPostDate: lastReply ? lastReply.created : topic.created
            };
            
            localStorage.setItem(cacheKey, JSON.stringify(newData));
            return { ...topic, lastPostAuthor: newData.lastPostAuthor, lastPostDate: newData.lastPostDate };
        }));

        // Sort the *enriched* data by the accurate last post date
        topicData.sort((a, b) => new Date(b.lastPostDate) - new Date(a.lastPostDate));

        topicData.forEach(topic => {
            const lastPostAuthor = topic.lastPostAuthor;
            const lastPostDate = topic.lastPostDate;
            const lastPostAvatarUrl = blockchain.getAvatarUrl(lastPostAuthor);
            const lastPostHtml = `
                <div class="d-flex align-items-center" style="min-width: 180px;">
                    <a href="?profile=${lastPostAuthor}" class="me-2">
                        <img src="${lastPostAvatarUrl}" class="rounded-circle" width="32" height="32" alt="${lastPostAuthor}">
                    </a>
                    <div>
                        <a href="?profile=${lastPostAuthor}" class="text-break">@${lastPostAuthor}</a>
                        <br>
                        <small class="text-muted">
                            <a href="?post=@${topic.author}/${topic.permlink}" class="text-muted">
                                <time datetime="${lastPostDate}">${new Date(lastPostDate).toLocaleString()}</time>
                            </a>
                        </small>
                    </div>
                </div>
            `;

            topicsHtml += `
                <li class="list-group-item">
                    <div class="d-flex w-100 align-items-center">
                        <!-- Main Info -->
                        <div class="flex-grow-1">
                            <h5 class="mb-1">
                                <a href="?post=@${topic.author}/${topic.permlink}">${topic.title}</a>
                            </h5>
                            <small class="text-muted">
                                By <a href="?profile=${topic.author}">@${topic.author}</a>, ${new Date(topic.created).toLocaleString()}
                            </small>
                        </div>

                        <!-- Stats -->
                        <div class="text-center mx-4" style="min-width: 80px;">
                            <span class="d-block fs-5">${topic.children}</span>
                            <small class="text-muted">replies</small>
                        </div>

                        <!-- Last Post Info -->
                        ${lastPostHtml}
                    </div>
                </li>`;
        });
    } else {
        topicsHtml += '<li class="list-group-item">No topics found in this category.</li>';
    }
    topicsHtml += '</ul>';

    let paginationHtml = '';
    if (topics.length === 15) {
        const lastTopic = topics[topics.length - 1];
        paginationHtml = `
            <div class="d-flex justify-content-end mt-3">
                <a href="?category=${categoryId}&start_author=${lastTopic.author}&start_permlink=${lastTopic.permlink}" class="btn btn-outline-primary">Next Page &rarr;</a>
            </div>`;
    }

    appContainer.innerHTML = headerHtml + topicsHtml + paginationHtml;
    hideLoader();
}

async function renderPostView(author, permlink) {
    showLoader();
    
    if (blacklist.isBlacklisted(author, permlink)) {
        renderError("This content is unavailable because the author or the post is blacklisted.");
        return;
    }

    const data = await blockchain.getPostAndReplies(author, permlink);

    if (!data || !data.post || data.post.author === '') {
        renderNotFound();
        return;
    }

    let { post, replies } = data;
    replies = replies.filter(reply => !blacklist.isBlacklisted(reply.author, reply.permlink));
    document.title = `${post.title} - ${CONFIG.forum_title}`;
    const user = auth.getCurrentUser();
    const postAuthorAvatarUrl = blockchain.getAvatarUrl(post.author);

    let html = `
        <div class="card mb-3">
            <div class="card-body">
                <div class="row">
                    <!-- Left Column: Author Info -->
                    <div class="col-md-3 text-center border-end">
                        <a href="?profile=${post.author}">
                            <img src="${postAuthorAvatarUrl}" alt="${post.author}" class="rounded-circle mb-2" width="60" height="60">
                            <h5 class="mb-0">@${post.author}</h5>
                        </a>
                        ${getRoleBadge(post.author)}
                        <small class="text-muted d-block mt-2">Posted: ${new Date(post.created).toLocaleString()}</small>
                    </div>

                    <!-- Right Column: Post Content and Actions -->
                    <div class="col-md-9">
                        <h1 class="card-title">${post.title}</h1>
                        <div class="card-text fs-5 mb-3">${DOMPurify.sanitize(marked.parse(post.body), { ALLOWED_TAGS: ['p', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre', 'br', 'hr'], ALLOWED_ATTR: ['href', 'src', 'alt', 'title'] })}</div>
                        
                        <div class="d-flex align-items-center justify-content-between mt-3">
                            <div class="d-flex align-items-center vote-section" data-author="${post.author}" data-permlink="${post.permlink}">
                                <!-- Vote button and Pending Payout rendered here by poller -->
                            </div>
                            <div>
                                ${auth.getCurrentUser() === post.author ? `
                                    <a href="?edit=@${post.author}/${post.permlink}" class="btn btn-sm btn-outline-secondary me-2">Edit</a>
                                    <button id="delete-post-btn" class="btn btn-sm btn-outline-danger">Delete Post</button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <h3>Replies</h3>`;

    if (replies.length > 0) {
        html += '<div class="list-group">'
        replies.forEach(reply => {
            const replyAvatarUrl = blockchain.getAvatarUrl(reply.author);
            html += `
                <div class="list-group-item">
                    <div class="row">
                        <!-- Left Column: Author Info -->
                        <div class="col-md-3 text-center border-end">
                            <a href="?profile=${reply.author}">
                                <img src="${replyAvatarUrl}" alt="${reply.author}" class="rounded-circle mb-2" width="40" height="40">
                                <h6 class="mb-0">@${reply.author}</h6>
                            </a>
                            ${getRoleBadge(reply.author)}
                            <small class="text-muted d-block mt-2">Replied: ${new Date(reply.created).toLocaleString()}</small>
                        </div>

                        <!-- Right Column: Reply Content and Actions -->
                        <div class="col-md-9">
                            <div class="mb-2">${DOMPurify.sanitize(marked.parse(reply.body), { ALLOWED_TAGS: ['p', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre', 'br', 'hr'], ALLOWED_ATTR: ['href', 'src', 'alt', 'title'] })}</div>
                            <div class="d-flex align-items-center justify-content-between mt-2">
                                <div class="d-flex align-items-center vote-section" data-author="${reply.author}" data-permlink="${reply.permlink}">
                                    <!-- Vote section will be dynamically rendered here -->
                                </div>
                                <div>
                                    ${auth.getCurrentUser() === reply.author ? `
                                        <a href="?edit=@${reply.author}/${reply.permlink}" class="btn btn-sm btn-link text-secondary me-2">Edit</a>
                                        <button class="btn btn-sm btn-link text-danger delete-reply-btn" data-permlink="${reply.permlink}">Delete</button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        html += '</div>'
    } else {
        html += '<p>No replies yet.</p>';
    }

    if (auth.getCurrentUser()) {
        html += `
            <hr class="my-4">
            <h4>Leave a Reply</h4>
            <form id="reply-form">
                <div class="mb-3">
                    <textarea class="form-control" id="reply-body" rows="5" required></textarea>
                </div>
                <div id="reply-error" class="alert alert-danger d-none"></div>
                <button type="submit" class="btn btn-primary">Submit Reply</button>
            </form>`;
    }

    appContainer.innerHTML = html;

    // --- Attach all event listeners ---
    if (auth.getCurrentUser()) {
        const replyForm = document.getElementById('reply-form');
        if(replyForm) {
            replyForm.addEventListener('submit', (e) => handleReplySubmit(e, post.author, post.permlink));
        }
        const deletePostBtn = document.getElementById('delete-post-btn');
        if (deletePostBtn) {
            deletePostBtn.addEventListener('click', (e) => handleDeleteClick(e, post.author, post.permlink));
        }
        document.querySelectorAll('.delete-reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleDeleteClick(e, auth.getCurrentUser(), e.target.dataset.permlink));
        });
        // We use event delegation for the vote buttons
        appContainer.addEventListener('click', function(e) {
            const voteBtn = e.target.closest('.vote-btn');
            if (voteBtn) {
                handleVoteClick(voteBtn);
            }
        });
    }

    // --- Start live updates ---
    startPostViewPoller(user, author, permlink);
    hideLoader();
}

function startPostViewPoller(user, author, permlink) {
    if (postViewPoller) clearInterval(postViewPoller);

    const renderVotes = async () => {
        const data = await blockchain.getPostAndReplies(author, permlink);
        if (!data || !data.post) return;

        const allContent = [data.post, ...data.replies];
        allContent.forEach(content => {
            if (!content) return;

            const voteContainer = document.querySelector(`.vote-section[data-permlink="${content.permlink}"]`);
            if (!voteContainer) return;

            const userVoted = user && content.active_votes.some(v => v.voter === user);
            const votersList = content.active_votes.map(v => `@${v.voter}`).join('<br>');

            const newHtml = `
                ${user ? `
                <button class="btn btn-sm ${userVoted ? 'btn-success' : 'btn-outline-success'} me-2 vote-btn" 
                    data-author="${content.author}" 
                    data-permlink="${content.permlink}" >
                    <i class="fas fa-thumbs-up"></i> <span>${userVoted ? 'Unvote' : 'Upvote'}</span>
                </button>
                ` : ''}
                <button type="button" class="btn btn-link text-muted text-decoration-none p-0 vote-popover" data-bs-toggle="popover" data-bs-html="true" title="${content.active_votes.length} Voters" data-bs-content="${votersList || 'No votes yet.'}">
                    ${content.title ? `Pending Payout: ${content.pending_payout_value}` : `<small>Payout: ${content.pending_payout_value}</small>`}
                </button>
            `;
            voteContainer.innerHTML = newHtml;
        });

        // Re-initialize popovers on the new elements
        appContainer.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => new window.bootstrap.Popover(el));
    };

    currentRenderVotes = renderVotes;

    renderVotes();
    postViewPoller = setInterval(renderVotes, 5000);
}

function renderNewTopicForm(categoryId) {
    const category = getAllCategories().find(c => c.id === categoryId);
    if (!category) {
        renderNotFound();
        return;
    }

    if (!auth.getCurrentUser()) {
        renderError("You must be logged in to create a new topic.");
        return;
    }

    document.title = `New Topic in ${category.title} - ${CONFIG.forum_title}`;
    const draftKey = `draft-new-${categoryId}`;

    appContainer.innerHTML = `
        <h2>New Topic in ${category.title}</h2>
        <form id="new-topic-form">
            <div class="mb-3">
                <label for="topic-title" class="form-label">Title</label>
                <input type="text" class="form-control" id="topic-title" required>
            </div>
            <div class="mb-3">
                <label for="topic-body" class="form-label">Content</label>
                <textarea class="form-control" id="topic-body" rows="10" required></textarea>
                <div class="form-text">You can use Markdown for formatting. Draft is saved automatically.</div>
            </div>
            <div id="post-error" class="alert alert-danger d-none"></div>
            <button type="submit" class="btn btn-primary">Submit Topic</button>
            <a href="?category=${categoryId}" class="btn btn-secondary">Cancel</a>
        </form>`;

    const titleEl = document.getElementById('topic-title');
    const bodyEl = document.getElementById('topic-body');

    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
        const { title, body } = JSON.parse(savedDraft);
        titleEl.value = title;
        bodyEl.value = body;
    }

    const saveDraft = () => {
        const draft = { title: titleEl.value, body: bodyEl.value };
        localStorage.setItem(draftKey, JSON.stringify(draft));
    };
    titleEl.addEventListener('input', saveDraft);
    bodyEl.addEventListener('input', saveDraft);

    document.getElementById('new-topic-form').addEventListener('submit', (e) => handlePostSubmit(e, draftKey));
}

async function renderEditView(author, permlink) {
    appContainer.innerHTML = '<div class="text-center mt-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    const content = await blockchain.getPostAndReplies(author, permlink);
    const post = content.post ? content.post : content;

    if (!post || post.author !== auth.getCurrentUser()) {
        renderError("You do not have permission to edit this post or it does not exist.");
        return;
    }

    document.title = `Editing: ${post.title || 'Reply'}`;
    const draftKey = `draft-edit-${post.author}-${post.permlink}`;

    appContainer.innerHTML = `
        <h2>Editing ${post.title ? 'Topic' : 'Reply'}</h2>
        <form id="edit-form">
            ${post.title ? `
            <div class="mb-3">
                <label for="edit-title" class="form-label">Title</label>
                <input type="text" class="form-control" id="edit-title" required>
            </div>` : ''}
            <div class="mb-3">
                <label for="edit-body" class="form-label">Content</label>
                <textarea class="form-control" id="edit-body" rows="10" required></textarea>
                <div class="form-text">Draft is saved automatically.</div>
            </div>
            <div id="edit-error" class="alert alert-danger d-none"></div>
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <a href="?post=@${author}/${permlink}" class="btn btn-secondary">Cancel</a>
        </form>
    `;

    const titleEl = document.getElementById('edit-title');
    const bodyEl = document.getElementById('edit-body');

    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
        const { title, body } = JSON.parse(savedDraft);
        if (titleEl) titleEl.value = title;
        bodyEl.value = body;
    } else {
        if (titleEl) titleEl.value = post.title;
        bodyEl.value = post.body;
    }

    const saveDraft = () => {
        const draft = { 
            title: titleEl ? titleEl.value : post.title, 
            body: bodyEl.value 
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
    };
    if (titleEl) titleEl.addEventListener('input', saveDraft);
    bodyEl.addEventListener('input', saveDraft);

    document.getElementById('edit-form').addEventListener('submit', (e) => handleEditSubmit(e, post, draftKey));
}

function renderError(message) {
    appContainer.innerHTML = `<div class="alert alert-danger">${message}</div><a href="/">Back to Home</a>`;
    hideLoader();
}

function renderNotFound() {
    appContainer.innerHTML = `
        <div class="alert alert-danger"><strong>404 Not Found</strong><p>The page you requested could not be found.</p></div>
        <a href="/">Back to Home</a>`;
    document.title = `Not Found - ${CONFIG.forum_title}`;
    hideLoader();
}

// --- ROUTER & INITIALIZATION ---

function handleRouteChange() {
    if (postViewPoller) {
        clearInterval(postViewPoller);
        postViewPoller = null;
        currentRenderVotes = null;
    }

    appContainer.innerHTML = ''; // Clear the page before loading new content

    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get('category');
    const postLink = params.get('post');
    const newTopicCategory = params.get('new_topic_in');
    const editLink = params.get('edit');
    const profileUsername = params.get('profile');

    if (postLink) {
        const [author, permlink] = postLink.startsWith('@') ? postLink.substring(1).split('/') : postLink.split('/');
        renderPostView(author, permlink);
    } else if (categoryId) {
        renderCategoryView(categoryId);
    } else if (newTopicCategory) {
        renderNewTopicForm(newTopicCategory);
    } else if (editLink) {
        const [author, permlink] = editLink.startsWith('@') ? editLink.substring(1).split('/') : editLink.split('/');
        renderEditView(author, permlink);
    } else if (profileUsername) {
        renderProfileView(profileUsername);
    } else {
        renderMainView();
    }
}

// --- THEME & SETTINGS LOGIC ---

const BOOTSWATCH_THEMES = ['default', 'cerulean', 'cosmo', 'cyborg', 'darkly', 'flatly', 'journal', 'litera', 'lumen', 'lux', 'materia', 'minty', 'pulse', 'sandstone', 'simplex', 'sketchy', 'slate', 'solar', 'spacelab', 'superhero', 'united', 'yeti'];

function applyTheme(themeName) {
    const themeUrl = themeName === 'default' 
        ? 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css' 
        : `https://cdn.jsdelivr.net/npm/bootswatch@5.3.2/dist/${themeName}/bootstrap.min.css`;
    
    document.getElementById('theme-css').setAttribute('href', themeUrl);
}

function setupConfigModal() {
    const rpcNodeInput = document.getElementById('rpc-node');
    const useCoalCheckbox = document.getElementById('use-coal');
    const themeSelector = document.getElementById('theme-selector');

    // Populate themes
    BOOTSWATCH_THEMES.forEach(theme => {
        const option = new Option(theme.charAt(0).toUpperCase() + theme.slice(1), theme);
        themeSelector.add(option);
    });

    // Load current settings into the form
    rpcNodeInput.value = settings.getSetting('RPC_URL');
    useCoalCheckbox.checked = settings.getSetting('USE_COAL');
    themeSelector.value = settings.getSetting('THEME');

    // Save handler
    document.getElementById('save-config').addEventListener('click', () => {
        const newSettings = {
            RPC_URL: rpcNodeInput.value,
            USE_COAL: useCoalCheckbox.checked,
            THEME: themeSelector.value
        };
        settings.saveSettings(newSettings);
        applyTheme(newSettings.THEME);
        Toastify({ text: "Settings saved! Reloading to apply all changes...", backgroundColor: "green" }).showToast();
        
        // Reload the page to apply RPC and blacklist settings
        setTimeout(() => window.location.reload(), 1500);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    settings.initSettings();
    blockchain.initBlockchain();
    applyTheme(settings.getSetting('THEME'));

    await blacklist.initBlacklist();
    await beneficiaries.initBeneficiaries();

    auth.initAuth();
    updateAuthUI();
    setupConfigModal();
    
    loginForm.addEventListener('submit', handleLogin);

    document.body.addEventListener('click', e => {
        // If the click is not on a popover trigger or inside a popover, hide all popovers
        if (!e.target.closest('[data-bs-toggle="popover"]') && !e.target.closest('.popover')) {
            document.querySelectorAll('[data-bs-toggle="popover"]').forEach(popoverEl => {
                const popover = bootstrap.Popover.getInstance(popoverEl);
                if (popover) {
                    popover.hide();
                }
            });
        }

        const anchor = e.target.closest('a');
        if (!anchor) return;

        // Prevent default for modal triggers OR dropdown triggers
        if (anchor.hasAttribute('data-bs-toggle') && (anchor.getAttribute('data-bs-toggle') === 'modal' || anchor.getAttribute('data-bs-toggle') === 'dropdown')) {
            e.preventDefault();
            return;
        }

        if ((anchor.href.includes('?category=') || anchor.href.includes('?post=') || anchor.href.includes('?new_topic_in=') || anchor.href.includes('?edit=') || anchor.href.includes('?profile=') || anchor.pathname === '/')) {
            const url = new URL(anchor.href);
            if (url.origin === window.location.origin) {
                e.preventDefault();
                history.pushState({}, '', anchor.href);
                handleRouteChange();
            }
        }
    });

    const categoryList = document.getElementById('new-post-category-list');
    if (categoryList) {
        getAllCategories().forEach(cat => {
            const link = document.createElement('a');
            link.href = `?new_topic_in=${cat.id}`;
            link.className = 'list-group-item list-group-item-action';
            link.textContent = cat.title;
            link.onclick = (e) => {
                e.preventDefault();
                const modal = bootstrap.Modal.getInstance(document.getElementById('newPostModal'));
                modal.hide();
                history.pushState({}, '', link.href);
                handleRouteChange();
            };
            categoryList.appendChild(link);
        });
    }

    window.addEventListener('popstate', handleRouteChange);
    handleRouteChange();
});
