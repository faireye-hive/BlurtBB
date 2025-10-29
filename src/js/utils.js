import * as auth from './auth.js';
import * as blacklist from './blacklist.js';
import {CONFIG} from './config.js'; 
import * as i18n from './i18n.js';

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
    const config = getCONFIG();

    return config.category_groups.flatMap(group => group.categories);
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

/**
 * Formata um timestamp ISO (UTC) para a data e hora local do usuário.
 * @param {string} isoTimestamp - O timestamp da blockchain (ex: "2025-10-26T23:05:09").
 * @returns {string} A data e hora formatada localmente (ex: "26/10/2025 20:05").
 */
export function formatLocalTime(isoTimestamp) {
    if (!isoTimestamp) return '';
    
    // Adiciona 'Z' para garantir que o timestamp seja tratado como UTC, 
    // prevenindo erros de fuso horário.
    const date = new Date(isoTimestamp + 'Z'); 

    return date.toLocaleString(
        'default', // Usa o formato de idioma padrão do navegador
        {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }
    );
}


// ... (No utils.js, adicione esta função) ...

/**
 * Formata o objeto de notificação JSON em uma string HTML legível.
 * @param {object} notif - O objeto de notificação da Blurt API.
 * @param {string} currentUser - O usuário logado.
 * @returns {string} Mensagem HTML formatada.
 */
// utils.js

// ...

export function renderNotificationMessage(notif, currentUser) {
    let data;
    let op;
    let notifType = 'geral'; // Valor padrão para a aba

    try {
        if (!notif.json_metadata || notif.json_metadata.trim() === '') {
            data = null; 
        } else {
            data = JSON.parse(notif.json_metadata);
        }
    } catch (e) {
        console.warn(`Metadados de notificação inválidos (JSON.parse falhou): ${notif.json_metadata}`, e);
        data = null;
    }

    if (data && Array.isArray(data) && data.length > 0) {
        op = data[0];
    } else {
        op = notif.type; 
    }
    
    // Links utilitários
    const profileLink = (author) => `<a href="?profile=@${author}">@${author}</a>`;
    const commentLink = (author, permlink) => `<a href="?post=@${author}/${permlink}">seu conteúdo</a>`;

    let message;

    switch (op) {
        case 'reply_comment':
            notifType = 'reply';
            // data[1] = [parent_author, parent_permlink, author, permlink]
            if (data && data[1] && data[1][0] === currentUser) {
                 message = `${profileLink(data[1][2])} respondeu em ${commentLink(data[1][0], data[1][1])}.`;
            } else {
                 message = `${profileLink(notif.msg.split(' ')[0].replace('@',''))} respondeu seu comentario. `;
            }
            break;
        
        case 'vote':
            notifType = 'vote';
            if (data && data[1]) {
                 message = `${profileLink(data[1][0])} votou em ${commentLink(data[1][1], data[1][2])}.`;
            } else {
                 message = `Você recebeu um voto.`;
            }
            break;

        case 'follow':
            notifType = 'follow';
            const follower = notif.msg ? notif.msg.split(' ')[0].replace('@','') : notif.author;
            message = `${profileLink(follower)} começou a seguir você.`;
            break;
            
        case 'mention':
            notifType = 'mention';
            if (data && data[1]) {
                message = `${profileLink(data[1][0])} mencionou você em ${commentLink(data[1][0], data[1][2])}.`;
            } else {
                message = `Você foi mencionado em um post.`;
            }
            break;

        case 'reblog': // Reblurted - assuming this is the operation type from bridge.account_notifications
            notifType = 'reblurted';
            const reblogAuthor = notif.msg ? notif.msg.split(' ')[0].replace('@','') : notif.author;
            message = `${profileLink(reblogAuthor)} reblurtou ${commentLink(notif.author, notif.permlink)}.`;
            break;
            
        default:
            notifType = 'geral';
            message = `Notificação: ${notif.msg || notif.type || 'Tipo desconhecido'}`;
            break;
            
    }

    // Retorna o tipo e a mensagem
    return { type: notifType, message: message };
}

export function getCONFIG() {
// 🚨 CORREÇÃO 1: Inicialize como um OBJETO
    const CONFIES = {}; 
    
    // Copia os campos brutos
    CONFIES.forum_title = i18n.translate(CONFIG.forum_title, CONFIG.forum_title); // Não traduzido
    CONFIES.DEFAULT_THEME = CONFIG.DEFAULT_THEME;
    CONFIES.main_tag = CONFIG.main_tag;
    CONFIES.tag_prefix = CONFIG.tag_prefix;
    CONFIES.admins = CONFIG.admins;
    CONFIES.moderators = CONFIG.moderators;
    
    // 🚨 CORREÇÃO 2: Inicializa category_groups como um array vazio para receber a nova estrutura
    CONFIES.category_groups = []; 

    
    // Itera sobre a estrutura original CONFIG para reconstruir e traduzir
    CONFIG.category_groups.forEach(group => {
        
        const translatedGroupTitle = i18n.translate(group.group_title, group.group_title);
        
        const translatedGroup = {
            // Cria um novo objeto de grupo (Object { group_title: "Boas Vindas", categories: [...] })
            group_title: translatedGroupTitle,
            categories: [] // Inicializa a lista de categorias para este grupo
        };

        group.categories.forEach(cat => {
            
            const translatedCat = {
                id: cat.id,
                count: cat.count,
                // A string literal é a CHAVE e o FALLBACK
                title: i18n.translate(cat.title, cat.title), 
                description: i18n.translate(cat.description, cat.description),
            };
            
            // Adiciona a categoria traduzida ao seu respectivo grupo
            translatedGroup.categories.push(translatedCat);
        });

        // Adiciona o grupo traduzido à lista principal de category_groups
        CONFIES.category_groups.push(translatedGroup);
    });
    return CONFIES;
}