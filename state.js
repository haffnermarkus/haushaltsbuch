// Global State Management for Haushaltsbuch PWA
export const state = {
    mode: 'local', // 'local' or 'google'
    accessToken: null,
    fileId: null,
    clientId: localStorage.getItem('gdrive_client_id') || '',
    apiKey: localStorage.getItem('gdrive_api_key') || '',
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1, // 1-indexed (1-12)
    transactions: [],
    editingTransactionId: null,
    deletingTransactionId: null,
    activeTab: 'dashboard',
    buildingCosts: [],
    buildingCostsFileId: localStorage.getItem('gdrive_building_costs_file_id') || null,
    budgetCategories: [] // Loaded dynamically from scenario_settings.json
};

export const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni", 
    "Juli", "August", "September", "Oktober", "November", "Dezember"
];

// Fallback Category Icons mapping (German name to Emoji)
export const DEFAULT_CATEGORY_ICONS = {
    "Gehalt": "💼",
    "Lebensmittel": "🛒",
    "Wohnen": "🏠",
    "Freizeit": "🎮",
    "Transport": "🚗",
    "Versicherungen": "🛡️",
    "Kredite": "🏦",
    "Sonstiges": "📦"
};

// Map Segoe MDL2 Windows Icons to Web Emojis
export const GLYPH_TO_EMOJI = {
    "\uE8A1": "💼", // Bank / Gehalt
    "\uE120": "🛒", // Einkaufen / Lebensmittel
    "\uE80F": "🏠", // Wohnen / Haus
    "\uE709": "🎮", // Spiele / Freizeit
    "\uE704": "🚗", // Auto / Transport
    "\uE97E": "✈️", // Urlaub / Flugzeug
    "\uEA18": "🛡️", // Schild / Versicherungen
    "\uE18B": "🏦", // Kredite / Geld
    "\uE8EC": "🏷️", // Sonstiges / Etikett
    "\uE7E7": "❤️", // Herz / Gesundheit
    "\uE1D0": "🎁", // Geschenk
    "\uE8CD": "📚", // Bildung / Buch
    "\uE756": "🍴", // Essen / Restaurant
    "\uE706": "☕", // Kaffee
    "\uE70E": "📱", // Telefon / Mobile
    "\uE7BE": "🗑️", // Müll / Utilities
    "\uE74C": "🔧", // Reparaturen / Werkzeug
    "\uE158": "🎉", // Feier / Party
    "\uE8B2": "👚", // Kleidung / Bügel
    "\uE7B5": "🐾", // Tiere / Pfote
    "\uE8C0": "💪", // Sport / Fitness
    "\uE7C3": "🌱", // Garten / Pflanzen
    "\uE722": "👶", // Kind / Baby
    "\uE91B": "📺", // Abo / Streaming
    "\uE8A5": "💳", // Kreditkarte
    "\uE825": "💵", // Bargeld
    "\uE9E9": "⚡", // Energie / Strom
    "\uE70B": "🎬", // Kino / Unterhaltung
    "\uE7C9": "💼", // Arbeit / Koffer
    "\uE774": "🛍️", // Online-Shopping
    "\uE9D9": "🛠️", // Werkzeuge
    "\uE768": "🎵", // Musik
    "\uEA0C": "💊", // Apotheke / Pille
    "\uE734": "⭐", // Stern / Favorit
    "\uE8B8": "⚙️", // Zahnrad / Einstellungen
    "\u20AC": "💶", // Euro
    "🍎": "🍎"
};

// Seed Mock Data
export const SEED_DATA = [
    { id: "s1", title: "Monatsgehalt", amount: 2800.00, isIncome: true, category: "Gehalt", date: new Date(new Date().setDate(new Date().getDate() - 10)).toISOString(), notes: "Reguläres Gehalt", assignedTo: "Partner 1", isFixedCost: false },
    { id: "s2", title: "Supermarkteinkauf", amount: 78.45, isIncome: false, category: "Lebensmittel", date: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString(), notes: "Wocheneinkauf", assignedTo: "Gemeinsam", isFixedCost: false },
    { id: "s3", title: "Tanken", amount: 65.00, isIncome: false, category: "Transport", date: new Date(new Date().setDate(new Date().getDate() - 4)).toISOString(), notes: "Benzin", assignedTo: "Partner 2", isFixedCost: false },
    { id: "s4", title: "Kinotickets", amount: 24.50, isIncome: false, category: "Freizeit", date: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(), notes: "Popcorn & Filme", assignedTo: "Gemeinsam", isFixedCost: false },
    { id: "s5", title: "Verkauf Kleinanzeigen", amount: 50.00, isIncome: true, category: "Sonstiges", date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), notes: "Alte Lampe verkauft", assignedTo: "Partner 1", isFixedCost: false }
];

export function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function formatCurrency(val) {
    return `${val.toFixed(2).replace('.', ',')} €`;
}

export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Local Storage Handlers (Test-Modus)
export function loadTransactionsFromLocal() {
    let saved = localStorage.getItem('local_transactions');
    if (saved) {
        state.transactions = JSON.parse(saved);
    } else {
        state.transactions = SEED_DATA;
        localStorage.setItem('local_transactions', JSON.stringify(SEED_DATA));
    }
}

export function saveTransactionsToLocal() {
    localStorage.setItem('local_transactions', JSON.stringify(state.transactions));
}

// Helper to get Category Emoji
export function getCategoryEmoji(catName) {
    if (!state.budgetCategories || state.budgetCategories.length === 0) {
        return DEFAULT_CATEGORY_ICONS[catName] || '📦';
    }
    const cat = state.budgetCategories.find(c => c.name === catName || c.Name === catName);
    if (cat) {
        const glyph = cat.iconGlyph || cat.IconGlyph;
        return GLYPH_TO_EMOJI[glyph] || glyph || '📦';
    }
    return DEFAULT_CATEGORY_ICONS[catName] || '📦';
}
