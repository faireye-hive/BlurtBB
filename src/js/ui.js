// =========================================================================
// UI.JS: RESPONSÁVEL PELA LÓGICA DE INTERAÇÃO (Votos, Submissões, Exclusões)
// =========================================================================

// Importações cruciais para transações e estado:
import * as auth from './auth.js';
import * as blockchain from './blockchain.js';
// Importa o Poller para forçar a atualização após uma transação:
import { currentRenderVotes, pollForEdit,startPostViewPoller } from './poller.js'; 
// Importa utilitários necessários para submissão/erro:
import { getDecryptedPostingKey } from './utils.js'; 
import { 
    postViewState, 
    renderCurrentReplyPage, 
    renderReplyPagination,
    REPLIES_PER_PAGE
} from './render.js';

import { getEasyMDEInstance, setEasyMDEInstance, appContainer, handleRouteChange } from './app.js';

// Importa a instância do EasyMDE, que ainda está em app.js (AJUSTE TEMPORÁRIO NECESSÁRIO)
// Se o easyMDEInstance for definido no app.js, ele deve ser exportado de lá (OU movido)

// NOTA IMPORTANTE: Se easyMDEInstance estiver em app.js, 
// ele deve ser exportado de app.js para ser importado aqui.
// Para fins deste guia, assumiremos que ele foi movido para o topo do ui.js,
// ou que é passado como argumento.

// 🚨 NOVO: Função auxiliar para obter o objeto Keychain disponível
function getAvailableKeychain() {
    // Prioriza Hive para seus testes, mas retorna Blurt se existir
    if (window.hive_keychain) {
        return window.blurt_keychain;
    }
    if (window.blurt_keychain) {
        return window.blurt_keychain;
    }
    return window.blurt_keychain;
}

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
        Toastify({ text: "Please log in to vote.", duration: 3000 }).showToast(); 
        return;
    }

    const author = voteBtn.getAttribute('data-author');
    const permlink = voteBtn.getAttribute('data-permlink');
    const isUpvoted = voteBtn.classList.contains('btn-success');
    
    // Determina o peso do voto
    // O Keychain usa o peso em percentual (0 a 10000)
    const weight = isUpvoted ? 0 : 10000; 

    console.log('auth.isKeychainUseraaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    console.log(auth.isKeychainUser);

    try {
        if (auth.isKeychainUser()) {
            // ==========================================================
            // ⭐️ LÓGICA KEYCHAIN
            // ==========================================================
            const keychain = getAvailableKeychain();
            if (!keychain) {
                throw new Error("Keychain não está instalado.");
            }
            
            await new Promise((resolve, reject) => {
                // Usa requestVote com a chave 'Posting' (Padrão para votos)
                keychain.requestVote(
                    user, 
                    permlink, 
                    author, // Note a ordem: permlink e author são trocáveis no Blurt Keychain
                    weight, 
                    (response) => {
                        if (response.success) {
                            resolve(response);
                        } else {
                            // Erro pode ser cancelamento do usuário, etc.
                            reject(new Error(response.message || 'Voto Keychain falhou.'));
                        }
                    }
                );
            });
            
        } else {
            // ==========================================================
            // 🔑 LÓGICA CHAVE PRIVADA TRADICIONAL
            // ==========================================================
            const postingKey = await getDecryptedPostingKey();
            if (!postingKey) return; // Transação cancelada pelo usuário (ou sessão bloqueada)
            
            await blockchain.broadcastVote(user, postingKey, author, permlink, weight);
        }

        // --- Lógica de Sucesso (Comum a ambos os métodos) ---

        console.log('Sucesssoooooooooooooooooooooooooooooooooooooooo');
        
        // 🚨 CHAMA O POLLER PARA ATUALIZAR OS VOTOS
        setTimeout(() => {
            if (typeof currentRenderVotes === 'function') {
                console.log('Chamando currentRenderVotes após voto');
                currentRenderVotes(true);

            }else {
             // Caso o poller não esteja ativo, faz uma atualização rápida da UI
             voteBtn.classList.toggle('btn-success');
             voteBtn.classList.toggle('btn-outline-success');
             console.log('Falhoooooooooooooooooooooooooooooooooooooooo');
            }
        }, 5000); // 5 segundos

        Toastify({ text: isUpvoted ? "Unvoted successfully!" : "Voted successfully!", duration: 3000, newWindow: true, gravity: "bottom", position: "left", className: isUpvoted ? "bg-warning" : "bg-success"}).showToast();
        
    } catch (error) {
        // Lógica de Erro
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
    
    // ... (Validação de campos) ...

    e.target.querySelector('button[type="submit"]').disabled = true;
    errorDiv.classList.add('d-none');
    
    // Variáveis que serão preenchidas no try/catch
    let result;
    const author = auth.getCurrentUser();
    
    try {
        if (auth.isKeychainUser()) {
            // ==========================================================
            // ⭐️ LÓGICA KEYCHAIN
            // ==========================================================
            const keychain = getAvailableKeychain();
            if (!keychain) {
                throw new Error("Keychain não está instalado.");
            }

            // Prepara o array de operações para o Keychain
            const operations = blockchain.preparePostOperations(author, categoryId, title, body);
            const finalPermlink = operations[0][1].permlink; // Obtém o permlink gerado
            
            await new Promise((resolve, reject) => {
                // Usa requestBroadcast para enviar múltiplas operações
                keychain.requestBroadcast(
                    author, // O nome de usuário para assinatura
                    operations, // O array de operações
                    'Posting', // Chave de postagem
                    (response) => {
                        if (response.success) {
                            // Define o resultado para o tratamento pós-transação
                            result = { finalPermlink: finalPermlink };
                            resolve(response);
                        } else {
                            reject(new Error(response.message || 'Submissão Keychain falhou.'));
                        }
                    }
                );
            });
            
        } else {
            // ==========================================================
            // 🔑 LÓGICA CHAVE PRIVADA TRADICIONAL
            // ==========================================================
            const key = await getDecryptedPostingKey(); 
            if (!key) {
                e.target.querySelector('button[type="submit"]').disabled = false;
                return;
            }

            // Chama a função existente que usa blurt.broadcast.send
            result = await blockchain.broadcastPost(author, key, categoryId, title, body);
        }

        // --- Lógica de Sucesso (Comum a ambos os métodos) ---

        if (draftKey) {
            localStorage.removeItem(draftKey);
            localStorage.removeItem(`${draftKey}-title`);
        }

        appContainer.innerHTML = `<div class="text-center mt-5"><h4>Post submitted successfully!</h4><p>Waiting for it to be confirmed on the blockchain...</p><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
        
        // 🚨 O result.finalPermlink deve vir do broadcastPost ou ser definido acima
        pollForPost(author, result.finalPermlink); 
        
    } catch (error) {
        // Lógica de Erro
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
    
    const currentMDE = getEasyMDEInstance();
    const body = currentMDE ? currentMDE.value() : ''; 
    const errorDiv = document.getElementById('reply-error');

    if (!body.trim()) {
        errorDiv.textContent = "Reply content cannot be empty.";
        errorDiv.classList.remove('d-none');
        return;
    }

    e.target.querySelector('button[type="submit"]').disabled = true;
    errorDiv.classList.add('d-none');

    const author = auth.getCurrentUser();
    //let originalReplyCount;

    try {
        // 1. Conta as respostas originais (Para o poller)
        //const { replies } = await blockchain.getPostAndDirectReplies(parentAuthor, parentPermlink);
        //originalReplyCount = replies.length;
        
        if (auth.isKeychainUser()) {
            // ==========================================================
            // ⭐️ LÓGICA KEYCHAIN
            // ==========================================================
            const keychain = getAvailableKeychain();
            if (!keychain) {
                throw new Error("Keychain não está instalado.");
            }

            // Prepara as operações para o Keychain
            const operations = blockchain.prepareReplyOperations(author, parentAuthor, parentPermlink, body);
            
            await new Promise((resolve, reject) => {
                // Usa requestBroadcast para enviar o array de operações
                keychain.requestBroadcast(
                    author, // Usuário logado
                    operations, // Array de operações
                    'Posting', // Chave
                    (response) => {
                        if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.message || 'Resposta Keychain falhou.'));
                        }
                    }
                );
            });
            
        } else {
            // ==========================================================
            // 🔑 LÓGICA CHAVE PRIVADA TRADICIONAL
            // ==========================================================
            const key = await getDecryptedPostingKey();
            if (!key) {
                 e.target.querySelector('button[type="submit"]').disabled = false;
                return;
            }
            
            await blockchain.broadcastReply(author, key, parentAuthor, parentPermlink, body);
        }

        // --- Lógica de Sucesso (Comum a ambos os métodos) ---

        // 2. Limpeza do Editor e da Referência Global
        if (currentMDE) {
            currentMDE.toTextArea();
            setEasyMDEInstance(null);
        }

        e.target.closest('#reply-form').innerHTML = '<p class="text-success">Reply submitted! Waiting for blockchain confirmation...</p>';

        // 3. Poller (Não precisa de modificação aqui, pois é baseado em contagem)
        let attempts = 0;
        const maxAttempts = 2;
        let originalReplyCount = postViewState.allReplies.length;

        const poller = setInterval(async () => {
        attempts++;
        
        // A. Força o fetch de todos os replies e atualiza o postViewState global
        // Usamos o poller de votos que já faz o getPostWithReplies e atualiza o estado
        if (typeof currentRenderVotes === 'function') {
            // currentRenderVotes(true) faz o fetch e atualiza postViewState.allReplies
            await currentRenderVotes(true); 
        } else {
            // Se currentRenderVotes não estiver disponível, fazemos um fetch simples
            await blockchain.getPostWithReplies(parentAuthor, parentPermlink);
        }
        
        // Assumimos que a atualização do postViewState foi bem-sucedida pelo currentRenderVotes(true)
        const { allReplies } = postViewState;

        if (allReplies && allReplies.length > originalReplyCount) {
            clearInterval(poller);
        
        // 1. Calcula qual é a última página (onde o novo reply estará)
        // postViewState.allReplies agora contém o reply recém-postado
        const totalReplies = allReplies.length; 
        const lastPage = Math.ceil(totalReplies / REPLIES_PER_PAGE);

        // 2. Atualiza o estado da página atual
        postViewState.currentReplyPage = lastPage;
        
        // 3. Atualiza a URL para refletir a nova página (opcional, mas bom para histórico)
        const newUrl = `?post=@${postViewState.author}/${postViewState.permlink}&reply_page=${lastPage}`;
        history.pushState({}, '', newUrl);

        // 4. Re-renderiza a página e os botões de paginação
        // 🚨 Estas funções devem ser importadas do seu render.js
        if (typeof renderCurrentReplyPage === 'function' && typeof renderReplyPagination === 'function') {
            renderCurrentReplyPage(); // Renderiza a lista de replies na nova página
            renderReplyPagination();  // Atualiza os botões de paginação
            await currentRenderVotes(true); 
        }
        
        // 5. Opcional: Rola suavemente para a seção de replies
        document.getElementById('post-replies-container').scrollIntoView({ behavior: 'smooth' });
        
    } else if (attempts >= maxAttempts) {
        clearInterval(poller);
        Toastify({ text: "Reply submitted, but a temporary error prevents display. Please refresh.", duration: 8000, backgroundColor: "red" }).showToast();
    }
}, 7000); // Checa a cada 7 segundos

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.classList.remove('d-none');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
    

}

// -------------------------------------------------------------------
// 4. LÓGICA DE EDIÇÃO E EXCLUSÃO
// -------------------------------------------------------------------

export async function handleEditSubmit(e, originalPost, draftKey) {
    e.preventDefault();
    
    const currentMDE = getEasyMDEInstance();
    const titleInput = document.getElementById('edit-title');
    const errorDiv = document.getElementById('edit-error');

    let title = originalPost.title;
    let body = originalPost.body;

    // ... (Lógica para obter o title e body do editor, sem alteração necessária)
    if (currentMDE) { body = currentMDE.value(); } else { /* fallback */ }
    if (titleInput) { title = titleInput.value; }
    // ... (Validação) ...

    e.target.querySelector('button[type="submit"]').disabled = true;

    try {
        const originalLastUpdate = originalPost.last_update;

        if (auth.isKeychainUser()) {
            // ==========================================================
            // ⭐️ LÓGICA KEYCHAIN
            // ==========================================================
            const keychain = getAvailableKeychain();
            if (!keychain) {
                throw new Error("Keychain não está instalado.");
            }

            // Prepara as operações para a edição
            const operations = blockchain.prepareEditOperations(originalPost, title, body);
            
            await new Promise((resolve, reject) => {
                // Usa requestBroadcast para enviar o array de operações
                keychain.requestBroadcast(
                    originalPost.author, // Usuário logado
                    operations, // Array de operações
                    'Posting', // Chave
                    (response) => {
                        if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.message || 'Edição Keychain falhou.'));
                        }
                    }
                );
            });
            
        } else {
            // ==========================================================
            // 🔑 LÓGICA CHAVE PRIVADA TRADICIONAL
            // ==========================================================
            const key = await getDecryptedPostingKey();
            if (!key) {
                e.target.querySelector('button[type="submit"]').disabled = false;
                return;
            }
            
            // Chama a função existente que usa blurt.broadcast.send
            await blockchain.broadcastEdit(originalPost.author, key, originalPost, title, body);
        }

        // --- Lógica de Sucesso (Comum a ambos os métodos) ---

        if (currentMDE) {
             try { currentMDE.toTextArea(); } catch(err) { console.error("Error cleaning MDE:", err); }
             setEasyMDEInstance(null); // Limpa a referência global
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

    // 🚨 REMOVIDO: A obtenção de 'key' na linha 4 (const key = await getDecryptedPostingKey();)
    // Foi removida para não bloquear o fluxo do Keychain.

    // 1. Cria e mostra a instância do Modal (Fluxo inalterado)
    const deleteModalEl = document.getElementById('deleteConfirmModal');
    if (!deleteModalEl) {
        console.error("Delete confirmation modal not found in DOM.");
        Toastify({ text: "Erro: Modal de exclusão não encontrado.", backgroundColor: "red" }).showToast();
        return;
    }
    
    const deleteModal = new bootstrap.Modal(deleteModalEl);
    deleteModal.show();
    
    // 2. Anexa o listener de exclusão ao botão de confirmação do modal
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    // Clonar e substituir o botão para limpar listeners antigos
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async function deleteListener(clickEvent) {
        newConfirmBtn.removeEventListener('click', deleteListener); 
        newConfirmBtn.disabled = true;

        try {
            deleteModal.hide();
            
            // 🚨 3. LÓGICA CONDICIONAL DE TRANSAÇÃO
            if (auth.isKeychainUser()) {
                // ==========================================================
                // ⭐️ LÓGICA KEYCHAIN
                // ==========================================================
                const keychain = getAvailableKeychain();
                if (!keychain) {
                    throw new Error("Keychain não está instalado.");
                }

                const operations = blockchain.prepareDeleteOperations(author, permlink);
                
                await new Promise((resolve, reject) => {
                    keychain.requestBroadcast(
                        author, // Usuário logado
                        operations, 
                        'Posting', 
                        (response) => {
                            if (response.success) {
                                resolve(response);
                            } else {
                                reject(new Error(response.message || 'Exclusão Keychain falhou.'));
                            }
                        }
                    );
                });
                
            } else {
                // ==========================================================
                // 🔑 LÓGICA CHAVE PRIVADA TRADICIONAL
                // ==========================================================
                // Agora, a chave é obtida aqui, DENTRO do listener
                const key = await getDecryptedPostingKey();
                if (!key) {
                    throw new Error("Transação cancelada. Chave de postagem não fornecida.");
                }
                
                // Executa a Transação de Exclusão
                await blockchain.broadcastDelete(author, key, permlink); 
            }
            
            // 4. Atualiza o DOM e notifica (Comum a ambos)
            const elementToDelete = e.target.closest('.list-group-item, .card, .post-container'); 
            
            if (elementToDelete) {
                elementToDelete.innerHTML = '<p class="text-muted">[Este conteúdo foi excluído]</p>';
            } else {
                handleRouteChange(); 
            }
            
            Toastify({ text: "Conteúdo excluído com sucesso.", backgroundColor: "green" }).showToast();

        } catch (error) {
            deleteModal.hide();
            console.error("Delete failed:", error);
            Toastify({ text: `Falha ao excluir: ${error.message}`, backgroundColor: "red" }).showToast();
            newConfirmBtn.disabled = false; // Reabilitar em caso de falha
        }
    });
}