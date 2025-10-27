// ATENÇÃO: É NECESSÁRIO QUE O CRYPTOJS ESTEJA CARREGADO NO HTML (via CDN)
// Antes: let currentUser = null;
// Antes: let postingKey = null;

let currentUser = null;
// postingKey agora armazena a chave descriptografada, mas será null quando a sessão estiver bloqueada (lock)
let postingKey = null; 

// A chave criptografada será armazenada no localStorage
let encryptedKey = null; 

const ENCRYPTED_KEY_STORAGE_ID = 'blurt_posting_key_enc';
const USERNAME_STORAGE_ID = 'blurt_user';

const KEYCHAIN_AUTH_MARKER = 'KEYCHAIN_AUTH_MARKER_FOR_POSTING_KEY';



// --- Funções de Criptografia ---

/**
 * Criptografa a chave de postagem usando a senha mestra.
 * @param {string} key - A chave de postagem em texto simples.
 * @param {string} masterPassword - A senha mestra do usuário.
 * @returns {string} O texto cifrado.
 */
function encryptKey(key, masterPassword) {
    // CryptoJS deve estar disponível globalmente através do CDN no index.html
    return CryptoJS.AES.encrypt(key, masterPassword).toString();
}

/**
 * Descriptografa a chave de postagem usando a senha mestra.
 * @param {string} encryptedText - A chave de postagem criptografada.
 * @param {string} masterPassword - A senha mestra do usuário.
 * @returns {string|null} A chave de postagem descriptografada ou null em caso de falha.
 */
function decryptKey(encryptedText, masterPassword) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedText, masterPassword);
        const decryptedKey = bytes.toString(CryptoJS.enc.Utf8);
        
        // Verifica se a descriptografia foi bem-sucedida e se o resultado não está vazio
        if (decryptedKey) {
            return decryptedKey;
        }
        return null;
    } catch (e) {
        console.error("Decryption failed:", e);
        return null;
    }
}

// --- Funções de Autenticação e Sessão ---

/**
 * Inicializa o estado de autenticação a partir do armazenamento.
 * Tenta carregar a chave criptografada e o usuário.
 */
export function initAuth() {
    currentUser = localStorage.getItem(USERNAME_STORAGE_ID) || sessionStorage.getItem(USERNAME_STORAGE_ID);
    encryptedKey = localStorage.getItem(ENCRYPTED_KEY_STORAGE_ID) || sessionStorage.getItem(ENCRYPTED_KEY_STORAGE_ID);
    
    // 🚨 CORREÇÃO: Restaura o estado da chave/Keychain para a memória
    if (currentUser && encryptedKey) {
        if (encryptedKey === 'blurt_posting_key_enc') {
            // Se o valor salvo for o marcador, RESTAURAMOS o estado de Keychain.
            currentUser = currentUser.toLowerCase();
            postingKey = KEYCHAIN_AUTH_MARKER;
        }
        } else if (encryptedKey) {
            // Sessão Chave Mestra: A chave criptografada é restaurada, mas a sessão está 'bloqueada'
            encryptedKey = encryptedKey;
            postingKey = null; 
        } 
}

/**
 * Tenta logar um usuário, criptografar e salvar a chave.
 * @param {string} username 
 * @param {string} key - Chave de postagem em texto simples.
 * @param {string} masterPassword - Senha mestra do usuário para criptografia.
 * @param {boolean} keepLoggedIn - Se true, salva no localStorage. Caso contrário, usa sessionStorage.
 * @returns {Promise<boolean>}
 */
export async function login(username, key, masterPassword, keepLoggedIn) {
    if (!masterPassword) {
        throw new Error("A Senha PIN é necessária para criptografar a chave.");
    }

    try {
        // 1. VERIFICAÇÃO DA CHAVE NA BLOCKCHAIN (Igual ao original)
        const accounts = await new Promise((resolve, reject) => {
            blurt.api.getAccounts([username], (err, result) => {
                if (err) { return reject(err); }
                resolve(result);
            });
        });

        if (!accounts || accounts.length === 0) {
            throw new Error("Usuário não encontrado.");
        }
        const account = accounts[0];
        const publicKey = blurt.auth.wifToPublic(key);
        const hasKey = account.posting.key_auths.some(auth => auth[0] === publicKey);

        if (!hasKey) {
            throw new Error("Chave de postagem inválida.");
        }

        // 2. CRIPTOGRAFA A CHAVE E ARMAZENA
        const encrypted = encryptKey(key, masterPassword);

        currentUser = username;
        encryptedKey = encrypted;
        // A chave descriptografada é mantida na memória apenas APÓS o login (sessão desbloqueada)
        postingKey = key; 

        // 3. ARMAZENA O USUÁRIO E A CHAVE CRIPTOGRAFADA
        const storage = keepLoggedIn ? localStorage : sessionStorage;
        
        // Limpa o outro armazenamento para evitar conflitos (ex: move de session para local)
        const otherStorage = keepLoggedIn ? sessionStorage : localStorage;
        otherStorage.removeItem(USERNAME_STORAGE_ID);
        otherStorage.removeItem(ENCRYPTED_KEY_STORAGE_ID);
        
        storage.setItem(USERNAME_STORAGE_ID, username);
        storage.setItem(ENCRYPTED_KEY_STORAGE_ID, encrypted);

        return true;
    } catch (error) {
        console.error("Login failed:", error);
        logout(); // Limpa as credenciais em caso de falha
        throw error;
    }
}

/**
 * Bloqueia a sessão limpando a chave descriptografada da memória.
 * O usuário permanece "logado" (o nome de usuário e a chave criptografada continuam no armazenamento).
 */
export function lockSession() {
    postingKey = null;
    Toastify({ text: "Sessão bloqueada. A Senha PIN será necessária para a próxima transação.", duration: 3000, backgroundColor: "orange" }).showToast();
}

/**
 * Desbloqueia a sessão descriptografando a chave na memória.
 * @param {string} masterPassword - A senha mestra do usuário.
 * @returns {boolean} True se o desbloqueio for bem-sucedido.
 */
export function unlockSession(masterPassword) {
    if (!encryptedKey || !currentUser) {
        throw new Error("Nenhuma chave criptografada para desbloquear. Faça o login primeiro.");
    }
    if (!masterPassword) {
        return false;
    }

    const decryptedKey = decryptKey(encryptedKey, masterPassword);

    if (decryptedKey) {
        postingKey = decryptedKey;
        return true;
    } else {
        throw new Error("Senha Mestra incorreta. A descriptografia falhou.");
    }
}

/**
 * Faz o logout do usuário, limpando todos os dados de armazenamento e memória.
 */
export function logout() {
    currentUser = null;
    postingKey = null;
    encryptedKey = null;
    sessionStorage.removeItem(USERNAME_STORAGE_ID);
    sessionStorage.removeItem(ENCRYPTED_KEY_STORAGE_ID);
    localStorage.removeItem(USERNAME_STORAGE_ID);
    localStorage.removeItem(ENCRYPTED_KEY_STORAGE_ID);
}

/**
 * Obtém o usuário logado.
 * @returns {string|null}
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Obtém a chave de postagem descriptografada da memória.
 * Retorna null se a sessão estiver bloqueada.
 * @returns {string|null}
 */
export function getPostingKey() {
    return postingKey;
}

/**
 * Verifica se o usuário está logado, mas a chave não está na memória (sessão bloqueada).
 * @returns {boolean}
 */
export function isSessionLocked() {
    return currentUser && encryptedKey && !postingKey;
}

function getAvailableKeychain() {
    if (window.hive_keychain) {
        return window.hive_keychain;
    }
    if (window.blurt_keychain) {
        return window.blurt_keychain;
    }
    return null;
}

/**
 * Tenta fazer login usando o Hive/Blurt Keychain via requestSignBuffer.
 * @returns {Promise<string>} O nome de usuário logado.
 * @throws {Error} Se o Keychain não estiver instalado ou o login falhar.
 */
export async function loginWithKeychain(username) {
  const keychain = window.blurt_keychain;

  if (!keychain) {
    return Promise.reject(new Error("Hive/Blurt Keychain não está instalado."));
  }
  if (!username) {
    return Promise.reject(new Error("Nome de usuário não fornecido."));
  }

  const loginChallenge = `blurtbb_login_${Date.now()}`;

  return new Promise((resolve, reject) => {
    keychain.requestSignBuffer(username, loginChallenge, 'Posting', (response) => {
      console.log("Keychain login response:", response);

      if (response.success) {
        // Alguns retornam username direto, outros não
        const authenticatedUsername = (response.username || username).toLowerCase();

        // Verificação extra de segurança
        if (authenticatedUsername !== username.toLowerCase()) {
          return reject(new Error(
            `Usuário autenticado (${authenticatedUsername}) não corresponde ao digitado (${username}).`
          ));
        }

        // Atualiza estado (certifique-se de declarar essas variáveis antes)
        currentUser = authenticatedUsername;
        postingKey = KEYCHAIN_AUTH_MARKER;
        encryptedKey = null;

        localStorage.removeItem(ENCRYPTED_KEY_STORAGE_ID);
        sessionStorage.removeItem(ENCRYPTED_KEY_STORAGE_ID);
        localStorage.setItem(USERNAME_STORAGE_ID, authenticatedUsername);
        localStorage.setItem(ENCRYPTED_KEY_STORAGE_ID, ENCRYPTED_KEY_STORAGE_ID);
        
        // Resolve com sucesso
        resolve(authenticatedUsername);

      } else {
        // Quando o usuário cancela, ou outra falha real
        reject(new Error(`Login Keychain falhou: ${response.message || 'Cancelado ou erro desconhecido.'}`));
      }
    });
  });
}
// 🚨 NOVA FUNÇÃO DE UTILIDADE (Crucial para o resto do app)
/**
 * Verifica se o usuário está logado, mas a chave de postagem está sendo gerenciada pelo Keychain.
 * @returns {boolean}
 */
export function isKeychainUser() {
    return postingKey === KEYCHAIN_AUTH_MARKER;
}