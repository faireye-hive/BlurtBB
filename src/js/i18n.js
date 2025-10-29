// src/js/i18n.js

// 1. Defina o ID de armazenamento local
const LANGUAGE_STORAGE_KEY = 'blurtbb_lang';

// 2. Tabela de Traduções (o core do i18n)
// Mantenha as chaves de tradução em camelCase ou snake_case.
const translations = {
    'pt-BR': {
        'forumTitle': 'Fórum BlurtBB',
        'skipToContent': 'Pular para o conteúdo',
        'login': 'Login',
        'loginWithBlurt': 'Login com Blurt',
        'blurtUsername': 'Nome de Usuário Blurt',
        'privatePostingKey': 'Chave de Postagem Privada',
        'keychainLogin': 'Login com Blurt Keychain',
        'newPost': 'Novo Tópico...',
        'myProfile': 'Meu Perfil',
        'notifications': 'Notificações',
        'configuration': 'Configuração',
        'wallet': 'Carteira',
        'logout': 'Sair',
        'confirmDelete': 'Confirmar Exclusão',
        'deleteConfirmationBody': 'Você tem certeza que deseja **deletar** este conteúdo? Esta ação é irreversível.',
        'cancel': 'Cancelar',
        'delete': 'Deletar',
        'save': 'Salvar',
        'language': 'Idioma', // Nova chave
        'portuguese': 'Português', // Nova chave
        'english': 'Inglês', // Nova chave
        'settingsSaved': 'Configurações salvas',
        'reloading': 'Recarregando...', // Manter esta, mas será usada na mensagem unificada
        'reloadingToApplyChanges': 'Recarregando para aplicar todas as mudanças.',
        'lockSession': 'Bloquear Sessão',
        'unlockSession': 'Desbloquear Sessão',
        // Traduções para categorias e descrições
        'announcements':'Anúncios',
        'Welcome': 'Boas Vindas',
        'Announcements': 'Anúncios',
        'Official news and updates from the team.': 'Notícias e atualizações oficiais da equipe.',
        'Introductions': 'Apresentações',
        'Say hello and introduce yourself to the community.': 'Diga olá e apresente-se à comunidade.',
        'Help & Support': 'Ajuda e Suporte',
        'Get help with using the forum or Blurt.': 'Obtenha ajuda com o uso do fórum ou Blurt.',
        'Blurt Ecosystem': 'Ecossistema Blurt',
        'General Discussion': 'Discussão Geral',
        'General chat about the Blurt blockchain.': 'Bate-papo geral sobre a blockchain Blurt.',
        'Development & DApps': 'Desenvolvimento e DApps',
        'Discuss technical details, development, and applications on Blurt.': 'Discuta detalhes técnicos, desenvolvimento e aplicações no Blurt.',
        'Trading & Markets': 'Negociação e Mercados',
        'Price, markets, and speculation.': 'Preço, mercados e especulação.',
        'Community': 'Comunidade',
        'Witnesses': 'Witnesses',
        'Discussions about Blurt witnesses.': 'Discussões sobre os witnesses do Blurt.',
        'Off-Topic': 'Off-Topic',
        'For everything else.': 'Para todo o resto.',
        'BlurtBB': 'Fórum BlurtBB', // Para o título do fórum, caso seja referenciado diretamente
        // fim das traduções de categorias
        'Last reply': 'Última resposta',
        'By': 'Por',
        'Replies': 'Respostas',
        'Pending Payout': 'Pagamento Pendente',
        'Payout': 'Pagamento',
        'Voters': 'Votantes',
        'No votes yet': 'Nenhum voto ainda',
        'Reply': 'Responder',
        'Reply to': 'Responder para',
        'Edit': 'Editar',
        'Delete': 'Deletar',
        'Vote': 'Votar',
        'Upvote': 'Curtir',
        'Downvote': 'Descurtir',
        //atéaqui traduzido por hoje
        'Load more replies': 'Carregar mais respostas',
        'Submit Replay': 'Enviar Resposta',
        'Cancel': 'Cancelar',
        'Unvote': 'Remover Voto',
        'Posted': 'Publicado',
        'Last Activity': 'Última Atividade',
        'Balance': 'Saldo',
        'Posts': 'Postagens',
        'Voting Power': 'Poder de Voto',
        'Member since': 'Membro desde',
        'Latest Posts': 'Últimas Postagens',
        'Latest Activity': 'Últimas Atividades',
        'Anterior': 'Anterior',
        'Próximo': 'Próximo',
        'replied to': 'respondeu a',
        'on the topic': 'no tópico',
        'in': 'em',
        'via': 'via',
        'View Reply': 'Ver Resposta',
        'ChooseACategory': 'Escolha uma Categoria',
        'New Topic': 'Novo Tópico',
        'Profile': 'Perfil',
        'Content': 'Conteúdo',
        'Submit Topic': 'Enviar Tópico',
        'No topics found': 'Nenhum tópico encontrado',
        'wrote': 'escreveu',
        'Editing Reply': 'Editando Resposta',
        'Save Changes': 'Salvar Alterações',
        'No replies yet': 'Nenhuma resposta ainda',
        'Reply content cannot be empty': 'O conteúdo da resposta não pode estar vazio',
        'Reply submitted! Waiting for blockchain confirmation...': 'Resposta enviada! Aguardando confirmação da blockchain...',
        'Reply submitted, but a temporary error prevents display. Please refresh.': 'Resposta enviada, mas um erro temporário impede a exibição. Por favor, atualize.',
        'Edit confirmed!': 'Edição confirmada!',
        "Edit was submitted, but it's taking a long time to confirm.": "A edição foi enviada, mas está demorando para confirmar.",
        'You do not have permission to edit this.': 'Você não tem permissão para editar isto.',
        'Editing': 'Editando',
        'Este conteúdo foi excluído': 'This content has been deleted',
        'Transação cancelada. Chave de postagem não fornecida.': 'Transaction cancelled. Posting key not provided.',
        'Delete failed:': 'Delete failed:',
        'Falha ao excluir:': 'Failed to delete:',
    },
    'en-US': {
        'forumTitle': 'BlurtBB Forum',
        'skipToContent': 'Skip to content',
        'login': 'Login',
        'loginWithBlurt': 'Login with Blurt',
        'blurtUsername': 'Blurt Username',
        'privatePostingKey': 'Private Posting Key',
        'keychainLogin': 'Login with Blurt Keychain',
        'newPost': 'New Post...',
        'myProfile': 'My Profile',
        'notifications': 'Notifications',
        'configuration': 'Configuration',
        'wallet': 'Wallet',
        'logout': 'Logout',
        'confirmDelete': 'Confirm Delete',
        'deleteConfirmationBody': 'Are you sure you want to **delete** this content? This action is irreversible.',
        'cancel': 'Cancel',
        'delete': 'Delete',
        'save': 'Save',
        'language': 'Language', // Nova chave
        'portuguese': 'Portuguese', // Nova chave
        'english': 'English', // Nova chave
        'settingsSaved': 'Settings saved',
        'reloading': 'Reloading...',
        'reloadingToApplyChanges': 'Reloading to apply all changes.',
        'lockSession': 'Lock Session',
        'unlockSession': 'Unlock Session',
        'announcements':'Announcements',
        'ChooseACategory': 'Choose a Category',
    },
};

// 3. Gerenciamento do Estado do Idioma
let currentLang = localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en-US'; // Fallback para pt-BR

/**
 * Define o idioma atual e o armazena no localStorage.
 * @param {string} langCode - O código do idioma (ex: 'pt-BR', 'en-US').
 */
export function setLanguage(langCode) {
    if (translations[langCode]) {
        currentLang = langCode;
        localStorage.setItem(LANGUAGE_STORAGE_KEY, langCode);
        return true;
    }
    return false;
}

/**
 * Obtém a tradução para uma chave.
 * @param {string} key - A chave de tradução (ex: 'login').
 * @param {string} fallback - Valor de fallback se a chave não for encontrada.
 * @returns {string} O texto traduzido.
 */
export function translate(key, fallback = key) {
    return translations[currentLang][key] || fallback;
}

/**
 * Obtém o idioma atual.
 * @returns {string} O código do idioma atual.
 */
export function getCurrentLanguage() {
    return currentLang;
}

/**
 * Obtém a lista de idiomas disponíveis.
 * @returns {Array<string>} A lista de códigos de idioma.
 */
export function getAvailableLanguages() {
    return Object.keys(translations);
}

// 🚨 NOVO: Mapeamento de códigos de idioma para nomes de tradução
export const LANGUAGE_NAMES = {
    'pt-BR': 'portuguese',
    'en-US': 'english',
};