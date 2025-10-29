import * as auth from './auth.js';
import * as blockchain from './blockchain.js';
import * as blacklist from './blacklist.js';
import { processPostTree, escapeSelector } from './utils.js'; // Depende de utils.js
import { handleRouteChange, loadAndDisplayNotifCount } from './app.js';
import * as i18n from './i18n.js';

import { 
postViewState,
} from './render.js';

// Variáveis de estado global para o poller
let postViewPoller = null;
export let currentRenderVotes = () => {}; // Exporta para uso manual

// Garante que o appContainer seja definido (pode ser necessário passar como parâmetro ou importar de um UI/app.js)
const appContainer = document.getElementById('app'); 

/**
 * Inicia o poller para atualizar votos e payouts na visualização de post.
 * @param {string} author
 * @param {string} permlink
 * @param {object} initialData - O objeto post completo da chamada inicial.
 */
export function startPostViewPoller(author, permlink, initialData = null) {
    if (postViewPoller) clearInterval(postViewPoller);
    
    // Armazena a primeira chamada (vindo do cache ou fetch primário do renderPostView).
    let cachedData = initialData; 

    // 🚨 É crucial que postViewState seja acessível aqui.
    
    const renderVotes = async (forceFetch = false) => {
        const user = auth.getCurrentUser(); 
        
        let data2;
        if (!cachedData || forceFetch) {
            data2 = await blockchain.getPostWithReplies(author, permlink);
            cachedData = data2;
        } else {
            data2 = cachedData;
            cachedData = null; // Zera para forçar o fetch nas próximas iterações
        }
        
        if (!data2) return;

        // Inicializa o array para todas as réplicas e o mapa para todos os conteúdos
        const allReplies = [];
        const contentMap = { [`@${data2.author}/${data2.permlink}`]: data2 }; // Adiciona o post principal

        /**
         * Função recursiva para achatar a árvore de comentários.
         */
        function flattenAndMap(content) {
            if (!content.replies || content.replies.length === 0) return;

            content.replies.forEach(reply => {
                const key = `@${reply.author}/${reply.permlink}`;
                contentMap[key] = reply;
                allReplies.push(reply); 
                
                flattenAndMap(reply); 
            });
        }

        // Inicia a recursão a partir do post principal
        flattenAndMap(data2);

        // Ordena todas as réplicas por data de criação para exibição cronológica
        allReplies.sort((a, b) => new Date(a.created) - new Date(b.created));

        // 🚨 ATUALIZAÇÃO ESSENCIAL: SALVA OS DADOS FRESCOS NO ESTADO GLOBAL
        // Isso garante que a paginação (que usa o estado) tenha os votos mais frescos.
        if (typeof postViewState !== 'undefined') {
             postViewState.posts = data2;
             postViewState.allReplies = allReplies;
             postViewState.contentMap = contentMap;
        }
        
        // 3. Atualiza votos: Post Principal + Todas as Réplicas
        const contentToUpdate = [data2, ...allReplies];

        contentToUpdate.forEach(content => {
            if (!content || !content.permlink) return;

            const escapedPermlink = escapeSelector(content.permlink);
            const escapedAuthor = escapeSelector(content.author); 
            
            const selector = content === data2 
                ? '#main-post-vote-container' 
                : `.vote-section[data-author="${escapedAuthor}"][data-permlink="${escapedPermlink}"]`;
            
            const voteContainer = document.querySelector(selector);
            
            // 🚨 CORREÇÃO: Apenas retorna se o contêiner não for encontrado (sem a string de erro)
            if (!voteContainer) return; 
            
            const userVoted = user && content.active_votes.some(v => v.voter === user);
            const votersList = content.active_votes.map(v => `@${v.voter}`).join('<br>');

            
            const payoutDisplay = content.title 
                ? `${i18n.translate('Pending Payout')}: ${content.pending_payout_value}` 
                : `<small>${i18n.translate('Payout')}: ${content.pending_payout_value}</small>`; 


            const newHtml = `
            ${user ? `<button class="btn btn-sm ${userVoted ? 'btn-success' : 'btn-outline-success'} me-2 vote-btn" data-author="${content.author}" data-permlink="${content.permlink}"><i class="fas fa-thumbs-up"></i> <span> ${userVoted ? i18n.translate('Unvote') : i18n.translate('Upvote')}</span></button>` : ''}
                <button type="button" class="btn btn-link text-muted text-decoration-none p-0 vote-popover" data-bs-toggle="popover" data-bs-html="true" title="${content.active_votes.length} ${i18n.translate('Voters')}" data-bs-content="${votersList || i18n.translate("No votes yet")}">
                    ${payoutDisplay}
                </button>`;
            voteContainer.innerHTML = newHtml;

            // Inicialização do Popover
            const newPopoverElement = voteContainer.querySelector('[data-bs-toggle="popover"]');
            
            if (newPopoverElement && window.bootstrap && window.bootstrap.Popover) {
                new window.bootstrap.Popover(newPopoverElement);
            }
        });
        
    };
    currentRenderVotes = renderVotes;
    renderVotes(false);
    //postViewPoller = setInterval(renderVotes, 60000);
}

/**
 * Para o poller quando o usuário sai da visualização do post.
 */
export function stopPostViewPoller() {
    if (postViewPoller) {
        clearInterval(postViewPoller);
        postViewPoller = null;
    }
}

export function pollForEdit(author, permlink, originalLastUpdate) {
    let attempts = 0;
    const maxAttempts = 15, interval = 2000;
    const poller = setInterval(async () => {
        attempts++;
        const data = await blockchain.getPostAndDirectReplies(author, permlink);
        if (data && data.post && data.post.last_update !== originalLastUpdate) {
            clearInterval(poller);
            Toastify({ text: "Edit confirmed!", backgroundColor: "green" }).showToast();
            history.back();
        } else if (attempts >= maxAttempts) {
            clearInterval(poller);
            Toastify({ text: "Edit was submitted, but it's taking a long time to confirm.", duration: 5000, backgroundColor: "orange" }).showToast();
        }
    }, interval);
}


let notifPoller = null;
const NOTIF_POLL_INTERVAL = 30000; // 30 segundos

/**
 * Inicia o poller para atualizar o contador de notificações.
 */
export function startNotificationPoller() {
    if (notifPoller) clearInterval(notifPoller);

    const checkAndRenderNotifs = async () => {
        const user = auth.getCurrentUser();
        
        if (!user) {
            stopNotificationPoller();
            return;
        }

        // 🚨 CHAMA A FUNÇÃO QUE JÁ É ASYNC, MANTENDO A LÓGICA DEPOIS DO LOGIN SÍNCRONA
        loadAndDisplayNotifCount(user); 
    };

    // Chamada inicial e depois o intervalo
    checkAndRenderNotifs();
    notifPoller = setInterval(checkAndRenderNotifs, NOTIF_POLL_INTERVAL);
}

/**
 * Para o poller de notificações e limpa o badge.
 */
export function stopNotificationPoller() {
    if (notifPoller) {
        clearInterval(notifPoller);
        notifPoller = null;
    }
    // Também limpa o badge quando faz logout.
    loadAndDisplayNotifCount(null); 
}