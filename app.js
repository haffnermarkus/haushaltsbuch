import {
    state,
    MONTH_NAMES,
    SEED_DATA,
    escapeHtml,
    formatCurrency,
    generateUUID,
    loadTransactionsFromLocal,
    saveTransactionsToLocal,
    loadFixedExpensesFromLocal,
    saveFixedExpensesToLocal,
    loadLoansFromLocal,
    saveLoansToLocal,
    updateSingleLoanCalculations
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
    populateCategoryDropdown,
    renderLoans,
    renderFixedExpenses,
    renderFilterableTransactions,
    showTransactionDetails,
    updatePartnerDropdowns
} from './ui.js';

export {
    state,
    updateDataViews,
    openTransactionDialog,
    confirmDeleteTransaction,
    loadTransactionsFromGoogle,
    showScreen,
    updateSyncStatusIndicator,
    handleDisconnect,
    openFixedExpenseDialog,
    confirmDeleteFixedExpense,
    saveLoansToGoogle
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

    // Hamburger Menu triggers
    const btnHamburger = document.getElementById('btn-hamburger');
    if (btnHamburger) btnHamburger.addEventListener('click', () => showOverlay('sidebar-menu'));
    const btnSidebarClose = document.getElementById('btn-sidebar-close');
    if (btnSidebarClose) btnSidebarClose.addEventListener('click', () => hideOverlay('sidebar-menu'));
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            if (e.target === sidebar) {
                hideOverlay('sidebar-menu');
            }
        });
    }

    // Sidebar Tab Navigation
    const navDash = document.getElementById('sidebar-nav-dashboard');
    if (navDash) navDash.addEventListener('click', () => {
        switchTab('dashboard');
        hideOverlay('sidebar-menu');
    });
    const navTrans = document.getElementById('sidebar-nav-transactions');
    if (navTrans) navTrans.addEventListener('click', () => {
        switchTab('transactions');
        hideOverlay('sidebar-menu');
    });
    const navFixed = document.getElementById('sidebar-nav-fixed-expenses');
    if (navFixed) navFixed.addEventListener('click', () => {
        switchTab('fixed-expenses');
        hideOverlay('sidebar-menu');
    });
    const navLoans = document.getElementById('sidebar-nav-loans');
    if (navLoans) navLoans.addEventListener('click', () => {
        switchTab('loans');
        hideOverlay('sidebar-menu');
    });
    const navBau = document.getElementById('sidebar-nav-baukosten');
    if (navBau) navBau.addEventListener('click', () => {
        switchTab('baukosten');
        hideOverlay('sidebar-menu');
    });
    const navSettings = document.getElementById('sidebar-nav-settings');
    if (navSettings) navSettings.addEventListener('click', () => {
        openSettingsDialog();
        hideOverlay('sidebar-menu');
    });

    // Evaluation Filter listeners
    const filterSearch = document.getElementById('filter-search');
    if (filterSearch) filterSearch.addEventListener('input', renderFilterableTransactions);
    ['filter-year', 'filter-month', 'filter-category', 'filter-assigned', 'filter-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderFilterableTransactions);
    });

    // Fixed Expenses Filter listeners
    ['fixed-filter-month', 'fixed-filter-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderFixedExpenses);
    });

    // Transaction Details Close
    const btnDetailClose = document.getElementById('detail-btn-close');
    if (btnDetailClose) btnDetailClose.addEventListener('click', () => hideOverlay('transaction-detail-dialog'));

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

    // Fixed Expenses events
    const btnAddFixed = document.getElementById('btn-add-fixed-expense');
    if (btnAddFixed) btnAddFixed.addEventListener('click', () => openFixedExpenseDialog());
    const btnFixedClose = document.getElementById('fixed-dialog-btn-close');
    if (btnFixedClose) btnFixedClose.addEventListener('click', closeFixedExpenseDialog);
    const btnFixedCancel = document.getElementById('btn-fixed-dialog-cancel');
    if (btnFixedCancel) btnFixedCancel.addEventListener('click', closeFixedExpenseDialog);
    const fixedForm = document.getElementById('fixed-expense-form');
    if (fixedForm) fixedForm.addEventListener('submit', handleFixedExpenseSave);
    const btnFixedConfirmCancel = document.getElementById('btn-fixed-confirm-cancel');
    if (btnFixedConfirmCancel) btnFixedConfirmCancel.addEventListener('click', () => hideOverlay('fixed-confirm-dialog'));
    const btnFixedConfirmOk = document.getElementById('btn-fixed-confirm-ok');
    if (btnFixedConfirmOk) btnFixedConfirmOk.addEventListener('click', handleFixedExpenseDeleteConfirmed);

    // Loans events
    const loanSelector = document.getElementById('loan-selector');
    if (loanSelector) {
        loanSelector.addEventListener('change', (e) => {
            state.selectedLoanId = e.target.value;
            renderLoans();
        });
    }
    const btnAddSt = document.getElementById('btn-add-st');
    if (btnAddSt) btnAddSt.addEventListener('click', handleAddSondertilgung);

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
    updatePartnerDropdowns();

    // iOS-Tastatur-Handling für Bottom-Sheets initialisieren
    initKeyboardAvoidance();
}

// ==================== iOS TASTATUR-HANDLING FÜR BOTTOM-SHEETS ====================
//
// Idee: Statt das Sheet beim Fokussieren eines Feldes fullscreen zu machen (ruckartig,
// schwer zu kontrollieren), messen wir über die visualViewport-API die tatsächliche
// Höhe der eingeblendeten Tastatur und schieben NUR das aktuell offene Bottom-Sheet
// per CSS-Variable (--kb-shift) exakt um diese Höhe nach oben. Verschwindet die
// Tastatur wieder, liefert visualViewport automatisch kb-Höhe 0 und das Sheet
// rutscht dank CSS-Transition sanft zurück in seine Ausgangsposition.
function initKeyboardAvoidance() {
    const vv = window.visualViewport;

    function getActiveBottomSheet() {
        const overlay = document.querySelector('.dialog-overlay.active:not(.popup)');
        return overlay ? overlay.querySelector('.bottom-sheet') : null;
    }

    function applyKeyboardShift() {
        const sheet = getActiveBottomSheet();
        if (!sheet) {
            document.body.classList.remove('keyboard-active');
            return;
        }

        if (!vv) {
            // Kein visualViewport verfügbar (älterer Browser) -> keine Verschiebung möglich
            return;
        }

        // Tastaturhöhe = Layout-Viewport minus sichtbarem visuellen Viewport
        // (inkl. offsetTop, falls iOS die Seite zusätzlich verschoben hat)
        const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);

        if (keyboardHeight > 60) {
            sheet.style.setProperty('--kb-shift', `${keyboardHeight}px`);
            document.body.classList.add('keyboard-active');

            // Fokussiertes Feld innerhalb des Sheets sichtbar scrollen, NACHDEM
            // die Verschiebung angewendet wurde (Layout ist zu diesem Zeitpunkt final)
            const activeEl = document.activeElement;
            if (activeEl && sheet.contains(activeEl)) {
                requestAnimationFrame(() => {
                    activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
                });
            }
        } else {
            sheet.style.setProperty('--kb-shift', '0px');
            document.body.classList.remove('keyboard-active');
        }
    }

    if (vv) {
        vv.addEventListener('resize', applyKeyboardShift);
        vv.addEventListener('scroll', applyKeyboardShift);
    }

    // Beim Fokussieren eines Feldes in einem Bottom-Sheet direkt prüfen (deckt den Fall
    // ab, dass die Tastatur schon offen ist und nur das Feld wechselt, ohne resize-Event)
    document.addEventListener('focusin', (e) => {
        const tag = e.target.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;
        const sheet = e.target.closest('.bottom-sheet');
        if (!sheet) return;

        // Kurze Verzögerung, damit iOS Zeit hat, die Tastatur einzublenden,
        // bevor wir die Höhe messen (Tastatur-Animation ~250-300ms)
        setTimeout(applyKeyboardShift, 50);
        setTimeout(applyKeyboardShift, 350);
    });

    // Beim Verlassen des letzten Feldes zurücksetzen (visualViewport löst dies zwar
    // meist selbst aus, aber ein Fallback schadet nicht)
    document.addEventListener('focusout', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            const stillInSheet = activeEl && activeEl.closest && activeEl.closest('.bottom-sheet');
            if (!stillInSheet) {
                const sheet = getActiveBottomSheet();
                if (sheet) sheet.style.setProperty('--kb-shift', '0px');
                document.body.classList.remove('keyboard-active');
            }
        }, 100);
    });
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
    if (overlay) {
        overlay.classList.remove('active');
        // Verschiebung zurücksetzen, falls das Sheet mit offener Tastatur geschlossen wurde
        const sheet = overlay.querySelector('.bottom-sheet');
        if (sheet) sheet.style.setProperty('--kb-shift', '0px');
    }
    document.body.classList.remove('keyboard-active');

    // Reset page viewport scroll multiple times to avoid shifted/hidden header bug
    const handleViewportReset = () => {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
            window.scrollTo(0, 0);
        }
    };
    setTimeout(handleViewportReset, 50);
    setTimeout(handleViewportReset, 150);
    setTimeout(handleViewportReset, 300);
    setTimeout(handleViewportReset, 500);
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
    loadFixedExpensesFromLocal();
    loadLoansFromLocal();
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
        // 1. Transactions
        let data = await downloadFileContent(state.fileId);
        state.transactions = mergeTransactions(state.transactions || [], data || []);

        // 2. Fixed Expenses
        if (!state.fixedExpensesFileId) {
            state.fixedExpensesFileId = await searchFile('fixed_expenses.json');
            if (state.fixedExpensesFileId) localStorage.setItem('gdrive_fixed_expenses_file_id', state.fixedExpensesFileId);
        }
        if (state.fixedExpensesFileId) {
            state.fixedExpenses = await downloadFileContent(state.fixedExpensesFileId) || [];
        }

        // 3. Loans
        if (!state.loansFileId) {
            state.loansFileId = await searchFile('loans.json');
            if (state.loansFileId) localStorage.setItem('gdrive_loans_file_id', state.loansFileId);
        }
        if (state.loansFileId) {
            state.loans = await downloadFileContent(state.loansFileId) || [];
            // Run calculations for each loan
            state.loans.forEach(loan => updateSingleLoanCalculations(loan));
        }

        // 4. Baukosten (if file id cached)
        if (state.buildingCostsFileId) {
            state.buildingCosts = await downloadFileContent(state.buildingCostsFileId) || [];
        }

        // 5. Szenarieneinstellungen (Miete, Kategorien, Partnernamen)
        if (!state.scenarioSettingsFileId) {
            state.scenarioSettingsFileId = await searchFile('scenario_settings.json');
            if (state.scenarioSettingsFileId) {
                localStorage.setItem('gdrive_scenario_settings_file_id', state.scenarioSettingsFileId);
            }
        }
        if (state.scenarioSettingsFileId) {
            let settings = await downloadFileContent(state.scenarioSettingsFileId);
            if (settings) {
                state.scenarioSettings = settings;
                if (settings.BudgetCategories || settings.budgetCategories) {
                    state.budgetCategories = settings.BudgetCategories || settings.budgetCategories;
                }
                if (settings.Partner1Name || settings.partner1Name) {
                    state.partner1Name = settings.Partner1Name || settings.partner1Name;
                }
                if (settings.Partner2Name || settings.partner2Name) {
                    state.partner2Name = settings.Partner2Name || settings.partner2Name;
                }
            }
        }

        updateSyncStatusIndicator('connected', 'Google Drive');
        updateDataViews();
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        console.error("Drive Download Error:", err);
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

    const tabs = ['dashboard', 'transactions', 'fixed-expenses', 'loans', 'baukosten'];
    tabs.forEach(tab => {
        const navEl = document.getElementById(`sidebar-nav-${tab}`);
        if (navEl) navEl.classList.toggle('active', tabId === tab);

        const pageEl = document.getElementById(`tab-${tab}`);
        if (pageEl) pageEl.classList.toggle('active', tabId === tab);
    });

    const btnAdd = document.getElementById('btn-add-transaction');
    if (btnAdd) {
        btnAdd.style.display = (tabId === 'dashboard' || tabId === 'transactions') ? 'flex' : 'none';
    }

    if (tabId === 'baukosten') {
        loadBuildingCostsFromGoogle();
    } else {
        updateDataViews();
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

// ==================== FIXED EXPENSES GOOGLE SYNC ====================
async function saveFixedExpensesToGoogle() {
    if (!state.fixedExpensesFileId) {
        state.fixedExpensesFileId = await searchFile('fixed_expenses.json');
        if (!state.fixedExpensesFileId) {
            state.fixedExpensesFileId = await createFileInGoogle('fixed_expenses.json', state.fixedExpenses);
            if (state.fixedExpensesFileId) localStorage.setItem('gdrive_fixed_expenses_file_id', state.fixedExpensesFileId);
        }
    }

    if (!state.fixedExpensesFileId) return;

    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        let success = await uploadFileContent(state.fixedExpensesFileId, state.fixedExpenses);
        if (success) {
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error("Fehler beim Hochladen der Fixkosten.");
        }
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        console.error("Fixed Expenses Sync Error:", err);
    }
}

// ==================== LOANS GOOGLE SYNC ====================
async function saveLoansToGoogle() {
    if (!state.loansFileId) {
        state.loansFileId = await searchFile('loans.json');
        if (!state.loansFileId) {
            state.loansFileId = await createFileInGoogle('loans.json', state.loans);
            if (state.loansFileId) localStorage.setItem('gdrive_loans_file_id', state.loansFileId);
        }
    }

    if (!state.loansFileId) return;

    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        let success = await uploadFileContent(state.loansFileId, state.loans);
        if (success) {
            updateSyncStatusIndicator('connected', 'Google Drive');
            state.loans.forEach(loan => updateSingleLoanCalculations(loan));
            updateDataViews();
        } else {
            throw new Error("Fehler beim Hochladen der Kredite.");
        }
    } catch (err) {
        updateSyncStatusIndicator('local', 'Fehler');
        console.error("Loans Sync Error:", err);
    }
}

// ==================== FIXED EXPENSES CRUD HANDLERS ====================
function openFixedExpenseDialog(id = null) {
    state.editingFixedExpenseId = id;

    document.getElementById('fixed-field-title').value = '';
    document.getElementById('fixed-field-amount').value = '';
    document.getElementById('fixed-field-type').value = 'expense';
    document.getElementById('fixed-field-category').value = 'Sonstiges';
    document.getElementById('fixed-field-day').value = '1';
    document.getElementById('fixed-field-assigned').value = 'Gemeinsam';
    document.getElementById('fixed-field-notes').value = '';
    document.getElementById('fixed-field-startdate').value = '2026-07-01';

    if (id) {
        document.getElementById('fixed-dialog-title').textContent = "Fixkosten bearbeiten";
        const fe = state.fixedExpenses.find(f => (f.id || f.Id) === id);
        if (fe) {
            document.getElementById('fixed-field-title').value = fe.title || fe.Title || '';
            document.getElementById('fixed-field-amount').value = Math.abs(fe.amount || fe.Amount || 0);
            document.getElementById('fixed-field-type').value = (fe.isIncome || fe.IsIncome) ? 'income' : 'expense';
            document.getElementById('fixed-field-category').value = fe.category || fe.Category || 'Sonstiges';
            document.getElementById('fixed-field-day').value = fe.dayOfMonth || fe.DayOfMonth || 1;
            document.getElementById('fixed-field-assigned').value = fe.assignedTo || fe.AssignedTo || 'Gemeinsam';
            document.getElementById('fixed-field-notes').value = fe.notes || fe.Notes || '';

            let startDateVal = '2026-07-01';
            const rawStart = fe.startDate || fe.StartDate;
            if (rawStart) {
                const d = new Date(rawStart);
                if (!isNaN(d.getTime())) {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    startDateVal = `${yyyy}-${mm}-${dd}`;
                }
            }
            document.getElementById('fixed-field-startdate').value = startDateVal;
        }
    } else {
        document.getElementById('fixed-dialog-title').textContent = "Neue Fixkosten";
    }

    showOverlay('fixed-expense-dialog');
}

function closeFixedExpenseDialog() {
    hideOverlay('fixed-expense-dialog');
    state.editingFixedExpenseId = null;
}

function handleFixedExpenseSave(e) {
    e.preventDefault();

    const title = document.getElementById('fixed-field-title').value.trim();
    const amount = parseFloat(document.getElementById('fixed-field-amount').value);
    const type = document.getElementById('fixed-field-type').value;
    const category = document.getElementById('fixed-field-category').value;
    const dayOfMonth = parseInt(document.getElementById('fixed-field-day').value) || 1;
    const assignedTo = document.getElementById('fixed-field-assigned').value;
    const notes = document.getElementById('fixed-field-notes').value.trim();
    const startDateInput = document.getElementById('fixed-field-startdate').value;

    if (!title || isNaN(amount) || amount <= 0) {
        alert("Bitte füllen Sie alle Pflichtfelder korrekt aus.");
        return;
    }

    const isIncome = (type === 'income');
    const startDate = startDateInput ? new Date(startDateInput).toISOString() : new Date("2026-07-01").toISOString();

    if (state.editingFixedExpenseId) {
        const fe = state.fixedExpenses.find(f => (f.id || f.Id) === state.editingFixedExpenseId);
        if (fe) {
            fe.title = title;
            fe.amount = amount;
            fe.isIncome = isIncome;
            fe.category = category;
            fe.dayOfMonth = dayOfMonth;
            fe.assignedTo = assignedTo;
            fe.notes = notes;
            fe.startDate = startDate;

            fe.Title = title;
            fe.Amount = amount;
            fe.IsIncome = isIncome;
            fe.Category = category;
            fe.DayOfMonth = dayOfMonth;
            fe.AssignedTo = assignedTo;
            fe.Notes = notes;
            fe.StartDate = startDate;
        }
    } else {
        const newFe = {
            id: generateUUID(),
            title: title,
            amount: amount,
            isIncome: isIncome,
            category: category,
            dayOfMonth: dayOfMonth,
            assignedTo: assignedTo,
            notes: notes,
            startDate: startDate,
            StartDate: startDate
        };
        newFe.Id = newFe.id;
        newFe.Title = newFe.title;
        newFe.Amount = newFe.amount;
        newFe.IsIncome = newFe.isIncome;
        newFe.Category = newFe.category;
        newFe.DayOfMonth = newFe.dayOfMonth;
        newFe.AssignedTo = newFe.assignedTo;
        newFe.Notes = newFe.notes;

        state.fixedExpenses.push(newFe);
    }

    if (state.mode === 'google') {
        saveFixedExpensesToGoogle();
    } else {
        saveFixedExpensesToLocal();
        updateDataViews();
    }

    closeFixedExpenseDialog();
}

function confirmDeleteFixedExpense(id) {
    state.deletingFixedExpenseId = id;
    const fe = state.fixedExpenses.find(f => (f.id || f.Id) === id);
    if (fe) {
        const title = fe.title || fe.Title || '';
        const amt = fe.amount || fe.Amount || 0;
        document.getElementById('fixed-confirm-message').textContent = `Möchten Sie den Fixkosten-Eintrag "${title}" (${parseFloat(amt).toFixed(2)} €) wirklich löschen?`;
        showOverlay('fixed-confirm-dialog');
    }
}

function handleFixedExpenseDeleteConfirmed() {
    const id = state.deletingFixedExpenseId;
    if (id) {
        const idx = state.fixedExpenses.findIndex(f => (f.id || f.Id) === id);
        if (idx !== -1) {
            state.fixedExpenses.splice(idx, 1);
        }

        if (state.mode === 'google') {
            saveFixedExpensesToGoogle();
        } else {
            saveFixedExpensesToLocal();
            updateDataViews();
        }
    }
    hideOverlay('fixed-confirm-dialog');
    state.deletingFixedExpenseId = null;
}

// ==================== SONDERTILGUNG HANDLER ====================
function handleAddSondertilgung() {
    const yrInput = document.getElementById('add-st-year');
    const amtInput = document.getElementById('add-st-amount');
    if (!yrInput || !amtInput) return;

    const year = parseInt(yrInput.value);
    const amount = parseFloat(amtInput.value);

    if (isNaN(year) || year < 1 || isNaN(amount) || amount <= 0) {
        alert("Bitte geben Sie ein gültiges Jahr und einen Betrag ein.");
        return;
    }

    if (!state.selectedLoanId) {
        alert("Kein Kredit ausgewählt.");
        return;
    }

    const loan = state.loans.find(l => (l.id || l.Id) === state.selectedLoanId);
    if (!loan) return;

    if (!loan.oneTimeSondertilgungen && !loan.OneTimeSondertilgungen) {
        loan.oneTimeSondertilgungen = [];
    }
    const list = loan.oneTimeSondertilgungen || loan.OneTimeSondertilgungen;
    list.push({
        year: year,
        amount: amount,
        isApplied: true
    });

    yrInput.value = '';
    amtInput.value = '';

    if (state.mode === 'google') {
        saveLoansToGoogle();
    } else {
        saveLoansToLocal();
        renderLoans();
    }
}
