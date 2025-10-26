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

// Função auxiliar para criar um snippet de texto limpo
export function createSnippet(text, maxLength = 80) {
    if (!text) return '';
    
    // 1. Remove Markdown ou HTML simples (para garantir texto limpo)
    // Isso é uma simplificação, para remover tags como ** negrito **
    let cleanText = text.replace(/([_*~`>\[\]()-])/g, ''); // Remove caracteres markdown comuns
    cleanText = cleanText.replace(/\n/g, ' '); // Substitui quebras de linha por espaços

    // 2. Trunca o texto
    if (cleanText.length > maxLength) {
        return cleanText.substring(0, maxLength).trim() + '...';
    }
    return cleanText.trim();
}

/**
 * Extrai o autor e permlink do post raiz a partir da propriedade 'url' do post.
 * Ex: '/tag-categoria/@autor/permlink-root#fragment' -> ['autor', 'permlink-root']
 * @param {string} postUrl - O campo 'url' do objeto post.
 * @returns {{author: string, permlink: string}|null} Objeto com autor e permlink raiz.
 */
export function extractRootLinkFromUrl(postUrl) {
    if (!postUrl) return null;
    
    // 1. Remove o fragmento (#) do reply
    const urlWithoutFragment = postUrl.split('#')[0];
    
    // 2. Remove o prefixo de tag, categoria e barras iniciais
    // Ex: /fdsfdsf-off-topic/@bgo/permlink-root
    const tagPrefix = CONFIG.tag_prefix; // ex: fdsfdsf-
    
    // Expressão regular para encontrar '@autor/permlink' após a tag e categoria
    // Pega o que está após a última barra.
    const match = urlWithoutFragment.match(/@([a-zA-Z0-9-.]+)\/([^/]+)$/);

    if (match && match.length === 3) {
        return {
            author: match[1], // O primeiro grupo capturado (autor)
            permlink: match[2] // O segundo grupo capturado (permlink)
        };
    }
    
    // Retorna null ou tenta parsear o que sobrou como se fosse um post raiz
    // Ex: /@autor/permlink
    const simpleMatch = urlWithoutFragment.match(/@([a-zA-Z0-9-.]+)\/([^/]+)$/);
    if (simpleMatch && simpleMatch.length === 3) {
        return {
            author: simpleMatch[1],
            permlink: simpleMatch[2]
        };
    }

    return null;
}