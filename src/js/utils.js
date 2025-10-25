import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import {CONFIG} from './config.js'; 

// Mova getDecryptedPostingKey() para cá, exportando-a


// Mova processPostTree() para cá, exportando-a
export function processPostTree(rootPost) {
    const allReplies = [];
    // Inicializa o mapa com o post raiz
    const contentMap = { [`@${rootPost.author}/${rootPost.permlink}`]: rootPost }; 
    
    function flattenAndMap(replies) {
        if (!replies) return;
        replies.forEach(reply => {
            // Usa a lógica de blacklist que estava no original
            if (blacklist.isBlacklisted(reply.author, reply.permlink)) return; 
            
            allReplies.push(reply);
            contentMap[`@${reply.author}/${reply.permlink}`] = reply;
            flattenAndMap(reply.replies);
        });
    }

    // Começa a recursão a partir das réplicas diretas do post raiz
    flattenAndMap(rootPost.replies); 

    // O sort pode ser feito aqui ou no arquivo render.js (mantive aqui)
    allReplies.sort((a, b) => new Date(a.created) - new Date(b.created));

    return { allReplies, contentMap };
}

// Mova escapeSelector() para cá, exportando-a
export function escapeSelector(s) {
    if (typeof s !== 'string') return '';
    // Escapa todos os caracteres que têm significado especial em seletores CSS.
    // Usamos '\\' para escapar a barra invertida, resultando em '\\' no seletor.
    return s.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

// Mova showLoader/hideLoader para cá, exportando-as
const loaderOverlay = document.getElementById('loader-overlay');

export function showLoader() { 
    if (loaderOverlay) loaderOverlay.classList.remove('d-none'); 
}

export function hideLoader() { 
    if (loaderOverlay) loaderOverlay.classList.add('d-none'); 
}

export async function getDecryptedPostingKey() {
    let key = auth.getPostingKey();
    
    // Se a chave não estiver na memória, a sessão está bloqueada
    if (!key && auth.isSessionLocked()) {
        const masterPassword = prompt("Sessão bloqueada. Digite sua Senha Mestra para continuar a transação:");
        if (!masterPassword) {
            Toastify({ text: "Transação cancelada. Senha Mestra não fornecida.", duration: 3000, backgroundColor: "red" }).showToast();
            return null;
        }
        try {
            auth.unlockSession(masterPassword);
            key = auth.getPostingKey(); // Tenta obter a chave novamente
            Toastify({ text: "Sessão desbloqueada temporariamente para a transação.", duration: 2000, backgroundColor: "green" }).showToast();
        } catch (error) {
            Toastify({ text: `Erro de Desbloqueio: ${error.message}`, duration: 5000, backgroundColor: "red" }).showToast();
            return null;
        }
    } else if (!key) {
        // Usuário não logado
        Toastify({ text: "Você deve estar logado para realizar esta ação.", duration: 3000, backgroundColor: "orange" }).showToast();
        return null;
    }
    
    return key;
}

export function getRoleBadge(username) {
    if (CONFIG.admins.includes(username)) return `<span class="badge bg-danger ms-2">Admin</span>`;
    if (CONFIG.moderators.includes(username)) return `<span class="badge bg-success ms-2">Moderator</span>`;
    return '';
}

export async function renderReplyForm(parentAuthor, parentPermlink, container) {
    if (easyMDEInstance) {
        try { easyMDEInstance.toTextArea(); } catch(e) {}
        easyMDEInstance = null;
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
        easyMDEInstance = new EasyMDE({
            element: document.getElementById('reply-body'),
            spellChecker: false,
            placeholder: "Enter your reply...",
        });
        document.getElementById('reply-form').addEventListener('submit', (e) => handleReplySubmit(e, parentAuthor, parentPermlink));
        document.getElementById('cancel-reply').addEventListener('click', () => {
            if (easyMDEInstance) {
                try { easyMDEInstance.toTextArea(); } catch(e) {}
                easyMDEInstance = null;
            }
            container.innerHTML = '';
        });
        easyMDEInstance.codemirror.focus();
    } else {
        console.error(`Could not find container for reply form to ${parentPermlink}`);
    }
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

export function renderMarkdown(text) {
    if (!text) return '';
    
    // 1. CONVERSÃO: Usa EasyMDE (ou a lógica de markdown) para converter para HTML.
    const tempTextArea = document.createElement('textarea');
    tempTextArea.style.display = 'none';
    document.body.appendChild(tempTextArea);

    const tempMDE = new EasyMDE({ element: tempTextArea, autoDownloadFontAwesome: false });
    const rawHtml = tempMDE.markdown(text); // Agora é o HTML BRUTO

    // Clean up EasyMDE instance
    tempMDE.toTextArea();
    document.body.removeChild(tempTextArea);

    // 2. 🚨 SANITIZAÇÃO (O PASSO CRÍTICO)
    // Se você usa DOMPurify via CDN, ele está em window.DOMPurify
    if (typeof window.DOMPurify === 'undefined') {
        console.error("DOMPurify not loaded! Skipping sanitization.");
        return rawHtml; // Risco de XSS!
    }

    // Sanitiza o HTML. DOMPurify remove todas as tags e atributos perigosos.
    const cleanHtml = window.DOMPurify.sanitize(rawHtml);
    
    return cleanHtml; // Retorna apenas o HTML limpo e seguro.
}

export function getAllCategories() {
    return CONFIG.category_groups.flatMap(group => group.categories);
}