import * as auth from './auth.js';
import * as blockchain from './blockchain.js';
import * as blacklist from './blacklist.js';
import { processPostTree, escapeSelector } from './utils.js'; // Depende de utils.js

// Variáveis de estado global para o poller
let postViewPoller = null;
export let currentRenderVotes = null;

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
    
    // Armazena a primeira chamada. Será usado apenas uma vez.
    let currentData = initialData; 

    const renderVotes = async () => {
        const user = auth.getCurrentUser(); 
        
        // 1. Lógica para usar os dados iniciais na primeira chamada
        let data2;
        if (currentData) {
            data2 = currentData;
            // Zera a variável para que todas as chamadas futuras façam o fetch
            currentData = null; 
        } else {
            // Chamada API que será executada a cada 60s pelo setInterval
            data2 = await blockchain.getPostWithReplies(author, permlink);
        }
        // FIM DA NOVA LÓGICA DE DADOS
        
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
                //if (blacklist.isBlacklisted(reply.author, reply.permlink)) return; 

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

        // 3. Atualiza votos: Post Principal + Todas as Réplicas
        const contentToUpdate = [data2, ...allReplies];

        contentToUpdate.forEach(content => {
            if (!content || !content.permlink) return;

            const escapedPermlink = escapeSelector(content.permlink);

            const escapedAuthor = escapeSelector(content.author); // Necessário se houver caracteres especiais no nome do autor
            // Determina qual é o container correto (o principal tem um ID, as réplicas têm data-permlink)
            const selector = content === data2 
                ? '#main-post-vote-container' 
                : `.vote-section[data-author="${escapedAuthor}"][data-permlink="${escapedPermlink}"]`;
            
            const voteContainer = document.querySelector(selector);
            // SAIR SE NÃO ENCONTRAR O CONTAINER (O que está acontecendo)
            if (!voteContainer) return 'deu ruimmmmmmmmm';
            
            const userVoted = user && content.active_votes.some(v => v.voter === user);
            const votersList = content.active_votes.map(v => `@${v.voter}`).join('<br>');

            
            const payoutDisplay = content.title 
                ? `Pending Payout: ${content.pending_payout_value}` // Post Principal
                : `<small>Payout: ${content.pending_payout_value}</small>`; // Réplicas



            const newHtml = `
            ${user ? `<button class="btn btn-sm ${userVoted ? 'btn-success' : 'btn-outline-success'} me-2 vote-btn" data-author="${content.author}" data-permlink="${content.permlink}"><i class="fas fa-thumbs-up"></i> <span>${userVoted ? 'Unvote' : 'Upvote'}</span></button>` : ''}
                <button type="button" class="btn btn-link text-muted text-decoration-none p-0 vote-popover" data-bs-toggle="popover" data-bs-html="true" title="${content.active_votes.length} Voters" data-bs-content="${votersList || 'No votes yet.'}">
                    ${payoutDisplay}
                </button>`;
            voteContainer.innerHTML = newHtml;

            // 🚨 SUBSTITUA O BLOCO DE INICIALIZAÇÃO GLOBAL POR ESTE:
            // 1. Encontra o novo Popover APENAS no container atual
            const newPopoverElement = voteContainer.querySelector('[data-bs-toggle="popover"]');
            
            // 2. Inicializa-o (garantindo que o bootstrap esteja acessível)
            if (newPopoverElement && window.bootstrap && window.bootstrap.Popover) {
                new window.bootstrap.Popover(newPopoverElement);
            }

        });
        
        // 4. Reinicializa todos os popovers após a atualização do DOM
    };
    currentRenderVotes = renderVotes;
    renderVotes();
    postViewPoller = setInterval(renderVotes, 60000);
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