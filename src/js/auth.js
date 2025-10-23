let currentUser = null;
let postingKey = null;

/**
 * Initializes the authentication state from storage.
 * It checks localStorage first, then sessionStorage.
 */
export function initAuth() {
    let savedUser = localStorage.getItem('blurt_user');
    let savedKey = localStorage.getItem('blurt_posting_key');

    if (!savedUser || !savedKey) {
        savedUser = sessionStorage.getItem('blurt_user');
        savedKey = sessionStorage.getItem('blurt_posting_key');
    }

    if (savedUser && savedKey) {
        currentUser = savedUser;
        postingKey = savedKey;
    }
}

/**
 * Attempts to log in a user with their username and posting key.
 * @param {string} username 
 * @param {string} key 
 * @param {boolean} keepLoggedIn - If true, saves to localStorage. Otherwise, uses sessionStorage.
 * @returns {Promise<boolean>}
 */
export async function login(username, key, keepLoggedIn) {
    try {
        const accounts = await new Promise((resolve, reject) => {
            blurt.api.getAccounts([username], (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
            });
        });

        if (!accounts || accounts.length === 0) {
            throw new Error("User not found.");
        }
        const account = accounts[0];

        const publicKey = blurt.auth.wifToPublic(key);
        const hasKey = account.posting.key_auths.some(auth => auth[0] === publicKey);

        if (!hasKey) {
            throw new Error("Invalid posting key.");
        }

        currentUser = username;
        postingKey = key;

        // Always save to session storage for the current session
        sessionStorage.setItem('blurt_user', username);
        sessionStorage.setItem('blurt_posting_key', key);

        // If user checked "keep me logged in", also save to local storage
        if (keepLoggedIn) {
            localStorage.setItem('blurt_user', username);
            localStorage.setItem('blurt_posting_key', key);
        }

        return true;
    } catch (error) {
        console.error("Login failed:", error);
        logout(); // Clear all credentials on failure
        throw error;
    }
}

/**
 * Logs the user out by clearing all storages.
 */
export function logout() {
    currentUser = null;
    postingKey = null;
    sessionStorage.removeItem('blurt_user');
    sessionStorage.removeItem('blurt_posting_key');
    localStorage.removeItem('blurt_user');
    localStorage.removeItem('blurt_posting_key');
}

/**
 * Gets the current logged-in user.
 * @returns {string|null}
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Gets the posting key of the logged-in user.
 * @returns {string|null}
 */
export function getPostingKey() {
    return postingKey;
}