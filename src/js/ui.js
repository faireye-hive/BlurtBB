// =========================================================================
// UI.JS: RESPONSÁVEL PELA LÓGICA DE INTERAÇÃO (Votos, Submissões, Exclusões)
// =========================================================================

// Importações cruciais para transações e estado:
import * as auth from './auth.js';
import * as blockchain from './blockchain.js';
// Importa o Poller para forçar a atualização após uma transação:
import { currentRenderVotes, pollForEdit,startPostViewPoller } from './poller.js'; 
// Importa utilitários necessários para submissão/erro:
import { getDecryptedPostingKey, renderError } from './utils.js'; 

import { getEasyMDEInstance, setEasyMDEInstance, appContainer, handleRouteChange } from './app.js';

// Importa a instância do EasyMDE, que ainda está em app.js (AJUSTE TEMPORÁRIO NECESSÁRIO)
// Se o easyMDEInstance for definido no app.js, ele deve ser exportado de lá (OU movido)

// NOTA IMPORTANTE: Se easyMDEInstance estiver em app.js, 
// ele deve ser exportado de app.js para ser importado aqui.
// Para fins deste guia, assumiremos que ele foi movido para o topo do ui.js,
// ou que é passado como argumento.

// -------------------------------------------------------------------
// 1. LÓGICA DE VOTO
// -------------------------------------------------------------------

/**
 * Lida com o clique no botão de voto.
 */
export async function handleVoteClick(e) {
    e.preventDefault();
    const voteBtn = e.target.closest('.vote-btn');
    if (!voteBtn) return;
    
    const user = auth.getCurrentUser();
    if (!user) {
        // Assume que você tem uma forma de mostrar Toastify
        Toastify({ text: "Please log in to vote.", duration: 3000 }).showToast(); 
        return;
    }

    const author = voteBtn.getAttribute('data-author');
    const permlink = voteBtn.getAttribute('data-permlink');
    const isUpvoted = voteBtn.classList.contains('btn-success');
    
    // Determina o peso do voto
    const weight = isUpvoted ? 0 : 10000; // Desvotar ou Votar (100%)

    try {
        const postingKey = await getDecryptedPostingKey();
        if (!postingKey) return; // Transação cancelada pelo usuário
        
        await blockchain.broadcastVote(user, postingKey, author, permlink, weight);
        
        // 🚨 CHAMA O POLLER PARA ATUALIZAR OS VOTOS
        if (currentRenderVotes) {
            currentRenderVotes();
        } else {
             // Caso o poller não esteja ativo, faz uma atualização rápida da UI
             voteBtn.classList.toggle('btn-success');
             voteBtn.classList.toggle('btn-outline-success');
        }

        Toastify({ text: isUpvoted ? "Unvoted successfully!" : "Voted successfully!", duration: 3000, newWindow: true, gravity: "bottom", position: "left", className: isUpvoted ? "bg-warning" : "bg-success"}).showToast();
        
    } catch (error) {
        Toastify({ text: `Vote failed: ${error.message}`, duration: 5000, className: "bg-danger"}).showToast();
        console.error("Vote error:", error);
    }
}

// -------------------------------------------------------------------
// 2. LÓGICA DE SUBMISSÃO DE NOVO TÓPICO
// -------------------------------------------------------------------

/**
 * Lida com a submissão de um novo tópico.
 */
export async function handlePostSubmit(e, draftKey, easyMDEInstance) {
    e.preventDefault();
    const title = document.getElementById('topic-title').value;
    const body = easyMDEInstance.value();
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
        // ATUALIZADO: Usa a nova função para obter a chave (que pode pedir a senha mestra)
        const key = await getDecryptedPostingKey(); 
        if (!key) {
            e.target.querySelector('button[type="submit"]').disabled = false;
            return;
        }

        const result = await blockchain.broadcastPost(author, key, categoryId, title, body);

        if (draftKey) {
            localStorage.removeItem(draftKey);
            localStorage.removeItem(`${draftKey}-title`);
        }

        appContainer.innerHTML = `<div class="text-center mt-5"><h4>Post submitted successfully!</h4><p>Waiting for it to be confirmed on the blockchain...</p><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
        pollForPost(author, result.finalPermlink);
    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
}

// -------------------------------------------------------------------
// 3. LÓGICA DE SUBMISSÃO DE RESPOSTA
// -------------------------------------------------------------------

/**
 * Lida com a submissão de uma resposta/réplica.
 */

export async function handleReplySubmit(e, parentAuthor, parentPermlink) {
    e.preventDefault();
    
    // 1. Obtém a instância atual do EasyMDE (agora sem ser um argumento)
    const currentMDE = getEasyMDEInstance(); // ⬅️ CORREÇÃO: Usa o getter
    
    // Se o editor não estiver ativo (o que não deve acontecer no fluxo normal), não há corpo
    const body = currentMDE ? currentMDE.value() : ''; 
    
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
        
        // Usa a nova função para obter a chave
        const key = await getDecryptedPostingKey();
        if (!key) {
             e.target.querySelector('button[type="submit"]').disabled = false;
            return;
        }
        
        const { replies } = await blockchain.getPostAndDirectReplies(parentAuthor, parentPermlink);
        const originalReplyCount = replies.length;

        await blockchain.broadcastReply(author, key, parentAuthor, parentPermlink, body);

        // 2. Limpeza do Editor e da Referência Global
        if (currentMDE) { // Verifica a instância local obtida
            currentMDE.toTextArea(); // Desliga a UI do editor
            setEasyMDEInstance(null); // ⬅️ CORREÇÃO: Limpa a referência global usando o setter
        }

        e.target.closest('#reply-form').innerHTML = '<p class="text-success">Reply submitted! Waiting for confirmation...</p>';

        let attempts = 0;
        const maxAttempts = 15;
        const poller = setInterval(async () => {
            attempts++;
            const data = await blockchain.getPostAndDirectReplies(parentAuthor, parentPermlink);
            if (data && data.replies.length > originalReplyCount) {
                clearInterval(poller);
                // Assume que handleRouteChange irá renderizar novamente a visualização do post
                handleRouteChange(); 
            } else if (attempts >= maxAttempts) {
                clearInterval(poller);
                Toastify({ text: "Reply was submitted, but it's taking a long time to appear.", duration: 5000, backgroundColor: "orange" }).showToast();
            }
        }, 2000);

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
    
    // 🚨 Este trecho deve ser verificado se está no lugar certo ou se deve estar no poller.
    if (currentRenderVotes) currentRenderVotes(); 
}

// -------------------------------------------------------------------
// 4. LÓGICA DE EDIÇÃO E EXCLUSÃO
// -------------------------------------------------------------------

export async function handleEditSubmit(e, originalPost, draftKey) {
    e.preventDefault();
    
    // 1. Obtém a instância atual do EasyMDE
    const currentMDE = getEasyMDEInstance(); // ⬅️ CORREÇÃO
    
    // Variáveis DOM
    const titleInput = document.getElementById('edit-title');
    const errorDiv = document.getElementById('edit-error');

    // Inicializa com valores padrão do post
    let title = originalPost.title;
    let body = originalPost.body;

    // 2. Obtém o conteúdo do editor, se estiver ativo
    if (currentMDE) {
        body = currentMDE.value(); // ✅ Usa a instância obtida pelo getter
    } else {
        // Fallback: Se o MDE não estiver ativo (embora não deva acontecer aqui), 
        // tenta pegar o valor da textarea bruta.
        const bodyEl = document.getElementById('edit-body');
        if (bodyEl) body = bodyEl.value;
    }
    
    // Obtém o título (se for um tópico)
    if (titleInput) {
        title = titleInput.value;
    }

    // 3. Validação
    if (!body.trim() || (originalPost.title && !title.trim())) {
        errorDiv.textContent = "Title and content cannot be empty.";
        errorDiv.classList.remove('d-none');
        return;
    }

    e.target.querySelector('button[type="submit"]').disabled = true;

    try {
        // ATUALIZADO: Usa a nova função para obter a chave
        const key = await getDecryptedPostingKey();
        if (!key) {
            e.target.querySelector('button[type="submit"]').disabled = false;
            return;
        }
        
        const originalLastUpdate = originalPost.last_update;

        // 4. Broadcast e Limpeza do Editor
        await blockchain.broadcastEdit(originalPost.author, key, originalPost, title, body);

        if (currentMDE) {
             try { currentMDE.toTextArea(); } catch(err) { console.error("Error cleaning MDE:", err); }
             setEasyMDEInstance(null); // ⬅️ CORREÇÃO: Limpa a referência global
        }
        
        // Limpeza de rascunhos
        if (draftKey) {
            localStorage.removeItem(draftKey);
            localStorage.removeItem(`${draftKey}-title`);
        }

        appContainer.innerHTML = `<div class="text-center mt-5"><h4>Changes submitted!</h4><p>Waiting for confirmation...</p><div class="spinner-border"></div></div>`;
        pollForEdit(originalPost.author, originalPost.permlink, originalLastUpdate);

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
}

// Local: js/modules/ui.js (dentro de handleDeleteClick)

// Local: js/modules/ui.js

// Local: js/modules/ui.js

// 🚨 Lembre-se de que o Bootstrap deve estar carregado globalmente ou importado (se você estiver usando módulos JS para o Bootstrap).

export async function handleDeleteClick(e, author, permlink) {
    e.preventDefault();

    // 1. Obtém a chave ANTES de mostrar o modal
    const key = await getDecryptedPostingKey();
    if (!key) {
        return; // Retorna se a chave não puder ser obtida (sessão bloqueada)
    }

    // 2. Cria e mostra a instância do Modal
    const deleteModalEl = document.getElementById('deleteConfirmModal');
    if (!deleteModalEl) {
        console.error("Delete confirmation modal not found in DOM.");
        Toastify({ text: "Erro: Modal de exclusão não encontrado.", backgroundColor: "red" }).showToast();
        return;
    }
    
    const deleteModal = new bootstrap.Modal(deleteModalEl);
    deleteModal.show();
    
    // 3. Anexa o listener de exclusão ao botão de confirmação do modal
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    // IMPORTANTE: Clonar e substituir o botão para remover listeners antigos e evitar exclusões duplicadas
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async function deleteListener(clickEvent) {
        // 🚨 Remover o listener imediatamente após a execução para evitar chamadas duplicadas
        newConfirmBtn.removeEventListener('click', deleteListener); 
        
        // Desabilitar o botão enquanto a transação está em andamento
        newConfirmBtn.disabled = true;

        try {
            // Esconde o modal antes de mostrar o resultado final
            deleteModal.hide();
            
            // 4. Executa a Transação de Exclusão
            await blockchain.broadcastDelete(author, key, permlink); 
            
            // 5. Atualiza o DOM e notifica
            const elementToDelete = e.target.closest('.list-group-item, .card, .post-container'); 
            
            if (elementToDelete) {
                elementToDelete.innerHTML = '<p class="text-muted">[Este conteúdo foi excluído]</p>';
            } else {
                // Se o post principal for excluído, redireciona
                // 🚨 Certifique-se de que 'handleRouteChange' está importado de './app.js'
                handleRouteChange(); 
            }
            
            Toastify({ text: "Conteúdo excluído com sucesso.", backgroundColor: "green" }).showToast();

        } catch (error) {
            deleteModal.hide();
            console.error("Delete failed:", error);
            Toastify({ text: `Falha ao excluir: ${error.message}`, backgroundColor: "red" }).showToast();
            newConfirmBtn.disabled = false; // Reabilitar em caso de falha, se o modal ainda estivesse visível
        }
    });

    // 🚨 A lógica termina aqui. A função aguarda o clique no botão do modal.
}