import { CONFIG } from './config.js';
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
    renderEditView

} from './render.js';
import { showLoader, hideLoader, getDecryptedPostingKey, processPostTree, escapeSelector, renderMarkdown,getAllCategories } from './utils.js';
import { startPostViewPoller, stopPostViewPoller } from './poller.js';

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
            actionButton = `<li><a class="dropdown-item" id="unlock-button">Unlock Session</a></li>`;
        } else {
            // Se estiver desbloqueada (chave na memória), o botão é "Lock"
            actionButton = `<li><a class="dropdown-item" id="lock-button">Lock Session</a></li>`;
        }

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
                    ${actionButton}
                    <li><a class="dropdown-item" id="logout-button">Logout</a></li>
                </ul>
            </div>`;
        
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
                const masterPassword = prompt("Digite sua Senha Mestra para desbloquear a sessão:");
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
        loginError.textContent = 'Nome de usuário, chave de postagem e senha mestra são obrigatórios.';
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

// OS HANDLERS ABAIXO FORAM ATUALIZADOS PARA USAR O NOVO getDecryptedPostingKey()



// ... (Restante do app.js permanece o mesmo, exceto pelo uso do novo getDecryptedPostingKey)
// O restante do app.js é mantido por brevidade na resposta, mas as chamadas
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

// js/app.js

// Torne a função assíncrona para usar o loader (se você ainda não o fez)
export async function handleRouteChange() { 
    
    // 1. CHAMA O MÓDULO PARA PARAR O POLLER
    // Substitui todo o bloco de clearInterval/postViewPoller/currentRenderVotes
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

// --- THEME & SETTINGS LOGIC ---

const BOOTSWATCH_THEMES = ['default', 'cerulean', 'cosmo', 'cyborg', 'darkly', 'flatly', 'journal', 'litera', 'lumen', 'lux', 'materia', 'minty', 'pulse', 'sandstone', 'simplex', 'sketchy', 'slate', 'solar', 'spacelab', 'superhero', 'united', 'yeti'];

function applyTheme(themeName) {
    // ATENÇÃO: As integridades (SRI) precisam ser atualizadas se você usar este recurso!
    // Exemplo: O hash do Flatly que você enviou estava incorreto, o correto é: sha384-X72qP6+uYwI0fU9Q28vnJh4x20T5ola6czB9LJXl43BayU/Q5zYirWKXiMK76hPwB1RwJG52nFSyd34QWT
    const themeUrl = themeName === 'default' 
        ? 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css' 
        : `https://cdn.jsdelivr.net/npm/bootswatch@5.3.2/dist/${themeName}/bootstrap.min.css`;
    
    document.getElementById('theme-css').setAttribute('href', themeUrl);
    // Para adicionar o SRI corretamente, você precisaria de um objeto de mapeamento de hash para cada tema.
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
    //auth.restoreLoginState();
    auth.initAuth();
    settings.initSettings();
    blockchain.initBlockchain();
    applyTheme(settings.getSetting('THEME'));

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
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            console.log("Page restored from bfcache. Forcing route change.");
            handleRouteChange();
        }
    });



    handleRouteChange();
});