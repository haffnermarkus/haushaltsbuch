// ==================== PWA: SERVICE WORKER REGISTRIERUNG ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[PWA] Service Worker registriert:', reg.scope))
            .catch(err => console.warn('[PWA] Service Worker Fehler:', err));
    });
}

// ==================== PWA: INSTALL PROMPT (Android Chrome) ====================
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Optional: Zeige einen "App installieren"-Banner in der UI
    console.log('[PWA] App kann installiert werden.');
});

window.addEventListener('appinstalled', () => {
    console.log('[PWA] App wurde installiert!');
    deferredInstallPrompt = null;
});

// State Management
let state = {
    mode: 'local', // 'local' or 'google'
    accessToken: null,
    fileId: null,
    clientId: localStorage.getItem('gdrive_client_id') || '',
    apiKey: localStorage.getItem('gdrive_api_key') || '',
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1, // 1-indexed (1-12)
    transactions: [],
    editingTransactionId: null,
    deletingTransactionId: null
};

// Default Google Config parameters (Placeholder, configurable in UI)
const DEFAULT_CLIENT_ID = "283087066617-jcnplsfjoit6asktt3v56ihkeltbppas.apps.googleusercontent.com";
const DEFAULT_API_KEY = "";

// Month names in German
const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni", 
    "Juli", "August", "September", "Oktober", "November", "Dezember"
];

// Category Icons mapping (German to Emoji/Glyph representation)
const CATEGORY_ICONS = {
    "Gehalt": "💼",
    "Lebensmittel": "🛒",
    "Wohnen": "🏠",
    "Freizeit": "🎮",
    "Transport": "🚗",
    "Versicherungen": "🛡️",
    "Kredite": "🏦",
    "Sonstiges": "📦"
};

// Seed Mock Data (Same as C# ViewModel seed data)
const SEED_DATA = [
    { id: "s1", title: "Monatsgehalt", amount: 2800.00, isIncome: true, category: "Gehalt", date: new Date(new Date().setDate(new Date().getDate() - 10)).toISOString(), notes: "Reguläres Gehalt", assignedTo: "Partner 1", isFixedCost: false },
    { id: "s2", title: "Supermarkteinkauf", amount: 78.45, isIncome: false, category: "Lebensmittel", date: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString(), notes: "Wocheneinkauf", assignedTo: "Gemeinsam", isFixedCost: false },
    { id: "s3", title: "Tanken", amount: 65.00, isIncome: false, category: "Transport", date: new Date(new Date().setDate(new Date().getDate() - 4)).toISOString(), notes: "Benzin", assignedTo: "Partner 2", isFixedCost: false },
    { id: "s4", title: "Kinotickets", amount: 24.50, isIncome: false, category: "Freizeit", date: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(), notes: "Popcorn & Filme", assignedTo: "Gemeinsam", isFixedCost: false },
    { id: "s5", title: "Verkauf Kleinanzeigen", amount: 50.00, isIncome: true, category: "Sonstiges", date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), notes: "Alte Lampe verkauft", assignedTo: "Partner 1", isFixedCost: false }
];

// Initialize OAuth2 client client-side token helper
let tokenClient = null;

// ==================== APP INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    loadConfig();
    
    // Bereits eine aktive Session in diesem Tab? → direkt laden
    const savedToken = sessionStorage.getItem('gdrive_access_token');
    const savedFileId = localStorage.getItem('gdrive_file_id');
    if (savedToken && savedFileId) {
        state.mode = 'google';
        state.accessToken = savedToken;
        state.fileId = savedFileId;
        showScreen('main-screen');
        updateSyncStatusIndicator('connected', 'Google Drive');
        loadTransactionsFromGoogle();
    } else if (savedFileId) {
        // Kein Session-Token, aber früher schon verbunden gewesen →
        // Warten bis GIS-Bibliothek geladen ist, dann stilles Re-Auth versuchen
        showScreen('login-screen');
        waitForGisAndAutoReconnect();
    } else {
        showScreen('login-screen');
    }
});

// Wartet bis die GIS-Bibliothek verfügbar ist, dann stilles Re-Auth
function waitForGisAndAutoReconnect() {
    const maxWait = 5000; // max 5 Sekunden warten
    const start = Date.now();
    const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts) {
            clearInterval(check);
            tryAutoReconnect();
        } else if (Date.now() - start > maxWait) {
            clearInterval(check);
            console.log('[Auth] GIS nicht geladen, manuelles Login erforderlich.');
        }
    }, 100);
}


function loadConfig() {
    state.clientId = localStorage.getItem('gdrive_client_id') || DEFAULT_CLIENT_ID;
    state.apiKey = localStorage.getItem('gdrive_api_key') || DEFAULT_API_KEY;
    
    document.getElementById('setting-client-id').value = state.clientId;
    document.getElementById('setting-api-key').value = state.apiKey;
}

function initUI() {
    // Year dropdown select handler
    const selectYear = document.getElementById('active-year');
    selectYear.value = state.selectedYear;
    selectYear.addEventListener('change', (e) => {
        state.selectedYear = parseInt(e.target.value);
        updateDataViews();
    });

    // Connect Google button
    document.getElementById('btn-connect-google').addEventListener('click', handleGoogleConnect);
    
    // Local Mode button
    document.getElementById('btn-local-mode').addEventListener('click', handleLocalModeStart);
    
    // Refresh button
    document.getElementById('btn-refresh').addEventListener('click', () => {
        if (state.mode === 'google') {
            loadTransactionsFromGoogle();
        } else {
            loadTransactionsFromLocal();
        }
    });

    // Settings modal button triggers
    document.getElementById('btn-settings').addEventListener('click', () => showOverlay('settings-dialog'));
    document.getElementById('btn-settings-cancel').addEventListener('click', () => hideOverlay('settings-dialog'));
    document.getElementById('btn-settings-save').addEventListener('click', saveSettings);
    document.getElementById('btn-settings-disconnect').addEventListener('click', handleDisconnect);

    // FAB Add transaction
    document.getElementById('btn-add-transaction').addEventListener('click', () => openTransactionDialog());
    
    // Dialog Buttons
    document.getElementById('dialog-btn-close').addEventListener('click', closeTransactionDialog);
    document.getElementById('btn-dialog-cancel').addEventListener('click', closeTransactionDialog);
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionSave);

    // Confirm dialog triggers
    document.getElementById('btn-confirm-cancel').addEventListener('click', () => hideOverlay('confirm-dialog'));
    document.getElementById('btn-confirm-ok').addEventListener('click', handleTransactionDeleteConfirmed);

    // Setup hint
    document.getElementById('link-setup-instructions').addEventListener('click', (e) => {
        e.preventDefault();
        showOverlay('settings-dialog');
    });

    // Set today's date default in Form input
    document.getElementById('field-date').value = new Date().toISOString().substring(0, 10);
}

// ==================== NAVIGATION SCREENS ====================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(scr => scr.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    overlay.classList.add('active');
}

function hideOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    overlay.classList.remove('active');
}

function updateSyncStatusIndicator(type, label) {
    const indicator = document.getElementById('sync-status');
    indicator.className = `status-indicator ${type}`;
    indicator.textContent = label;
}

// ==================== TEST MODE (LOCAL STORAGE) ====================
function handleLocalModeStart() {
    state.mode = 'local';
    showScreen('main-screen');
    updateSyncStatusIndicator('local', 'Lokal');
    loadTransactionsFromLocal();
}

function loadTransactionsFromLocal() {
    let saved = localStorage.getItem('local_transactions');
    if (saved) {
        state.transactions = JSON.parse(saved);
    } else {
        // Seed database
        state.transactions = SEED_DATA;
        localStorage.setItem('local_transactions', JSON.stringify(SEED_DATA));
    }
    updateDataViews();
}

function saveTransactionsToLocal() {
    localStorage.setItem('local_transactions', JSON.stringify(state.transactions));
    updateDataViews();
}

// ==================== GOOGLE DRIVE CONNECTION ====================

// Erstellt den GIS Token Client und gibt ihn zurück
function createTokenClient(callback) {
    return google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: callback,
    });
}

// Wird beim App-Start aufgerufen – versucht lautlos eine neue Session zu holen
// ohne dass der Nutzer etwas tun muss (kein Popup wenn bereits eingeloggt)
function tryAutoReconnect() {
    if (!state.clientId) return;
    const savedFileId = localStorage.getItem('gdrive_file_id');
    if (!savedFileId) return; // Noch nie verbunden → kein Auto-Reconnect

    try {
        const client = createTokenClient((response) => {
            if (response.error) {
                // Stilles Re-Auth hat nicht geklappt → kein Problem, Nutzer kann manuell verbinden
                console.log('[Auth] Stilles Re-Auth fehlgeschlagen:', response.error);
                return;
            }
            // Erfolg: Token ohne Nutzerinteraktion erneuert
            onAuthSuccess(response.access_token, savedFileId);
        });
        // prompt='none' → kein Popup, kein Account-Wechsel – nur stilles Token-Refresh
        client.requestAccessToken({ prompt: 'none' });
    } catch (e) {
        console.warn('[Auth] Auto-Reconnect nicht möglich:', e.message);
    }
}

// Wird beim Klick auf "Mit Google Drive verbinden" aufgerufen
function handleGoogleConnect() {
    if (!state.clientId) {
        alert("Bitte konfigurieren Sie zuerst Ihre Google Client ID in den Einstellungen!");
        showOverlay('settings-dialog');
        return;
    }

    try {
        tokenClient = createTokenClient((response) => {
            if (response.error !== undefined) {
                alert(`Fehler bei Authentifizierung: ${response.error}`);
                return;
            }
            onAuthSuccess(response.access_token, localStorage.getItem('gdrive_file_id'));
        });

        // 'select_account' zeigt die Account-Auswahl (kein erzwungenes Consent mehr!)
        // Nur beim ersten Mal fragt Google nach Zustimmung – danach direkt weiter.
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
        alert(`Google client error: ${e.message}`);
    }
}

// Gemeinsame Logik nach erfolgreichem Token-Erhalt
function onAuthSuccess(accessToken, existingFileId) {
    state.mode = 'google';
    state.accessToken = accessToken;
    sessionStorage.setItem('gdrive_access_token', accessToken);

    showScreen('main-screen');
    updateSyncStatusIndicator('connected', 'Google Drive');

    if (existingFileId) {
        // Bereits bekannte File-ID → direkt laden, kein neues Suchen nötig
        state.fileId = existingFileId;
        loadTransactionsFromGoogle();
    } else {
        findOrCreateTransactionsFile();
    }
}

// REST helper to contact Google API
async function apiCall(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    options.headers['Authorization'] = `Bearer ${state.accessToken}`;
    options.headers['Accept'] = 'application/json';
    
    let response = await fetch(url, options);
    if (response.status === 401) {
        // Auth expired, redirect to log in again
        alert("Sitzung abgelaufen. Bitte verbinden Sie sich erneut mit Google Drive.");
        handleDisconnect();
        return null;
    }
    return response;
}

async function findOrCreateTransactionsFile() {
    try {
        // Search for transactions.json
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='transactions.json'+and+trashed=false${state.apiKey ? `&key=${state.apiKey}` : ''}`;
        let response = await apiCall(searchUrl);
        if (!response) return;
        
        let data = await response.json();
        if (data.files && data.files.length > 0) {
            // File exists
            state.fileId = data.files[0].id;
            localStorage.setItem('gdrive_file_id', state.fileId);
            loadTransactionsFromGoogle();
        } else {
            // File does not exist, create it with seed data
            createTransactionsFileInGoogle();
        }
    } catch (err) {
        alert(`Drive Search Error: ${err.message}`);
    }
}

async function loadTransactionsFromGoogle() {
    if (!state.fileId) return;
    
    updateSyncStatusIndicator('local', 'Lade...');
    try {
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${state.fileId}?alt=media`;
        let response = await apiCall(downloadUrl);
        if (!response) return;
        
        let data = await response.json();
        // Set state
        state.transactions = data || [];
        updateSyncStatusIndicator('connected', 'Google Drive');
        updateDataViews();
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        alert(`Drive Download Error: ${err.message}`);
    }
}

async function createTransactionsFileInGoogle() {
    updateSyncStatusIndicator('local', 'Erstelle...');
    try {
        const metadata = {
            name: 'transactions.json',
            mimeType: 'application/json'
        };
        
        // Multi-part create REST request
        const boundary = 'foo_bar_boundary';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        
        const body = 
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(SEED_DATA) +
            closeDelimiter;

        let response = await apiCall('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: body
        });
        
        if (!response) return;
        let file = await response.json();
        state.fileId = file.id;
        localStorage.setItem('gdrive_file_id', state.fileId);
        state.transactions = SEED_DATA;
        
        updateSyncStatusIndicator('connected', 'Google Drive');
        updateDataViews();
    } catch (err) {
        alert(`Drive File Creation Error: ${err.message}`);
    }
}

async function saveTransactionsToGoogle() {
    if (!state.fileId) return;
    
    updateSyncStatusIndicator('local', 'Speichere...');
    try {
        const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${state.fileId}?uploadType=media`;
        let response = await apiCall(updateUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(state.transactions)
        });
        
        if (response && response.ok) {
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error("Update call failed");
        }
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        alert(`Drive Upload Error: ${err.message}`);
    }
}

// ==================== SETTINGS HANDLERS ====================
function saveSettings() {
    const cId = document.getElementById('setting-client-id').value.trim();
    const apiKey = document.getElementById('setting-api-key').value.trim();
    
    state.clientId = cId;
    state.apiKey = apiKey;
    
    localStorage.setItem('gdrive_client_id', cId);
    localStorage.setItem('gdrive_api_key', apiKey);
    
    hideOverlay('settings-dialog');
    alert("Einstellungen erfolgreich gespeichert!");
}

function handleDisconnect() {
    state.accessToken = null;
    state.fileId = null;
    sessionStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_file_id');
    
    hideOverlay('settings-dialog');
    showScreen('login-screen');
    updateSyncStatusIndicator('local', 'Lokal');
}

// ==================== RENDERING AND LOGIC ====================
function updateDataViews() {
    renderMonthsList();
    renderTransactionsList();
    renderSummaryBox();
}

function renderMonthsList() {
    const container = document.getElementById('months-list');
    container.innerHTML = '';
    
    const year = state.selectedYear;
    
    // Group variable transactions for each month in the selected year
    for (let m = 1; m <= 12; m++) {
        const monthTrans = state.transactions.filter(t => {
            if (t.isDeleted) return false;
            if (t.isFixedCost) return false;
            const d = new Date(t.date);
            return d.getFullYear() === year && (d.getMonth() + 1) === m;
        });
        
        const income = monthTrans.filter(t => t.isIncome).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const expenses = monthTrans.filter(t => !t.isIncome).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const surplus = income - expenses;
        
        const card = document.createElement('div');
        card.className = `month-card ${state.selectedMonth === m ? 'selected' : ''}`;
        card.addEventListener('click', () => {
            state.selectedMonth = m;
            updateDataViews();
        });
        
        card.innerHTML = `
            <h4>${MONTH_NAMES[m - 1]}</h4>
            <div class="month-card-stats">
                <span class="income">+${income.toFixed(2)} €</span>
                <span class="expense">-${expenses.toFixed(2)} €</span>
            </div>
            <span class="surplus" style="color: ${surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">
                ${surplus >= 0 ? '+' : ''}${surplus.toFixed(2)} €
            </span>
        `;
        container.appendChild(card);
    }
}

function renderSummaryBox() {
    const year = state.selectedYear;
    const month = state.selectedMonth;
    
    document.getElementById('selected-month-label').textContent = `${MONTH_NAMES[month - 1]} ${year}`;
    
    const monthTrans = state.transactions.filter(t => {
        if (t.isDeleted) return false;
        if (t.isFixedCost) return false;
        const d = new Date(t.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    
    const income = monthTrans.filter(t => t.isIncome).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const expenses = monthTrans.filter(t => !t.isIncome).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const surplus = income - expenses;
    
    document.getElementById('stat-income').textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    document.getElementById('stat-expenses').textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;
    
    const surplusEl = document.getElementById('stat-surplus');
    surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
    surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
}

function renderTransactionsList() {
    const container = document.getElementById('transactions-list');
    container.innerHTML = '';
    
    const year = state.selectedYear;
    const month = state.selectedMonth;
    
    const monthTrans = state.transactions.filter(t => {
        if (t.isDeleted) return false;
        if (t.isFixedCost) return false;
        const d = new Date(t.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    
    // Sort descending by date
    monthTrans.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    document.getElementById('transaction-count').textContent = monthTrans.length;
    
    if (monthTrans.length === 0) {
        container.innerHTML = `
            <div class="no-transactions">
                Keine Buchungen für diesen Monat erfasst.<br>Tippen Sie auf das "+"-Symbol, um eine neue Buchung hinzuzufügen.
            </div>
        `;
        return;
    }
    
    monthTrans.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        
        const dateFormatted = new Date(t.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const icon = CATEGORY_ICONS[t.category] || '📦';
        
        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5>${escapeHtml(t.title)}</h5>
                    <div class="subtitle">
                        <span>${dateFormatted}</span>
                        <span class="subtitle-badge">${escapeHtml(t.assignedTo || 'Gemeinsam')}</span>
                    </div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount ${t.isIncome ? 'income' : 'expense'}">
                    ${t.isIncome ? '+' : '-'}${parseFloat(t.amount).toFixed(2).replace('.', ',')} €
                </span>
                <div class="transaction-actions">
                    <button class="action-btn edit" data-id="${t.id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </button>
                    <button class="action-btn delete" data-id="${t.id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        // Add click triggers
        item.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openTransactionDialog(t.id);
        });
        item.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteTransaction(t.id);
        });
        
        container.appendChild(item);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ==================== TRANSACTION DIALOG (ADD / EDIT) ====================
function openTransactionDialog(id = null) {
    state.editingTransactionId = id;
    
    // Clear validation states
    document.getElementById('field-title').value = '';
    document.getElementById('field-amount').value = '';
    document.getElementById('field-type').value = 'expense';
    document.getElementById('field-category').value = 'Sonstiges';
    document.getElementById('field-assigned').value = 'Gemeinsam';
    document.getElementById('field-notes').value = '';
    
    // Default date to active year/month
    const activeYear = state.selectedYear;
    const activeMonth = String(state.selectedMonth).padStart(2, '0');
    const today = new Date();
    const day = (today.getMonth() + 1 === state.selectedMonth && today.getFullYear() === state.selectedYear) 
        ? String(today.getDate()).padStart(2, '0') 
        : '01';
    document.getElementById('field-date').value = `${activeYear}-${activeMonth}-${day}`;

    if (id) {
        // Edit Mode
        document.getElementById('dialog-title').textContent = "Eintrag bearbeiten";
        const trans = state.transactions.find(t => t.id === id);
        if (trans) {
            document.getElementById('field-title').value = trans.title;
            document.getElementById('field-amount').value = Math.abs(trans.amount);
            document.getElementById('field-type').value = trans.isIncome ? 'income' : 'expense';
            document.getElementById('field-category').value = trans.category;
            document.getElementById('field-assigned').value = trans.assignedTo || 'Gemeinsam';
            document.getElementById('field-date').value = new Date(trans.date).toISOString().substring(0, 10);
            document.getElementById('field-notes').value = trans.notes || '';
        }
    } else {
        // Create Mode
        document.getElementById('dialog-title').textContent = "Neuer Eintrag";
    }
    
    showOverlay('transaction-dialog');
}

function closeTransactionDialog() {
    hideOverlay('transaction-dialog');
    state.editingTransactionId = null;
}

function handleTransactionSave(e) {
    e.preventDefault();
    
    const title = document.getElementById('field-title').value.trim();
    const amount = parseFloat(document.getElementById('field-amount').value);
    const type = document.getElementById('field-type').value;
    const category = document.getElementById('field-category').value;
    const assignedTo = document.getElementById('field-assigned').value;
    const dateStr = document.getElementById('field-date').value;
    const notes = document.getElementById('field-notes').value.trim();
    
    if (!title || isNaN(amount) || amount <= 0 || !dateStr) {
        alert("Bitte füllen Sie alle Pflichtfelder korrekt aus.");
        return;
    }
    
    const date = new Date(dateStr).toISOString();
    const isIncome = (type === 'income');
    
    if (state.editingTransactionId) {
        // Edit existing transaction
        const trans = state.transactions.find(t => t.id === state.editingTransactionId);
        if (trans) {
            trans.title = title;
            trans.amount = amount;
            trans.isIncome = isIncome;
            trans.category = category;
            trans.assignedTo = assignedTo;
            trans.date = date;
            trans.notes = notes;
            trans.updatedAt = new Date().toISOString();
        }
    } else {
        // Add new transaction
        const newTrans = {
            id: generateUUID(),
            title: title,
            amount: amount,
            isIncome: isIncome,
            category: category,
            assignedTo: assignedTo,
            date: date,
            notes: notes,
            isFixedCost: false,
            isDeleted: false,
            updatedAt: new Date().toISOString()
        };
        state.transactions.unshift(newTrans);
    }
    
    // Save to storage depending on active mode
    if (state.mode === 'google') {
        saveTransactionsToGoogle();
    } else {
        saveTransactionsToLocal();
    }
    
    closeTransactionDialog();
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ==================== DELETE TRANSACTION CONFIRMATION ====================
function confirmDeleteTransaction(id) {
    state.deletingTransactionId = id;
    const trans = state.transactions.find(t => t.id === id);
    if (trans) {
        document.getElementById('confirm-message').textContent = `Möchten Sie den Eintrag "${trans.title}" (${parseFloat(trans.amount).toFixed(2)} €) wirklich löschen?`;
        showOverlay('confirm-dialog');
    }
}

function handleTransactionDeleteConfirmed() {
    const id = state.deletingTransactionId;
    if (id) {
        const trans = state.transactions.find(t => t.id === id);
        if (trans) {
            trans.isDeleted = true;
            trans.updatedAt = new Date().toISOString();
        }
        
        if (state.mode === 'google') {
            saveTransactionsToGoogle();
        } else {
            saveTransactionsToLocal();
        }
    }
    hideOverlay('confirm-dialog');
    state.deletingTransactionId = null;
}

// ==================== PWA: APP INSTALL HELPER ====================
// Kann aufgerufen werden um den nativen Installations-Dialog auszulösen
function triggerPwaInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(choice => {
            console.log('[PWA] Nutzer hat gewählt:', choice.outcome);
            deferredInstallPrompt = null;
        });
    }
}
