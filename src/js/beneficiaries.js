let beneficiaries = [];
const BENEFICIARIES_URL = './beneficiaries.json';

/**
 * Fetches and loads the beneficiaries configuration from beneficiaries.json.
 */
export async function initBeneficiaries() {
    try {
        const response = await fetch(BENEFICIARIES_URL);
        if (response.ok) {
            const data = await response.json();
            // Ensure beneficiaries is an array and weights are numbers
            if (Array.isArray(data.beneficiaries)) {
                 beneficiaries = data.beneficiaries.map(b => ({
                    account: b.account,
                    weight: Number(b.weight)
                }));
                console.log('Beneficiaries loaded:', beneficiaries);
            }
        }
    } catch (error) {
        console.error('Could not load or parse beneficiaries.json:', error);
        beneficiaries = []; // Ensure it's an empty array on error
    }
}

/**
 * Constructs the 'comment_options' operation for setting beneficiaries.
 * @param {string} author The author of the post/comment.
 * @param {string} permlink The permlink of the post/comment.
 * @returns {Array|null} The operation array or null if no beneficiaries are set.
 */
export function getBeneficiaryOps(author, permlink) {
    if (!beneficiaries || beneficiaries.length === 0) {
        return null;
    }

    return ['comment_options', {
        author: author,
        permlink: permlink,
        max_accepted_payout: '1000000.000 BLURT',
        percent_blurt_dollars: 10000, // 100% SBD
        allow_votes: true,
        allow_curation_rewards: true,
        extensions: [
            [0, {
                beneficiaries: beneficiaries
            }]
        ]
    }];
}