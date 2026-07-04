import { 
    state, 
    MONTH_NAMES, 
    SEED_DATA, 
    escapeHtml, 
    formatCurrency, 
    generateUUID, 
    loadTransactionsFromLocal, 
    saveTransactionsToLocal 
} from './state.js';

import { 
    tryAutoReconnect, 
    handleGoogleConnect, 
    onAuthSuccess 
} from './auth.js';

import { 
    apiCall, 
    searchFile, 
    downloadFileContent, 
    uploadFileContent, 
    createFileInGoogle 
} from './api.js';

import { 
    updateDataViews, 
    renderMonthsList, 
    renderTransactionsList, 
    renderSummaryBox, 
    renderBuildingCosts, 
    populateCategoryDropdown 
} from './ui.js';

export { 
    state, 
    updateDataViews, 
    openTransactionDialog, 
    confirmDeleteTransaction, 
    loadTransactionsFromGoogle, 
    showScreen, 
    updateSyncStatusIndicator, 
    handleDisconnect 
};

// ==================== PWA: SERVICE WORKER REGISTRIERUNG ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[PWA] Service Worker registriert:', reg.scope))
            .catch(err => console.warn('[PWA] Service Worker Fehler:', err));
    });
}

// ==================== PWA: INSTALL PROMPT ====================
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] App kann installiert werden.');
});

window.addEventListener('appinstalled', () => {
    console.log('[PWA] App wurde installiert!');
    deferredInstallPrompt = null;
});

// Default Google Config parameters
const DEFAULT_CLIENT_ID = "283087066617-jcnplsfjoit6asktt3v56ihkeltbppas.apps.googleusercontent.com";
const DEFAULT_API_KEY = "";

// ==================== APP INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    loadConfig();
    
    // Bereits eine aktive Session in diesem Tab? -> direkt laden
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
        showScreen('login-screen');
        waitForGisAndAutoReconnect();
    } else {
        showScreen('login-screen');
    }
});

function waitForGisAndAutoReconnect() {
    const maxWait = 5000;
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
    
    const clientInput = document.getElementById('setting-client-id');
    if (clientInput) clientInput.value = state.clientId;
    const apiInput = document.getElementById('setting-api-key');
    if (apiInput) apiInput.value = state.apiKey;
}

export function openSettingsDialog() {
    const fileIdInput = document.getElementById('setting-file-id');
    if (fileIdInput) fileIdInput.value = state.fileId || '';
    showOverlay('settings-dialog');
}

function initUI() {
    // Year dropdown select handler
    const selectYear = document.getElementById('active-year');
    if (selectYear) {
        selectYear.value = state.selectedYear;
        selectYear.addEventListener('change', (e) => {
            state.selectedYear = parseInt(e.target.value);
            updateDataViews();
        });
    }

    // Connect Google button
    const btnConnect = document.getElementById('btn-connect-google');
    if (btnConnect) btnConnect.addEventListener('click', handleGoogleConnect);
    
    // Local Mode button
    const btnLocal = document.getElementById('btn-local-mode');
    if (btnLocal) btnLocal.addEventListener('click', handleLocalModeStart);
    
    // Refresh button
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            if (state.mode === 'google') {
                loadTransactionsFromGoogle();
            } else {
                loadTransactionsFromLocal();
                updateDataViews();
            }
        });
    }

    // Settings modal button triggers
    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) btnSettings.addEventListener('click', () => openSettingsDialog());
    const btnSettingsCancel = document.getElementById('btn-settings-cancel');
    if (btnSettingsCancel) btnSettingsCancel.addEventListener('click', () => hideOverlay('settings-dialog'));
    const btnSettingsSave = document.getElementById('btn-settings-save');
    if (btnSettingsSave) btnSettingsSave.addEventListener('click', saveSettings);
    const btnSettingsDisconnect = document.getElementById('btn-settings-disconnect');
    if (btnSettingsDisconnect) btnSettingsDisconnect.addEventListener('click', handleDisconnect);

    // Tab Navigation Bar
    const navDash = document.getElementById('nav-dashboard');
    if (navDash) navDash.addEventListener('click', () => switchTab('dashboard'));
    const navBau = document.getElementById('nav-baukosten');
    if (navBau) navBau.addEventListener('click', () => switchTab('baukosten'));

    // FAB Add transaction
    const btnAdd = document.getElementById('btn-add-transaction');
    if (btnAdd) btnAdd.addEventListener('click', () => openTransactionDialog());
    
    // Dialog Buttons
    const btnClose = document.getElementById('dialog-btn-close');
    if (btnClose) btnClose.addEventListener('click', closeTransactionDialog);
    const btnCancel = document.getElementById('btn-dialog-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeTransactionDialog);
    const form = document.getElementById('transaction-form');
    if (form) form.addEventListener('submit', handleTransactionSave);

    // Confirm dialog triggers
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', () => hideOverlay('confirm-dialog'));
    const btnConfirmOk = document.getElementById('btn-confirm-ok');
    if (btnConfirmOk) btnConfirmOk.addEventListener('click', handleTransactionDeleteConfirmed);

    // Setup hint
    const linkSetup = document.getElementById('link-setup-instructions');
    if (linkSetup) {
        linkSetup.addEventListener('click', (e) => {
            e.preventDefault();
            openSettingsDialog();
        });
    }

    // Set today's date default in Form input
    const fieldDate = document.getElementById('field-date');
    if (fieldDate) fieldDate.value = new Date().toISOString().substring(0, 10);
    
    // Populate dropdown dynamically in case it's ready
    populateCategoryDropdown();
}

// ==================== NAVIGATION SCREENS ====================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(scr => scr.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
}

function showOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.add('active');
}

function hideOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.remove('active');
}

function updateSyncStatusIndicator(type, label) {
    const indicator = document.getElementById('sync-status');
    if (indicator) {
        indicator.className = `status-indicator ${type}`;
        indicator.textContent = label;
    }
}

// ==================== LOCAL STORAGE HANDLERS ====================
function handleLocalModeStart() {
    state.mode = 'local';
    showScreen('main-screen');
    updateSyncStatusIndicator('local', 'Lokal');
    loadTransactionsFromLocal();
    updateDataViews();
}

// ==================== GOOGLE DRIVE OPERATIONS ====================
function mergeTransactions(local, remote) {
    const map = new Map();

    function mergeIntoMap(t) {
        if (!t) return;
        const id = t.id || t.Id;
        if (!id) return;
        
        if (map.has(id)) {
            const existing = map.get(id);
            const tTime = new Date(t.updatedAt || t.UpdatedAt || 0).getTime();
            const existingTime = new Date(existing.updatedAt || existing.UpdatedAt || 0).getTime();

            let useIncoming = false;
            if (tTime > existingTime) {
                useIncoming = true;
            } else if (tTime === existingTime) {
                const incomingDel = t.isDeleted || t.IsDeleted || false;
                const existingDel = existing.isDeleted || existing.IsDeleted || false;
                if (incomingDel && !existingDel) {
                    useIncoming = true;
                }
            }

            if (useIncoming) {
                map.set(id, t);
            }
        } else {
            map.set(id, t);
        }
    }

    if (Array.isArray(local)) local.forEach(t => mergeIntoMap(t));
    if (Array.isArray(remote)) remote.forEach(t => mergeIntoMap(t));

    return Array.from(map.values());
}

async function loadTransactionsFromGoogle() {
    if (!state.fileId) return;
    
    updateSyncStatusIndicator('local', 'Lade...');
    try {
        let data = await downloadFileContent(state.fileId);
        state.transactions = mergeTransactions(state.transactions || [], data || []);
        updateSyncStatusIndicator('connected', 'Google Drive');
        updateDataViews();
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        alert(`Drive Download Error: ${err.message}`);
    }
}

async function saveTransactionsToGoogle() {
    if (!state.fileId) return;
    
    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        let remoteTransactions = await downloadFileContent(state.fileId) || [];
        const merged = mergeTransactions(state.transactions, remoteTransactions);
        state.transactions = merged;

        let success = await uploadFileContent(state.fileId, state.transactions);
        if (success) {
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error("Fehler beim Hochladen auf Google Drive.");
        }
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        alert(`Drive Sync Error: ${err.message}`);
    }
}

// ==================== SETTINGS HANDLERS ====================
function saveSettings() {
    const cId = document.getElementById('setting-client-id').value.trim();
    const apiKey = document.getElementById('setting-api-key').value.trim();
    const fileId = document.getElementById('setting-file-id').value.trim();
    
    state.clientId = cId;
    state.apiKey = apiKey;
    
    localStorage.setItem('gdrive_client_id', cId);
    localStorage.setItem('gdrive_api_key', apiKey);
    
    if (fileId && fileId !== state.fileId) {
        state.fileId = fileId;
        localStorage.setItem('gdrive_file_id', fileId);
        if (state.mode === 'google') {
            loadTransactionsFromGoogle();
        }
    }
    
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

// ==================== TRANSACTION DIALOG (ADD / EDIT) ====================
function openTransactionDialog(id = null) {
    state.editingTransactionId = id;
    
    document.getElementById('field-title').value = '';
    document.getElementById('field-amount').value = '';
    document.getElementById('field-type').value = 'expense';
    document.getElementById('field-category').value = 'Sonstiges';
    document.getElementById('field-assigned').value = 'Gemeinsam';
    document.getElementById('field-notes').value = '';
    
    const activeYear = state.selectedYear;
    const activeMonth = String(state.selectedMonth).padStart(2, '0');
    const today = new Date();
    const day = (today.getMonth() + 1 === state.selectedMonth && today.getFullYear() === state.selectedYear) 
        ? String(today.getDate()).padStart(2, '0') 
        : '01';
    document.getElementById('field-date').value = `${activeYear}-${activeMonth}-${day}`;

    if (id) {
        document.getElementById('dialog-title').textContent = "Eintrag bearbeiten";
        const trans = state.transactions.find(t => (t.id || t.Id) === id);
        if (trans) {
            document.getElementById('field-title').value = trans.title || trans.Title;
            document.getElementById('field-amount').value = Math.abs(trans.amount || trans.Amount);
            document.getElementById('field-type').value = (trans.isIncome || trans.IsIncome) ? 'income' : 'expense';
            document.getElementById('field-category').value = trans.category || trans.Category;
            document.getElementById('field-assigned').value = trans.assignedTo || trans.AssignedTo || 'Gemeinsam';
            document.getElementById('field-date').value = new Date(trans.date || trans.Date).toISOString().substring(0, 10);
            document.getElementById('field-notes').value = trans.notes || trans.Notes || '';
        }
    } else {
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
        const trans = state.transactions.find(t => (t.id || t.Id) === state.editingTransactionId);
        if (trans) {
            trans.title = title;
            trans.amount = amount;
            trans.isIncome = isIncome;
            trans.category = category;
            trans.assignedTo = assignedTo;
            trans.date = date;
            trans.notes = notes;
            trans.updatedAt = new Date().toISOString();
            
            // C# properties sync if loaded from desktop
            trans.Title = title;
            trans.Amount = amount;
            trans.IsIncome = isIncome;
            trans.Category = category;
            trans.AssignedTo = assignedTo;
            trans.Date = date;
            trans.Notes = notes;
            trans.UpdatedAt = trans.updatedAt;
        }
    } else {
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
        // Also support C# property names
        newTrans.Id = newTrans.id;
        newTrans.Title = newTrans.title;
        newTrans.Amount = newTrans.amount;
        newTrans.IsIncome = newTrans.isIncome;
        newTrans.Category = newTrans.category;
        newTrans.AssignedTo = newTrans.assignedTo;
        newTrans.Date = newTrans.date;
        newTrans.Notes = newTrans.notes;
        newTrans.IsFixedCost = newTrans.isFixedCost;
        newTrans.IsDeleted = newTrans.isDeleted;
        newTrans.UpdatedAt = newTrans.updatedAt;

        state.transactions.unshift(newTrans);
    }
    
    if (state.mode === 'google') {
        saveTransactionsToGoogle();
    } else {
        saveTransactionsToLocal();
        updateDataViews();
    }
    
    closeTransactionDialog();
}

// ==================== DELETE TRANSACTION CONFIRMATION ====================
function confirmDeleteTransaction(id) {
    state.deletingTransactionId = id;
    const trans = state.transactions.find(t => (t.id || t.Id) === id);
    if (trans) {
        const title = trans.title || trans.Title || '';
        const amt = trans.amount || trans.Amount || 0;
        document.getElementById('confirm-message').textContent = `Möchten Sie den Eintrag "${title}" (${parseFloat(amt).toFixed(2)} €) wirklich löschen?`;
        showOverlay('confirm-dialog');
    }
}

function handleTransactionDeleteConfirmed() {
    const id = state.deletingTransactionId;
    if (id) {
        const trans = state.transactions.find(t => (t.id || t.Id) === id);
        if (trans) {
            trans.isDeleted = true;
            trans.updatedAt = new Date().toISOString();
            trans.IsDeleted = true;
            trans.UpdatedAt = trans.updatedAt;
        }
        
        if (state.mode === 'google') {
            saveTransactionsToGoogle();
        } else {
            saveTransactionsToLocal();
            updateDataViews();
        }
    }
    hideOverlay('confirm-dialog');
    state.deletingTransactionId = null;
}

// ==================== TAB SWITCHING & BAUKOSTEN ====================
function switchTab(tabId) {
    state.activeTab = tabId;
    
    document.getElementById('nav-dashboard').classList.toggle('active', tabId === 'dashboard');
    document.getElementById('nav-baukosten').classList.toggle('active', tabId === 'baukosten');
    
    document.getElementById('tab-dashboard').classList.toggle('active', tabId === 'dashboard');
    document.getElementById('tab-baukosten').classList.toggle('active', tabId === 'baukosten');
    
    document.getElementById('btn-add-transaction').style.display = tabId === 'dashboard' ? 'flex' : 'none';
    
    if (tabId === 'baukosten') {
        loadBuildingCostsFromGoogle();
    }
}

async function loadBuildingCostsFromGoogle() {
    const listContainer = document.getElementById('baukosten-list');
    if (!listContainer) return;
    
    if (state.mode !== 'google') {
        listContainer.innerHTML = `<div class="info-box">Baukosten können nur im Google Drive-Modus angezeigt werden.</div>`;
        return;
    }
    
    if (!state.buildingCostsFileId) {
        state.buildingCostsFileId = await searchFile('building_costs.json');
        if (!state.buildingCostsFileId) {
            listContainer.innerHTML = `<div class="info-box">Keine Baukosten-Datei 'building_costs.json' auf Ihrem Google Drive gefunden.<br><br>Bitte führen Sie in der PC-App eine <strong>Synchronisierung</strong> durch, um die Baukosten hochzuladen.</div>`;
            return;
        }
        localStorage.setItem('gdrive_building_costs_file_id', state.buildingCostsFileId);
    }
    
    listContainer.innerHTML = `<div class="loading-state">Lade Baukosten...</div>`;
    
    try {
        let data = await downloadFileContent(state.buildingCostsFileId);
        state.buildingCosts = data || [];
        renderBuildingCosts();
    } catch (err) {
        listContainer.innerHTML = `<div class="info-box" style="color:var(--color-expense)">Fehler beim Laden der Baukosten:<br>${err.message}</div>`;
    }
}
