// =========================================================================
// UI.JS: RESPONSÁVEL PELA LÓGICA DE INTERAÇÃO (Votos, Submissões, Exclusões)
// =========================================================================

// Importações cruciais para transações e estado:
import * as auth from './auth.js';
import * as blockchain from './blockchain.js';
// Importa o Poller para forçar a atualização após uma transação:
import { currentRenderVotes } from './poller.js'; 
// Importa utilitários necessários para submissão/erro:
import { getDecryptedPostingKey, renderError } from './utils.js'; 

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

export async function handleReplySubmit(e, parentAuthor, parentPermlink, easyMDEInstance) {
    e.preventDefault();
    const body = easyMDEInstance.value();
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
        // ATUALIZADO: Usa a nova função para obter a chave
        const key = await getDecryptedPostingKey();
        if (!key) {
             e.target.querySelector('button[type="submit"]').disabled = false;
            return;
        }
        
        const { replies } = await blockchain.getPostAndDirectReplies(parentAuthor, parentPermlink);
        const originalReplyCount = replies.length;

        await blockchain.broadcastReply(author, key, parentAuthor, parentPermlink, body);

        if (easyMDEInstance) {
            easyMDEInstance.toTextArea();
            easyMDEInstance = null;
        }

        e.target.closest('#reply-form').innerHTML = '<p class="text-success">Reply submitted! Waiting for confirmation...</p>';

        let attempts = 0;
        const maxAttempts = 15;
        const poller = setInterval(async () => {
            attempts++;
            const data = await blockchain.getPostAndDirectReplies(parentAuthor, parentPermlink);
            if (data && data.replies.length > originalReplyCount) {
                clearInterval(poller);
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
    // 🚨 NO FINAL, O poller deve ser chamado para atualizar o post na tela:
    if (currentRenderVotes) currentRenderVotes();
}

// -------------------------------------------------------------------
// 4. LÓGICA DE EDIÇÃO E EXCLUSÃO
// -------------------------------------------------------------------

export async function handleEditSubmit(e, originalPost, draftKey) {
    e.preventDefault();
    const titleInput = document.getElementById('edit-title');
    const title = titleInput ? titleInput.value : originalPost.title;
    const body = easyMDEInstance.value();
    const errorDiv = document.getElementById('edit-error');

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

        await blockchain.broadcastEdit(originalPost.author, key, originalPost, title, body);

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

export async function handleDeleteClick(e, author, permlink) {
    e.preventDefault();
    
    // ATUALIZADO: Usa a nova função para obter a chave
    const key = await getDecryptedPostingKey();
    if (!key) {
        return;
    }
    
    Toastify({
        text: "Are you sure you want to delete this? This action cannot be undone.",
        duration: 10000, close: true, gravity: "top", position: "center",
        backgroundColor: "linear-gradient(to right, #ff6e40, #ffc107)",
        stopOnFocus: true,
        onClick: async function() {
            try {
                // A chave já foi obtida e descriptografada
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