import { CONFIG } from './config.js';
import * as i18n from './i18n.js';
import * as blockchain from './blockchain.js';
import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import * as beneficiaries from './beneficiaries.js';
import * as settings from './settings.js';

import { 
    renderMainView, 
    renderCategoryView, 
    renderPostView, 
    renderProfileView, 
    renderNewTopicForm, 
    renderEditView,
    renderNotificationsView

} from './render.js';
import { showLoader, hideLoader, getDecryptedPostingKey, processPostTree, escapeSelector, renderMarkdown,getAllCategories } from './utils.js';
import { startPostViewPoller, stopPostViewPoller, startNotificationPoller, stopNotificationPoller } from './poller.js';

// Get DOM elements once
export const appContainer = document.getElementById('app');
const authContainer = document.getElementById('auth-container');
const loginModalElement = document.getElementById('loginModal');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const usernameInput = document.getElementById('username'); // O input de usuário

// 🚨 NOVO ELEMENTO DOM: O botão que você precisa adicionar no seu HTML
const keychainLoginBtn = document.getElementById('keychain-login-btn');

let easyMDEInstance = null; // ⬅️ Variavel privada do módulo

// Funções para controle de acesso:
export function setEasyMDEInstance(instance) {
    // Permite que o render.js defina a nova instância do editor
    easyMDEInstance = instance;
}

export function getEasyMDEInstance() {
    // Permite que ui.js ou outros módulos obtenham a instância atual
    return easyMDEInstance;
}

async function handleKeychainLogin(e) {
    e.preventDefault();
    const btn = e.target;
    
    // 🚨 PASSO 1: OBTÉM O NOME DE USUÁRIO
    const username = usernameInput.value.trim().toLowerCase();
    
    if (!username) {
        // Exibe erro se o campo estiver vazio
        loginError.textContent = "Por favor, digite seu nome de usuário antes de usar o Keychain.";
        loginError.classList.remove('d-none');
        return; 
    }
    
    // Reset de estado e desabilitação do botão
    btn.disabled = true;
    loginError.textContent = ''; 
    loginError.classList.add('d-none'); // Esconde a mensagem de erro

    try {
        // 🚨 PASSO 2: CHAMA A FUNÇÃO PASSANDO O USERNAME OBRIGATÓRIO
        const loggedInUsername = await auth.loginWithKeychain(username);
        
        // 1. Fecha o Modal de Login
        const loginModal = bootstrap.Modal.getInstance(loginModalElement);
        if (loginModal) loginModal.hide();
        
        // 2. Atualiza o estado da UI
        // Use loggedInUsername, embora deva ser igual ao 'username'
        updateAuthUI(loggedInUsername); 
        
        // 3. Força o carregamento da página 
        handleRouteChange(); 
        
    } catch (error) {
        // Lógica de erro
        console.error("Keychain Login Failed:", error);
        loginError.textContent = error.message || "Falha ao se conectar com o Keychain. Verifique se o usuário está logado na extensão.";
        loginError.classList.remove('d-none'); // Mostra a mensagem de erro
        btn.disabled = false;
    }
}

/**
 * Traduz o HTML estático usando o atributo data-i18n.
 */

function translateStaticContent() {
    // Traduz o título da página
    const titleElement = document.querySelector('title');
    if (titleElement) {
        titleElement.textContent = i18n.translate('forumTitle');
    }
    
    // Percorre todos os elementos com o atributo data-i18n
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = i18n.translate(key);
        
        // Use textContent para segurança, mas se precisar de HTML, use innerHTML (com DOMPurify)
        if (key === 'deleteConfirmationBody') { 
            // Exemplo de uso de HTML (CUIDADO: já é pré-sanitizado por você)
            element.innerHTML = translation; 
        } else {
            element.textContent = translation;
        }
    });
}

export async function loadAndDisplayNotifCount(user) {
    if (!user) {
        // Limpar o badge se o usuário não estiver logado
        const badgeElement = document.getElementById('unread-notif-badge');
        if (badgeElement) badgeElement.innerHTML = '';
        return;
    }
    
    const unreadCount = await blockchain.getUnreadNotificationCount(user);
    const badgeElement = document.getElementById('unread-notif-badge');
    const avatarBadge = document.getElementById('avatar-notif-badge');

    if (!user || !avatarBadge || !badgeElement) {
        // Limpa ambos os badges se não estiver logado ou se não forem encontrados
        if (avatarBadge) avatarBadge.innerHTML = '';
        if (badgeElement) badgeElement.innerHTML = '';
        return;
    }

    if (badgeElement) {
        if (unreadCount > 0) {
            // Se houver não lidas, mostra o badge vermelho
            badgeElement.innerHTML = `<span class="badge rounded-pill bg-danger ms-1">${unreadCount}</span>`;
            avatarBadge.innerHTML = `<span class="badge rounded-pill bg-danger ms-1">${unreadCount}</span>`;
        } else {
            // Se não houver, limpa o badge
            badgeElement.innerHTML = '';
            avatarBadge.innerHTML = '';
        }
    }
}

/**
 * Funções auxiliares para lidar com o fluxo de Senha Mestra.
 * NOTA: O prompt() do navegador não é o ideal para UX. Recomenda-se substituí-lo
 * por um modal personalizado do Bootstrap para um visual mais profissional.
 */

function updateAuthUI() {
    const user = auth.getCurrentUser();
    const isLocked = auth.isSessionLocked();
    
    if (user) {
        const avatarUrl = blockchain.getAvatarUrl(user);
        let actionButton = '';

        if (isLocked) {
             // Se a chave estiver bloqueada, o botão no dropdown é "Unlock"
            actionButton = `<li><a class="dropdown-item" id="unlock-button">${i18n.translate('unlockSession')}</a></li>`;
        } else {
            // Se estiver desbloqueada (chave na memória), o botão é "Lock"
            actionButton = `<li><a class="dropdown-item" id="lock-button">${i18n.translate('lockSession')}</a></li>`;
        }

        authContainer.innerHTML = `
            <div class="dropdown text-end">
                <a href="#" class="d-block link-dark text-decoration-none dropdown-toggle" id="dropdownUser1" data-bs-toggle="dropdown" aria-expanded="false">
                    <img src="${avatarUrl}" alt="${user}" width="32" height="32" class="rounded-circle">
                    <span id="avatar-notif-badge" class="position-absolute translate-middle badge rounded-circle bg-danger p-1"></span>
                </a>
                <ul class="dropdown-menu text-small" aria-labelledby="dropdownUser1">
                    <li><a class="dropdown-item" data-bs-toggle="modal" data-bs-target="#newPostModal">${i18n.translate('newPost')}</a></li>
                    <li><a class="dropdown-item" href="?profile=${user}">${i18n.translate('myProfile')}</a></li>
                    <li><a class="dropdown-item" href="?notifications=true" id="notif-link">
                        ${i18n.translate('notifications')}
                        <span id="unread-notif-badge"></span>
                    </a></li>
                    <li><a class="dropdown-item" data-bs-toggle="modal" data-bs-target="#configModal">${i18n.translate('configuration')}</a></li>
                    <li><a class="dropdown-item" href="https://blurtwallet.com/@${user}" target="_blank">${i18n.translate('wallet')}</a></li>
                    <li><hr class="dropdown-divider"></li>
                    ${actionButton}
                    <li><a class="dropdown-item" id="logout-button">${i18n.translate('logout')}</a></li>
                </ul>
            </div>`;
            loadAndDisplayNotifCount(user);
        
        // Adiciona listeners para Logout e Lock/Unlock
        document.getElementById('logout-button').addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
            updateAuthUI();
            handleRouteChange();
        });

        if (isLocked) {
            document.getElementById('unlock-button').addEventListener('click', async (e) => {
                 // Usa a mesma lógica de desbloqueio dos handlers de transação
                const masterPassword = prompt("Digite seu Pin para desbloquear a sessão:");
                if (masterPassword) {
                    try {
                        auth.unlockSession(masterPassword);
                        updateAuthUI(); // Atualiza UI para mostrar "Lock"
                        Toastify({ text: "Sessão desbloqueada.", duration: 3000, backgroundColor: "green" }).showToast();
                    } catch (error) {
                         Toastify({ text: `Erro: ${error.message}`, duration: 5000, backgroundColor: "red" }).showToast();
                    }
                }
            });
        } else {
            document.getElementById('lock-button').addEventListener('click', (e) => {
                e.preventDefault();
                auth.lockSession();
                updateAuthUI(); // Atualiza UI para mostrar "Unlock"
            });
        }
        
        const dropdownElement = document.getElementById('dropdownUser1');
        if (dropdownElement) {
            setTimeout(() => {
                if (window.bootstrap && window.bootstrap.Dropdown) {
                    new window.bootstrap.Dropdown(dropdownElement);
                }
            }, 100);
        }
    } else {
        authContainer.innerHTML = `<button type="button" class="btn btn-outline-primary me-2" data-bs-toggle="modal" data-bs-target="#loginModal">Login</button>`;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    loginError.classList.add('d-none');
    const username = loginForm.username.value.trim();
    const postingKey = loginForm.postingKey.value.trim();
    const masterPassword = loginForm.masterPassword.value.trim(); // NOVO CAMPO
    const keepLoggedIn = loginForm.keepLoggedIn.checked;

    if (!username || !postingKey || !masterPassword) {
        loginError.textContent = 'Nome de usuário, chave de postagem e senha PIN são obrigatórios.';
        loginError.classList.remove('d-none');
        return;
    }

    try {
        // ATUALIZADO: Passa a masterPassword para o login
        const success = await auth.login(username, postingKey, masterPassword, keepLoggedIn);
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

// aos handlers de transação foram alteradas.

function pollForPost(author, permlink) {
    let attempts = 0;
    const maxAttempts = 15, interval = 2000;
    const poller = setInterval(async () => {
        attempts++;
        const data = await blockchain.getPostAndDirectReplies(author, permlink);
        if (data && data.post && data.post.author) {
            clearInterval(poller);
            history.pushState({}, '', `?post=@${author}/${permlink}`);
            handleRouteChange();
        } else if (attempts >= maxAttempts) {
            clearInterval(poller);
            Toastify({ text: "Post was submitted, but it's taking a long time to appear. You will be redirected.", duration: 5000 }).showToast();
            history.pushState({}, '', '/');
            handleRouteChange();
        }
    }, interval);
}

// --- ROUTER & INITIALIZATION ---

export async function handleRouteChange() { 
    
    // 1. CHAMA O MÓDULO PARA PARAR O POLLER
    stopPostViewPoller(); 

    if (easyMDEInstance) {
        try { easyMDEInstance.toTextArea(); } catch(e) {}
        easyMDEInstance = null;
    }

    // 2. CHAMA O MÓDULO PARA MOSTRAR O LOADER
    showLoader();
    appContainer.innerHTML = ''; // Clear the page before loading new content

    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get('category');
    const postLink = params.get('post');
    const newTopicCategory = params.get('new_topic_in');
    const editLink = params.get('edit');
    const profileUsername = params.get('profile');
    const showNotifications = params.get('notifications');

    // A lógica de renderização AINDA ESTÁ NO app.js, mas faremos a chamada do poller.
    let postData = null; // Variável para armazenar o post

    // Usamos um bloco try/finally para garantir que o hideLoader seja sempre chamado
    try {
        if (postLink) {
            const [author, permlink] = postLink.startsWith('@') ? postLink.substring(1).split('/') : postLink.split('/');

            // 🚨 MUDANÇA: renderPostView AGORA PRECISA SER AWAIT E RETORNAR O POST
            // **IMPORTANTE**: Se você ainda não moveu renderPostView, e ela for assíncrona,
            // você deve adaptá-la para retornar o objeto post.
            postData = await renderPostView(author, permlink); 
            
            // 🚨 CHAMA O MÓDULO PARA INICIAR O POLLER
            if (postData) {
                console.log("DEBUG: POST DATA RETORNADO. INICIANDO POLLER."); // Linha 2
                startPostViewPoller(author, permlink, postData);
            }

        } else if (categoryId) {
            await renderCategoryView(categoryId);
        } else if (newTopicCategory) {
            await renderNewTopicForm(newTopicCategory);
        } else if (editLink) {
            const [author, permlink] = editLink.startsWith('@') ? editLink.substring(1).split('/') : editLink.split('/');
            await renderEditView(author, permlink);
        } else if (profileUsername) {
            await renderProfileView(profileUsername);
        } else if (showNotifications === 'true') { // 🚨 ADICIONE ESTE BLOCO
            await renderNotificationsView();
        } else {
            await renderMainView();
        }
    } catch (error) {
        console.error("Erro ao carregar rota:", error);
        appContainer.innerHTML = `<div class="alert alert-danger" role="alert">Ocorreu um erro ao carregar o conteúdo.</div>`;
    } finally {
        // 3. CHAMA O MÓDULO PARA ESCONDER O LOADER
        hideLoader(); 
    }
}

function setupConfigModal() {
    const rpcNodeInput = document.getElementById('rpc-node');
    const useCoalCheckbox = document.getElementById('use-coal');
    const languageSelector = document.getElementById('language-selector');

    // 1. Popular os idiomas disponíveis
    // Use i18n.getAvailableLanguages() e i18n.LANGUAGE_NAMES
    i18n.getAvailableLanguages().forEach(langCode => {
        // Usa a chave de tradução (ex: 'portuguese') para o texto de exibição
        const displayNameKey = i18n.LANGUAGE_NAMES[langCode]; 
        
        // Traduz o nome para o idioma ATUAL do usuário
        const displayName = i18n.translate(displayNameKey, langCode); 
        
        const option = new Option(displayName, langCode);
        languageSelector.add(option);
    });

    // Load current settings into the form
    rpcNodeInput.value = settings.getSetting('RPC_URL');
    useCoalCheckbox.checked = settings.getSetting('USE_COAL');
    languageSelector.value = i18n.getCurrentLanguage();



    // Save handler
    document.getElementById('save-config').addEventListener('click', () => {
        const newSettings = {
            RPC_URL: rpcNodeInput.value,
            USE_COAL: useCoalCheckbox.checked
        };
        
        // --- Lógica do Idioma ---
        const newLang = languageSelector.value;
        const currentLang = i18n.getCurrentLanguage();
        let shouldReload = false; // Flag para recarregar

        if (newLang !== currentLang) {
            i18n.setLanguage(newLang); // Salva o novo idioma
            shouldReload = true;
            // O ideal é não recarregar, mas sim re-renderizar todo o DOM (incluindo renderização dinâmica)
            // Se você não quiser re-renderizar todo o app, o reload é a maneira mais segura.
        }


        settings.saveSettings(newSettings);

        const toastMessage = i18n.translate('settingsSaved') + '. ' + i18n.translate('reloadingToApplyChanges');

        Toastify({ text: toastMessage, backgroundColor: "green" }).showToast();
        
        // Reload the page to apply RPC and blacklist settings
        setTimeout(() => window.location.reload(), 1500);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    //auth.restoreLoginState();
    auth.initAuth();
    settings.initSettings();
    blockchain.initBlockchain();

    await blacklist.initBlacklist();
    await beneficiaries.initBeneficiaries();

    updateAuthUI();
    setupConfigModal();
    
    loginForm.addEventListener('submit', handleLogin);

    // 🚨 NOVO LISTENER PARA O BOTÃO KEYCHAIN
    if (keychainLoginBtn) {
        keychainLoginBtn.addEventListener('click', handleKeychainLogin);
    }

    // Pega o usuário restaurado (agora não será null, se a sessão existe)
    const user = auth.getCurrentUser();
    
    // Se a sessão foi restaurada, atualiza a UI
    if (user) {
        updateAuthUI(user); // Sua função para atualizar o cabeçalho/botões
        startNotificationPoller(); // 🚨 INICIA O POLLER
    } else {
        stopNotificationPoller(); // 🚨 GARANTE QUE ESTEJA PARADO
    }

    document.body.addEventListener('click', e => {
        if (!e.target.closest('[data-bs-toggle="popover"]') && !e.target.closest('.popover')) {
            document.querySelectorAll('[data-bs-toggle="popover"]').forEach(popoverEl => {
                const popover = bootstrap.Popover.getInstance(popoverEl);
                if (popover) popover.hide();
            });
        }

        const anchor = e.target.closest('a');
        if (!anchor) return;

        if (anchor.hasAttribute('data-bs-toggle') && (anchor.getAttribute('data-bs-toggle') === 'modal' || anchor.getAttribute('data-bs-toggle') === 'dropdown')) {
            e.preventDefault();
            return;
        }

        if ((anchor.href.includes('?category=') || anchor.href.includes('?post=') || anchor.href.includes('?new_topic_in=') || anchor.href.includes('?edit=') || anchor.href.includes('?profile=') || anchor.href.includes('?notifications=') || anchor.pathname === '/')) {
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
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            console.log("Page restored from bfcache. Forcing route change.");
            handleRouteChange();
        }
    });


    translateStaticContent();
    handleRouteChange();
});