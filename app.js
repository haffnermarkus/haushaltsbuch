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
    updateSingleLoanCalculations,
    loadHouseExpensesFromLocal,
    saveHouseExpensesToLocal,
    getDefaultHouseExpenses,
    v,
    setV
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
    createFileInGoogle,
    uploadBinaryFile,
    downloadBinaryFile,
    deleteDriveFile
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
    saveLoansToGoogle,
    openHouseExpenseDialog,
    openBuildingCostDialog,
    openInvoicePreviewFor
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
    const navMonths = document.getElementById('sidebar-nav-months');
    if (navMonths) navMonths.addEventListener('click', () => {
        switchTab('months');
        hideOverlay('sidebar-menu');
    });
    const navHaus = document.getElementById('sidebar-nav-hauskosten');
    if (navHaus) navHaus.addEventListener('click', () => {
        switchTab('hauskosten');
        hideOverlay('sidebar-menu');
    });
    const navSzenarien = document.getElementById('sidebar-nav-szenarien');
    if (navSzenarien) navSzenarien.addEventListener('click', () => {
        switchTab('szenarien');
        hideOverlay('sidebar-menu');
    });

    // Monatsübersicht: Jahr/Person-Filter
    ['months-year', 'months-partner'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => updateDataViews());
    });

    // Hauskosten-Dialog
    const btnAddHk = document.getElementById('btn-add-hauskosten');
    if (btnAddHk) btnAddHk.addEventListener('click', () => openHouseExpenseDialog());
    const btnHkClose = document.getElementById('hk-dialog-btn-close');
    if (btnHkClose) btnHkClose.addEventListener('click', () => hideOverlay('hauskosten-dialog'));
    const btnHkCancel = document.getElementById('btn-hk-cancel');
    if (btnHkCancel) btnHkCancel.addEventListener('click', () => hideOverlay('hauskosten-dialog'));
    const hkForm = document.getElementById('hauskosten-form');
    if (hkForm) hkForm.addEventListener('submit', handleHouseExpenseSave);
    const btnHkDelete = document.getElementById('btn-hk-delete');
    if (btnHkDelete) btnHkDelete.addEventListener('click', handleHouseExpenseDelete);

    // Baukosten-Dialog
    const btnAddBk = document.getElementById('btn-add-baukosten');
    if (btnAddBk) btnAddBk.addEventListener('click', () => openBuildingCostDialog());
    const btnBkClose = document.getElementById('bk-dialog-btn-close');
    if (btnBkClose) btnBkClose.addEventListener('click', () => hideOverlay('baukosten-dialog'));
    const btnBkCancel = document.getElementById('btn-bk-cancel');
    if (btnBkCancel) btnBkCancel.addEventListener('click', () => hideOverlay('baukosten-dialog'));
    const bkForm = document.getElementById('baukosten-form');
    if (bkForm) bkForm.addEventListener('submit', handleBuildingCostSave);
    const btnBkDelete = document.getElementById('btn-bk-delete');
    if (btnBkDelete) btnBkDelete.addEventListener('click', handleBuildingCostDelete);
    const bkStatus = document.getElementById('bk-field-status');
    if (bkStatus) bkStatus.addEventListener('change', updateBkPaidFieldsVisibility);

    // Belege (Foto/PDF) — für Baukosten (bk), Buchungen (tx) und Fixkosten (fx)
    [['bk', 'buildingCosts'], ['tx', 'transactions'], ['fx', 'fixedExpenses']].forEach(([prefix]) => {
        const btnAttach = document.getElementById(`btn-${prefix}-attach`);
        const fileInput = document.getElementById(`${prefix}-invoice-file`);
        const btnView = document.getElementById(`btn-${prefix}-view-invoice`);
        if (btnAttach && fileInput) btnAttach.addEventListener('click', () => fileInput.click());
        if (fileInput) fileInput.addEventListener('change', handleInvoiceFileSelected);
        if (btnView) btnView.addEventListener('click', openInvoicePreview);
    });
    const btnInvClose = document.getElementById('btn-invoice-close');
    if (btnInvClose) btnInvClose.addEventListener('click', () => hideOverlay('invoice-preview-dialog'));
    const btnInvRemove = document.getElementById('btn-invoice-remove');
    if (btnInvRemove) btnInvRemove.addEventListener('click', handleInvoiceRemove);

    // Offline-Warteschlange: sobald wieder Netz da ist, ausstehende Uploads nachholen
    window.addEventListener('online', () => flushPendingUploads());

    // Szenarien: Änderungen übernehmen + speichern (debounced)
    ['sc-active', 'sc-housing', 'sc-rent', 'sc-split', 'sc-p1-income', 'sc-p2-income',
     'sc-baby', 'sc-custom-eg', 'sc-eg-amount', 'sc-kindergeld', 'sc-child-exp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', onScenarioSettingChanged);
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
    // (das gezielte Scrollen zum fokussierten Feld übernimmt der zentrale
    // focusin-Handler in initKeyboardAvoidance)
    initKeyboardAvoidance();
}

// ==================== iOS TASTATUR-HANDLING FÜR BOTTOM-SHEETS ====================
function initKeyboardAvoidance() {
    const vv = window.visualViewport;

    // Auf manchen iOS-Versionen ist der VisualViewport auch OHNE Tastatur
    // etwas kleiner als window.innerHeight (z. B. um den Home-Indicator).
    // Diesen konstanten Sockel messen wir als Baseline mit und ziehen ihn ab,
    // sonst schwebt das Sheet dauerhaft über dem unteren Rand.
    let kbBaseline = null;

    function applyViewportSize() {
        if (!vv) return;

        const raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        if (kbBaseline === null || raw < kbBaseline) {
            kbBaseline = raw; // kleinster je gemessener Wert = Zustand ohne Tastatur
        }

        let keyboardHeight = raw - kbBaseline;
        // Kleine Restwerte (Rundung, Inset-Artefakte) sind keine Tastatur.
        if (keyboardHeight < 80) keyboardHeight = 0;

        // CSS übernimmt die Positionierung: .bottom-sheet sitzt via
        // bottom: var(--kb-height) direkt über der Tastatur.
        document.documentElement.style.setProperty('--kb-height', `${Math.round(keyboardHeight)}px`);
        document.body.classList.toggle('keyboard-active', keyboardHeight > 0);
    }

    function scrollActiveFieldIntoView() {
        const activeEl = document.activeElement;
        if (!activeEl || !activeEl.closest) return;
        if (!activeEl.closest('.sheet-content, .popup-box')) return;

        requestAnimationFrame(() => {
            activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    if (vv) {
        vv.addEventListener('resize', () => {
            applyViewportSize();
            scrollActiveFieldIntoView();
        });
        vv.addEventListener('scroll', applyViewportSize);
        applyViewportSize();
    }

    document.addEventListener('focusin', (e) => {
        const tag = e.target.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;
        if (!e.target.closest('.sheet-content, .popup-box')) return;

        // Das fokussierte Feld nur so weit scrollen wie nötig ('nearest') —
        // mittiges Zentrieren oder Scrollen ans Formularende lässt sonst
        // unnötigen Leerraum zwischen Feldern und Tastatur entstehen.
        setTimeout(() => {
            e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 300);
    });

    // iOS scrollt beim Fokussieren gern das ganze Fenster – sofort zurücksetzen,
    // damit absolute Positionierung (Overlay/Sheet) stabil bleibt.
    window.addEventListener('scroll', () => {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
            window.scrollTo(0, 0);
        }
    }, { passive: true });
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
    }

    // Tastatur schließen, wenn der Dialog zugeht — sonst bleibt sie offen
    // und verdeckt den Inhalt dahinter.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    document.body.classList.remove('keyboard-active');
    document.documentElement.style.setProperty('--kb-height', '0px');

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
    loadHouseExpensesFromLocal();
    const savedBc = localStorage.getItem('local_building_costs');
    if (savedBc) {
        try { state.buildingCosts = JSON.parse(savedBc); } catch (e) { /* ignorieren */ }
    }
    // Szenario-Einstellungen lokal laden
    const savedSc = localStorage.getItem('local_scenario_settings');
    if (savedSc) {
        try { state.scenarioSettings = JSON.parse(savedSc); } catch (e) { state.scenarioSettings = {}; }
    }
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
        // Offline erfasste Änderungen zuerst aus dem lokalen Speicher holen,
        // damit sie in den Merge einfließen bzw. nicht überschrieben werden.
        const pending = getPendingUploads();
        if (pending.transactions) {
            const localCopy = localStorage.getItem('local_transactions');
            if (localCopy) {
                try { state.transactions = JSON.parse(localCopy); } catch (e) { /* ignorieren */ }
            }
        }

        let data = await downloadFileContent(state.fileId);
        state.transactions = mergeTransactions(state.transactions || [], data || []);

        if (!state.fixedExpensesFileId) {
            state.fixedExpensesFileId = await searchFile('fixed_expenses.json');
            if (state.fixedExpensesFileId) localStorage.setItem('gdrive_fixed_expenses_file_id', state.fixedExpensesFileId);
        }
        if (pending.fixedExpenses) {
            const localCopy = localStorage.getItem('local_fixed_expenses');
            if (localCopy) { try { state.fixedExpenses = JSON.parse(localCopy); } catch (e) {} }
        } else if (state.fixedExpensesFileId) {
            state.fixedExpenses = await downloadFileContent(state.fixedExpensesFileId) || [];
        }

        if (!state.loansFileId) {
            state.loansFileId = await searchFile('loans.json');
            if (state.loansFileId) localStorage.setItem('gdrive_loans_file_id', state.loansFileId);
        }
        if (pending.loans) {
            const localCopy = localStorage.getItem('local_loans');
            if (localCopy) { try { state.loans = JSON.parse(localCopy); } catch (e) {} }
            state.loans.forEach(loan => updateSingleLoanCalculations(loan));
        } else if (state.loansFileId) {
            state.loans = await downloadFileContent(state.loansFileId) || [];
            state.loans.forEach(loan => updateSingleLoanCalculations(loan));
        }

        if (!state.buildingCostsFileId) {
            state.buildingCostsFileId = await searchFile('building_costs.json');
            if (state.buildingCostsFileId) localStorage.setItem('gdrive_building_costs_file_id', state.buildingCostsFileId);
        }
        if (pending.buildingCosts) {
            const localCopy = localStorage.getItem('local_building_costs');
            if (localCopy) { try { state.buildingCosts = JSON.parse(localCopy); } catch (e) {} }
        } else if (state.buildingCostsFileId) {
            state.buildingCosts = await downloadFileContent(state.buildingCostsFileId) || [];
        }

        if (!state.houseExpensesFileId) {
            state.houseExpensesFileId = await searchFile('house_expenses.json');
            if (state.houseExpensesFileId) localStorage.setItem('gdrive_house_expenses_file_id', state.houseExpensesFileId);
        }
        if (pending.houseExpenses) {
            const localCopy = localStorage.getItem('local_house_expenses');
            if (localCopy) { try { state.houseExpenses = JSON.parse(localCopy); } catch (e) {} }
        } else if (state.houseExpensesFileId) {
            state.houseExpenses = await downloadFileContent(state.houseExpensesFileId) || [];
        }
        if (!state.houseExpenses || state.houseExpenses.length === 0) {
            // Wie am PC: leere Liste mit Standardpositionen vorbelegen
            state.houseExpenses = getDefaultHouseExpenses();
        }

        if (!state.scenarioSettingsFileId) {
            state.scenarioSettingsFileId = await searchFile('scenario_settings.json');
            if (state.scenarioSettingsFileId) {
                localStorage.setItem('gdrive_scenario_settings_file_id', state.scenarioSettingsFileId);
            }
        }
        if (pending.scenarioSettings) {
            const localCopy = localStorage.getItem('local_scenario_settings');
            if (localCopy) { try { state.scenarioSettings = JSON.parse(localCopy); } catch (e) {} }
        } else if (state.scenarioSettingsFileId) {
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

        // Offline vorgemerkte Änderungen jetzt hochladen
        flushPendingUploads();
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
            setPendingFlag('transactions', false);
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error("Fehler beim Hochladen auf Google Drive.");
        }
    } catch (err) {
        console.warn('Drive Sync fehlgeschlagen, Änderung wird lokal vorgemerkt:', err);
        markOffline('transactions');
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

    // Beleg-Bereich initialisieren (Foto/PDF via Drive)
    setupInvoiceSection('tx', 'transactions', id);

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

    const tabs = ['dashboard', 'transactions', 'months', 'fixed-expenses', 'loans', 'baukosten', 'hauskosten', 'szenarien'];
    tabs.forEach(tab => {
        const navEl = document.getElementById(`sidebar-nav-${tab}`);
        if (navEl) navEl.classList.toggle('active', tabId === tab);

        const pageEl = document.getElementById(`tab-${tab}`);
        if (pageEl) pageEl.classList.toggle('active', tabId === tab);
    });

    const btnAdd = document.getElementById('btn-add-transaction');
    if (btnAdd) {
        btnAdd.style.display = (tabId === 'dashboard' || tabId === 'transactions' || tabId === 'months') ? 'flex' : 'none';
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
        // Lokal-Modus: aus dem lokalen Speicher laden
        const saved = localStorage.getItem('local_building_costs');
        state.buildingCosts = saved ? JSON.parse(saved) : (state.buildingCosts || []);
        renderBuildingCosts();
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

    if (!state.fixedExpensesFileId) {
        markOffline('fixedExpenses');
        return;
    }

    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        let success = await uploadFileContent(state.fixedExpensesFileId, state.fixedExpenses);
        if (success) {
            setPendingFlag('fixedExpenses', false);
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error("Fehler beim Hochladen der Fixkosten.");
        }
    } catch (err) {
        console.warn("Fixed Expenses Sync fehlgeschlagen, wird vorgemerkt:", err);
        markOffline('fixedExpenses');
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

    if (!state.loansFileId) {
        markOffline('loans');
        return;
    }

    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        let success = await uploadFileContent(state.loansFileId, state.loans);
        if (success) {
            setPendingFlag('loans', false);
            updateSyncStatusIndicator('connected', 'Google Drive');
            state.loans.forEach(loan => updateSingleLoanCalculations(loan));
            updateDataViews();
        } else {
            throw new Error("Fehler beim Hochladen der Kredite.");
        }
    } catch (err) {
        console.warn("Loans Sync fehlgeschlagen, wird vorgemerkt:", err);
        markOffline('loans');
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

    // Beleg-Bereich initialisieren (Foto/PDF via Drive)
    setupInvoiceSection('fx', 'fixedExpenses', id);

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

// ==================== HAUSKOSTEN (CRUD + SYNC) ====================
async function saveHouseExpensesToGoogle() {
    if (!state.houseExpensesFileId) {
        state.houseExpensesFileId = await searchFile('house_expenses.json');
        if (!state.houseExpensesFileId) {
            state.houseExpensesFileId = await createFileInGoogle('house_expenses.json', state.houseExpenses);
            if (state.houseExpensesFileId) localStorage.setItem('gdrive_house_expenses_file_id', state.houseExpensesFileId);
        }
    }
    if (!state.houseExpensesFileId) {
        markOffline('houseExpenses');
        return;
    }

    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        const success = await uploadFileContent(state.houseExpensesFileId, state.houseExpenses);
        if (success) {
            setPendingFlag('houseExpenses', false);
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error('Fehler beim Hochladen der Hauskosten.');
        }
    } catch (err) {
        console.warn('House Expenses Sync fehlgeschlagen, wird vorgemerkt:', err);
        markOffline('houseExpenses');
    }
}

function persistHouseExpenses() {
    if (state.mode === 'google') {
        saveHouseExpensesToGoogle();
    } else {
        saveHouseExpensesToLocal();
        updateDataViews();
    }
}

function openHouseExpenseDialog(id = null) {
    state.editingHouseExpenseId = id;

    document.getElementById('hk-field-name').value = '';
    document.getElementById('hk-field-amount').value = '';
    document.getElementById('hk-field-category').value = 'Betriebskosten';
    document.getElementById('hk-field-notes').value = '';
    document.getElementById('btn-hk-delete').style.display = 'none';

    if (id) {
        document.getElementById('hk-dialog-title').textContent = 'Hauskosten bearbeiten';
        const item = (state.houseExpenses || []).find(h => (v(h, 'id')) === id);
        if (item) {
            document.getElementById('hk-field-name').value = v(item, 'name') || '';
            document.getElementById('hk-field-amount').value = parseFloat(v(item, 'amount') || 0);
            document.getElementById('hk-field-category').value = v(item, 'category') || 'Betriebskosten';
            document.getElementById('hk-field-notes').value = v(item, 'notes') || '';
            document.getElementById('btn-hk-delete').style.display = 'block';
        }
    } else {
        document.getElementById('hk-dialog-title').textContent = 'Neue Hauskosten-Position';
    }

    showOverlay('hauskosten-dialog');
}

function handleHouseExpenseSave(e) {
    e.preventDefault();

    const name = document.getElementById('hk-field-name').value.trim();
    const amount = parseFloat(document.getElementById('hk-field-amount').value);
    const category = document.getElementById('hk-field-category').value;
    const notes = document.getElementById('hk-field-notes').value.trim();

    if (!name || isNaN(amount) || amount < 0) {
        alert('Bitte Bezeichnung und einen gültigen Betrag angeben.');
        return;
    }

    if (state.editingHouseExpenseId) {
        const item = (state.houseExpenses || []).find(h => (v(h, 'id')) === state.editingHouseExpenseId);
        if (item) {
            setV(item, 'name', name);
            setV(item, 'amount', amount);
            setV(item, 'category', category);
            setV(item, 'notes', notes);
        }
    } else {
        state.houseExpenses.push({ id: generateUUID(), name, amount, category, notes });
    }

    persistHouseExpenses();
    hideOverlay('hauskosten-dialog');
    state.editingHouseExpenseId = null;
}

function handleHouseExpenseDelete() {
    const id = state.editingHouseExpenseId;
    if (!id) return;
    const idx = (state.houseExpenses || []).findIndex(h => (v(h, 'id')) === id);
    if (idx !== -1 && window.confirm('Diese Hauskosten-Position wirklich löschen?')) {
        state.houseExpenses.splice(idx, 1);
        persistHouseExpenses();
        hideOverlay('hauskosten-dialog');
        state.editingHouseExpenseId = null;
    }
}

// ==================== BAUKOSTEN (CRUD + SYNC) ====================
const DEFAULT_BK_CATEGORIES = ['Planung', 'Grundstück', 'Rohbau', 'Ausbaustufe 1', 'Ausbaustufe 2', 'Ausbaustufe 3', 'Ausbaustufe 4', 'Einrichtung', 'Gartengestaltung'];

async function saveBuildingCostsToGoogle() {
    if (!state.buildingCostsFileId) {
        state.buildingCostsFileId = await searchFile('building_costs.json');
        if (!state.buildingCostsFileId) {
            state.buildingCostsFileId = await createFileInGoogle('building_costs.json', state.buildingCosts);
            if (state.buildingCostsFileId) localStorage.setItem('gdrive_building_costs_file_id', state.buildingCostsFileId);
        }
    }
    if (!state.buildingCostsFileId) {
        markOffline('buildingCosts');
        return;
    }

    updateSyncStatusIndicator('local', 'Synchronisiere...');
    try {
        const success = await uploadFileContent(state.buildingCostsFileId, state.buildingCosts);
        if (success) {
            setPendingFlag('buildingCosts', false);
            updateSyncStatusIndicator('connected', 'Google Drive');
            updateDataViews();
        } else {
            throw new Error('Fehler beim Hochladen der Baukosten.');
        }
    } catch (err) {
        console.warn('Building Costs Sync fehlgeschlagen, wird vorgemerkt:', err);
        markOffline('buildingCosts');
    }
}

function persistBuildingCosts() {
    if (state.mode === 'google') {
        saveBuildingCostsToGoogle();
    } else {
        localStorage.setItem('local_building_costs', JSON.stringify(state.buildingCosts));
        updateDataViews();
    }
}

function populateBkCategoryDropdown() {
    const select = document.getElementById('bk-field-category');
    if (!select) return;
    const cats = [...DEFAULT_BK_CATEGORIES];
    (state.buildingCosts || []).forEach(b => {
        const c = v(b, 'category');
        if (c && !cats.includes(c)) cats.push(c);
    });
    select.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function updateBkPaidFieldsVisibility() {
    const isPaid = document.getElementById('bk-field-status').value === 'paid';
    document.getElementById('bk-field-paidby').closest('.form-group').style.opacity = isPaid ? '1' : '0.4';
    document.getElementById('bk-field-paydate').closest('.form-group').style.opacity = isPaid ? '1' : '0.4';
    document.getElementById('bk-field-paidby').disabled = !isPaid;
    document.getElementById('bk-field-paydate').disabled = !isPaid;
}

function openBuildingCostDialog(id = null) {
    state.editingBuildingCostId = id;
    populateBkCategoryDropdown();

    // Partnernamen in der Auswahl aktualisieren
    const paidBySelect = document.getElementById('bk-field-paidby');
    if (paidBySelect) {
        const p1 = paidBySelect.querySelector('option[value="Partner 1"]');
        if (p1) p1.textContent = state.partner1Name;
        const p2 = paidBySelect.querySelector('option[value="Partner 2"]');
        if (p2) p2.textContent = state.partner2Name;
    }

    const nameInput = document.getElementById('bk-field-name');
    nameInput.value = '';
    nameInput.readOnly = false;
    document.getElementById('bk-field-amount').value = '';
    document.getElementById('bk-field-status').value = 'open';
    document.getElementById('bk-field-paidby').value = 'Gemeinsam';
    document.getElementById('bk-field-paydate').value = new Date().toISOString().substring(0, 10);
    document.getElementById('btn-bk-delete').style.display = 'none';

    // Beleg-Bereich initialisieren (Foto/PDF via Drive)
    setupInvoiceSection('bk', 'buildingCosts', id);

    if (id) {
        document.getElementById('bk-dialog-title').textContent = 'Baukosten bearbeiten';
        const item = (state.buildingCosts || []).find(b => (v(b, 'id')) === id);
        if (item) {
            const category = v(item, 'category') || 'Planung';
            const name = v(item, 'name') || '';
            nameInput.value = name;
            document.getElementById('bk-field-amount').value = parseFloat(v(item, 'amount') || 0);
            document.getElementById('bk-field-category').value = category;
            document.getElementById('bk-field-status').value = v(item, 'isPaid') ? 'paid' : 'open';
            document.getElementById('bk-field-paidby').value = v(item, 'paidBy') || 'Gemeinsam';
            const pd = v(item, 'paymentDate');
            if (pd) {
                const d = new Date(pd);
                if (!isNaN(d.getTime())) document.getElementById('bk-field-paydate').value = d.toISOString().substring(0, 10);
            }

            // Grundstück-Positionen sind am PC berechnet/geschützt:
            // Steuer/Notar/Grundbuch nicht umbenennen, Grundstück nie löschen.
            const isCalculated = category === 'Grundstück' && !name.includes('Kaufpreis');
            nameInput.readOnly = isCalculated;
            document.getElementById('btn-bk-delete').style.display = category === 'Grundstück' ? 'none' : 'block';
        }
    } else {
        document.getElementById('bk-dialog-title').textContent = 'Neuer Baukosten-Eintrag';
    }

    updateBkPaidFieldsVisibility();
    showOverlay('baukosten-dialog');
}

function handleBuildingCostSave(e) {
    e.preventDefault();

    const name = document.getElementById('bk-field-name').value.trim();
    const amount = parseFloat(document.getElementById('bk-field-amount').value);
    const category = document.getElementById('bk-field-category').value;
    const isPaid = document.getElementById('bk-field-status').value === 'paid';
    const paidBy = document.getElementById('bk-field-paidby').value;
    const payDateStr = document.getElementById('bk-field-paydate').value;

    if (!name || isNaN(amount) || amount < 0) {
        alert('Bitte Bezeichnung und einen gültigen Betrag angeben.');
        return;
    }

    const paymentDate = isPaid && payDateStr ? new Date(payDateStr).toISOString() : null;

    if (state.editingBuildingCostId) {
        const item = (state.buildingCosts || []).find(b => (v(b, 'id')) === state.editingBuildingCostId);
        if (item) {
            setV(item, 'name', name);
            setV(item, 'amount', amount);
            setV(item, 'category', category);
            setV(item, 'isPaid', isPaid);
            setV(item, 'paidBy', paidBy);
            setV(item, 'paymentDate', paymentDate);
        }
    } else {
        state.buildingCosts.push({
            id: generateUUID(),
            name,
            amount,
            category,
            isPaid,
            paidBy,
            paymentDate
        });
    }

    persistBuildingCosts();
    hideOverlay('baukosten-dialog');
    state.editingBuildingCostId = null;
}

function handleBuildingCostDelete() {
    const id = state.editingBuildingCostId;
    if (!id) return;
    const idx = (state.buildingCosts || []).findIndex(b => (v(b, 'id')) === id);
    if (idx !== -1 && window.confirm('Diesen Baukosten-Eintrag wirklich löschen?')) {
        state.buildingCosts.splice(idx, 1);
        persistBuildingCosts();
        hideOverlay('baukosten-dialog');
        state.editingBuildingCostId = null;
    }
}

// ==================== BELEG-FOTOS (BAUKOSTEN) ====================
// Foto vor dem Upload verkleinern (max. 1600px, JPEG) — spart Drive-Platz und Upload-Zeit.
async function compressImage(file, maxDim = 1600, quality = 0.8) {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        return blob || file;
    } catch (e) {
        console.warn('Bild-Komprimierung fehlgeschlagen, Original wird verwendet:', e);
        return file;
    }
}

// Aktuelles Beleg-Ziel: welche Liste, welcher Eintrag, welches Dialog-Präfix
let invoiceTarget = null; // { prefix: 'bk'|'tx'|'fx', list: 'buildingCosts'|'transactions'|'fixedExpenses', id }

function resolveInvoiceItem() {
    if (!invoiceTarget) return null;
    return (state[invoiceTarget.list] || []).find(x => (v(x, 'id')) === invoiceTarget.id) || null;
}

function persistInvoiceList() {
    if (!invoiceTarget) return;
    if (invoiceTarget.list === 'buildingCosts') {
        persistBuildingCosts();
    } else if (invoiceTarget.list === 'transactions') {
        if (state.mode === 'google') saveTransactionsToGoogle();
        else { saveTransactionsToLocal(); updateDataViews(); }
    } else if (invoiceTarget.list === 'fixedExpenses') {
        if (state.mode === 'google') saveFixedExpensesToGoogle();
        else { saveFixedExpensesToLocal(); updateDataViews(); }
    }
}

// Beleg-Bereich eines Dialogs initialisieren (Buttons, Statustext, Ziel setzen)
function setupInvoiceSection(prefix, list, id) {
    invoiceTarget = id ? { prefix, list, id } : null;

    const group = document.getElementById(`${prefix}-invoice-group`);
    if (!group) return;
    const btnAttach = document.getElementById(`btn-${prefix}-attach`);
    const btnView = document.getElementById(`btn-${prefix}-view-invoice`);
    const statusEl = document.getElementById(`${prefix}-invoice-status`);

    const canAttach = state.mode === 'google' && !!id;
    btnAttach.disabled = !canAttach;
    btnView.style.display = 'none';

    if (!id) {
        statusEl.textContent = 'Eintrag zuerst speichern, dann Beleg anhängen.';
        return;
    }
    if (state.mode !== 'google') {
        statusEl.textContent = 'Belege sind nur im Google-Drive-Modus verfügbar.';
        return;
    }

    const item = resolveInvoiceItem();
    const driveFileId = item ? v(item, 'invoiceDriveFileId') : null;
    if (driveFileId) {
        btnView.style.display = 'block';
        statusEl.textContent = v(item, 'invoiceFileName') || 'Beleg vorhanden';
    } else {
        statusEl.textContent = 'Noch kein Beleg angehängt.';
    }
}

async function handleInvoiceFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // erneute Auswahl derselben Datei ermöglichen
    if (!file || !invoiceTarget || state.mode !== 'google') return;

    const item = resolveInvoiceItem();
    if (!item) return;

    const prefix = invoiceTarget.prefix;
    const statusEl = document.getElementById(`${prefix}-invoice-status`);
    if (statusEl) statusEl.textContent = 'Beleg wird hochgeladen...';

    try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const blob = isPdf ? file : await compressImage(file);
        const mime = isPdf ? 'application/pdf' : 'image/jpeg';
        const ext = isPdf ? 'pdf' : 'jpg';

        const rawName = v(item, 'name') || v(item, 'title') || 'beleg';
        const safeName = rawName.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').substring(0, 40);
        const fileName = `beleg_${safeName}_${new Date().toISOString().substring(0, 10)}.${ext}`;

        // Alten Beleg ersetzen
        const oldId = v(item, 'invoiceDriveFileId');

        const driveId = await uploadBinaryFile(fileName, blob, mime);
        if (!driveId) throw new Error('Upload fehlgeschlagen');

        if (oldId) {
            deleteDriveFile(oldId); // Aufräumen, Fehler unkritisch
        }

        setV(item, 'invoiceDriveFileId', driveId);
        setV(item, 'invoiceFileName', fileName);
        persistInvoiceList();

        if (statusEl) statusEl.textContent = fileName;
        const btnView = document.getElementById(`btn-${prefix}-view-invoice`);
        if (btnView) btnView.style.display = 'block';
    } catch (err) {
        console.error('Beleg-Upload fehlgeschlagen:', err);
        if (statusEl) statusEl.textContent = 'Upload fehlgeschlagen — bitte erneut versuchen.';
    }
}

let currentInvoiceObjectUrl = null;

async function openInvoicePreview() {
    const item = resolveInvoiceItem();
    if (!item) return;
    const driveFileId = v(item, 'invoiceDriveFileId');
    if (!driveFileId) return;

    const fileName = v(item, 'invoiceFileName') || 'Beleg';
    const isPdf = fileName.toLowerCase().endsWith('.pdf');

    const img = document.getElementById('invoice-preview-img');
    const pdfFrame = document.getElementById('invoice-preview-pdf');
    const title = document.getElementById('invoice-preview-title');
    if (title) title.textContent = fileName;
    if (img) { img.src = ''; img.style.display = isPdf ? 'none' : 'block'; }
    if (pdfFrame) { pdfFrame.src = 'about:blank'; pdfFrame.style.display = isPdf ? 'block' : 'none'; }

    showOverlay('invoice-preview-dialog');

    const blob = await downloadBinaryFile(driveFileId);
    if (!blob) {
        if (title) title.textContent = 'Beleg konnte nicht geladen werden.';
        return;
    }

    if (currentInvoiceObjectUrl) URL.revokeObjectURL(currentInvoiceObjectUrl);
    if (isPdf) {
        const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
        currentInvoiceObjectUrl = URL.createObjectURL(pdfBlob);
        if (pdfFrame) pdfFrame.src = currentInvoiceObjectUrl;
    } else {
        currentInvoiceObjectUrl = URL.createObjectURL(blob);
        if (img) img.src = currentInvoiceObjectUrl;
    }
}

// Beleg-Vorschau direkt aus einer Liste/Detailansicht heraus öffnen
function openInvoicePreviewFor(list, id) {
    const prefixMap = { buildingCosts: 'bk', transactions: 'tx', fixedExpenses: 'fx' };
    invoiceTarget = { prefix: prefixMap[list] || 'tx', list, id };
    openInvoicePreview();
}

async function handleInvoiceRemove() {
    const item = resolveInvoiceItem();
    if (!item) return;
    if (!window.confirm('Beleg wirklich löschen?')) return;

    const driveFileId = v(item, 'invoiceDriveFileId');
    if (driveFileId) {
        await deleteDriveFile(driveFileId);
    }
    setV(item, 'invoiceDriveFileId', null);
    setV(item, 'invoiceFileName', null);
    persistInvoiceList();

    hideOverlay('invoice-preview-dialog');
    const prefix = invoiceTarget ? invoiceTarget.prefix : null;
    if (prefix) {
        const btnView = document.getElementById(`btn-${prefix}-view-invoice`);
        if (btnView) btnView.style.display = 'none';
        const statusEl = document.getElementById(`${prefix}-invoice-status`);
        if (statusEl) statusEl.textContent = 'Noch kein Beleg angehängt.';
    }
}

// ==================== OFFLINE-WARTESCHLANGE ====================
// Schlägt ein Drive-Upload fehl (z. B. auf der Baustelle ohne Netz), werden die
// Daten lokal gesichert und beim nächsten Online-Gehen bzw. App-Start nachgeladen.
const PENDING_KEY = 'pending_uploads';

function getPendingUploads() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || {}; } catch (e) { return {}; }
}

function setPendingFlag(kind, on) {
    const pending = getPendingUploads();
    if (on) pending[kind] = true; else delete pending[kind];
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

function persistLocalCopy(kind) {
    switch (kind) {
        case 'transactions': saveTransactionsToLocal(); break;
        case 'fixedExpenses': saveFixedExpensesToLocal(); break;
        case 'loans': saveLoansToLocal(); break;
        case 'houseExpenses': saveHouseExpensesToLocal(); break;
        case 'buildingCosts': localStorage.setItem('local_building_costs', JSON.stringify(state.buildingCosts)); break;
        case 'scenarioSettings': localStorage.setItem('local_scenario_settings', JSON.stringify(state.scenarioSettings)); break;
    }
}

function markOffline(kind) {
    persistLocalCopy(kind);
    setPendingFlag(kind, true);
    updateSyncStatusIndicator('local', 'Offline – ausstehend');
    updateDataViews();
}

export async function flushPendingUploads() {
    if (state.mode !== 'google' || !state.accessToken || !navigator.onLine) return;
    const pending = getPendingUploads();
    const kinds = Object.keys(pending);
    if (kinds.length === 0) return;

    updateSyncStatusIndicator('local', 'Hole Sync nach...');
    for (const kind of kinds) {
        try {
            if (kind === 'transactions') await saveTransactionsToGoogle();
            else if (kind === 'fixedExpenses') await saveFixedExpensesToGoogle();
            else if (kind === 'loans') await saveLoansToGoogle();
            else if (kind === 'houseExpenses') await saveHouseExpensesToGoogle();
            else if (kind === 'buildingCosts') await saveBuildingCostsToGoogle();
            else if (kind === 'scenarioSettings') await saveScenarioSettingsToGoogle();
        } catch (e) {
            console.warn(`Nachholen von ${kind} fehlgeschlagen, bleibt in der Warteschlange.`, e);
        }
    }
}

// ==================== SZENARIO-EINSTELLUNGEN ====================
let scenarioSaveTimer = null;

async function saveScenarioSettingsToGoogle() {
    if (!state.scenarioSettingsFileId) {
        state.scenarioSettingsFileId = await searchFile('scenario_settings.json');
        if (!state.scenarioSettingsFileId) {
            state.scenarioSettingsFileId = await createFileInGoogle('scenario_settings.json', state.scenarioSettings);
            if (state.scenarioSettingsFileId) localStorage.setItem('gdrive_scenario_settings_file_id', state.scenarioSettingsFileId);
        }
    }
    if (!state.scenarioSettingsFileId) {
        markOffline('scenarioSettings');
        return;
    }

    try {
        const success = await uploadFileContent(state.scenarioSettingsFileId, state.scenarioSettings);
        const statusEl = document.getElementById('sc-save-status');
        if (success) {
            setPendingFlag('scenarioSettings', false);
            if (statusEl) statusEl.textContent = `Gespeichert ${new Date().toLocaleTimeString('de-DE')}`;
        } else {
            markOffline('scenarioSettings');
            if (statusEl) statusEl.textContent = 'Offline gespeichert — wird nachsynchronisiert';
        }
    } catch (err) {
        console.warn('Scenario Settings Sync fehlgeschlagen, wird vorgemerkt:', err);
        markOffline('scenarioSettings');
        const statusEl = document.getElementById('sc-save-status');
        if (statusEl) statusEl.textContent = 'Offline gespeichert — wird nachsynchronisiert';
    }
}

function onScenarioSettingChanged() {
    const s = state.scenarioSettings || (state.scenarioSettings = {});

    const num = (id, fallback) => {
        const val = parseFloat(document.getElementById(id).value);
        return isNaN(val) ? fallback : val;
    };

    setV(s, 'isScenarioModeActive', document.getElementById('sc-active').checked);
    setV(s, 'housingScenario', document.getElementById('sc-housing').value);
    setV(s, 'rentExpenseAmount', num('sc-rent', 850));
    setV(s, 'rentPartner1SharePercent', Math.min(100, Math.max(0, num('sc-split', 50))));
    setV(s, 'partner1Income', num('sc-p1-income', 2800));
    setV(s, 'partner2Income', num('sc-p2-income', 2000));
    setV(s, 'isBabyScenarioActive', document.getElementById('sc-baby').checked);
    setV(s, 'useCustomElterngeld', document.getElementById('sc-custom-eg').checked);
    if (document.getElementById('sc-custom-eg').checked) {
        setV(s, 'customElterngeldAmount', num('sc-eg-amount', 1300));
    }
    setV(s, 'kindergeldAmount', num('sc-kindergeld', 250));
    setV(s, 'childExpenses', num('sc-child-exp', 250));

    // Ansicht sofort aktualisieren, Speichern gebündelt
    updateDataViews();

    const statusEl = document.getElementById('sc-save-status');
    if (statusEl) statusEl.textContent = 'Speichere...';

    clearTimeout(scenarioSaveTimer);
    scenarioSaveTimer = setTimeout(() => {
        if (state.mode === 'google') {
            saveScenarioSettingsToGoogle();
        } else {
            localStorage.setItem('local_scenario_settings', JSON.stringify(state.scenarioSettings));
            if (statusEl) statusEl.textContent = `Gespeichert ${new Date().toLocaleTimeString('de-DE')}`;
        }
    }, 800);
}