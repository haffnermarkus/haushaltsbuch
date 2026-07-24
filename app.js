import {
    state,
    MONTH_NAMES,
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
    DEFAULT_FIXED_EXPENSE_START_DATE,
    CURRENT_FIXED_EXPENSE_START_DATE_SCHEMA_VERSION,
    ensureFixedExpenseStartDates,
    v,
    setV,
    isTransactionGeneratedByFixedExpense
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
    cloneJson,
    makeScopedStorageKey,
    mergeTransactions,
    nextPendingRecord
} from './sync-utils.js';

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
    openInvoicePreviewFor,
    bindDriveAccountContext,
    rememberDriveFileId,
    consumeLaunchAction
};

// ==================== PWA: SERVICE WORKER REGISTRIERUNG ====================
// Ein neuer Service Worker (nach einem Deploy) bleibt sonst dauerhaft im
// "waiting"-Zustand: der Browser aktiviert ihn erst, wenn ALLE Tabs/Instanzen
// der App vollständig geschlossen wurden. Bei einer als Homescreen-App
// geöffneten PWA auf dem Handy passiert das faktisch nie (die App wird nur in
// den Hintergrund gelegt, nicht beendet) — Updates (z.B. das neue Dashboard)
// kamen dadurch nie an. Deshalb hier aktiv nach Updates suchen und den
// wartenden Worker übernehmen lassen, sobald es sicher ist.
if ('serviceWorker' in navigator) {
    let registrationRef = null;
    let refreshingForUpdate = false;

    function isSafeToActivateUpdate() {
        if (document.querySelector('.overlay.active')) return false; // Dialog/Formular offen
        if (Object.keys(getPendingUploads()).length > 0) return false; // Sync noch nicht abgeschlossen
        return true;
    }

    function tryActivateWaitingWorker() {
        const waiting = registrationRef && registrationRef.waiting;
        if (!waiting || !isSafeToActivateUpdate()) return;
        waiting.postMessage('skipWaiting');
    }

    // Ein installierender Worker kann bereits VOR dem Anhängen dieses
    // Listeners fertig sein (schneller Server / schnelles Netz) —
    // 'updatefound' würde dann verpasst. Deshalb wird ein evtl. schon
    // laufender Installationsvorgang zusätzlich direkt verfolgt.
    function trackInstallingWorker(worker) {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                console.info('[PWA] Update heruntergeladen, wird aktiviert sobald sicher.');
                tryActivateWaitingWorker();
            }
        });
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                registrationRef = reg;
                console.log('[PWA] Service Worker registriert:', reg.scope);

                // Deckt alle drei möglichen Zustände beim Eintreffen hier ab:
                // Update bereits fertig und wartend, Update noch am Installieren,
                // oder noch kein Update bekannt (dann greift 'updatefound').
                tryActivateWaitingWorker();
                trackInstallingWorker(reg.installing);
                reg.addEventListener('updatefound', () => trackInstallingWorker(reg.installing));
            })
            .catch(err => console.warn('[PWA] Service Worker Fehler:', err));
    });

    // Übernimmt ein NEUER Service Worker (App-Update): einmal neu laden, damit
    // sofort die aktuellen Dateien laufen — sonst zeigt die PWA bis zum
    // übernächsten Start noch die alte Version aus dem Cache.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshingForUpdate) return;
        refreshingForUpdate = true;
        window.location.reload();
    });

    // Beim Zurückkehren aus dem Hintergrund (Handy-Homescreen) aktiv nach
    // einer neuen Version suchen und ein bereits wartendes Update aktivieren
    // — ohne das würde eine lange geöffnete PWA nie von selbst prüfen.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !registrationRef) return;
        tryActivateWaitingWorker();
        registrationRef.update().catch(() => undefined);
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

const DRIVE_FILE_IDS = Object.freeze({
    transactions: { stateKey: 'fileId', storageKey: 'gdrive_file_id' },
    fixedExpenses: { stateKey: 'fixedExpensesFileId', storageKey: 'gdrive_fixed_expenses_file_id' },
    loans: { stateKey: 'loansFileId', storageKey: 'gdrive_loans_file_id' },
    buildingCosts: { stateKey: 'buildingCostsFileId', storageKey: 'gdrive_building_costs_file_id' },
    houseExpenses: { stateKey: 'houseExpensesFileId', storageKey: 'gdrive_house_expenses_file_id' },
    scenarioSettings: { stateKey: 'scenarioSettingsFileId', storageKey: 'gdrive_scenario_settings_file_id' }
});

function getScopedFileIdKey(kind, accountContext = state.accountContextId) {
    const config = DRIVE_FILE_IDS[kind];
    if (!config) throw new Error(`Unbekannter Drive-Dateityp: ${kind}`);
    return makeScopedStorageKey(config.storageKey, accountContext);
}

function bindDriveAccountContext(accountContext) {
    const nextContext = String(accountContext || '');
    state.transactions = [];
    state.fixedExpenses = [];
    state.loans = [];
    state.buildingCosts = [];
    state.houseExpenses = [];
    state.scenarioSettings = {};
    state.budgetCategories = [];
    state.partner1Name = 'Markus';
    state.partner2Name = 'Maren';
    state.accountContextId = nextContext;
    if (!state.accountContextId) throw new Error('Google-Drive-Kontokontext fehlt.');
    sessionStorage.setItem('gdrive_account_context', state.accountContextId);
    localStorage.setItem('gdrive_last_account_context', state.accountContextId);

    Object.entries(DRIVE_FILE_IDS).forEach(([kind, config]) => {
        state[config.stateKey] = localStorage.getItem(getScopedFileIdKey(kind));
    });
}

function rememberDriveFileId(kind, fileId) {
    const config = DRIVE_FILE_IDS[kind];
    if (!config || !state.accountContextId) return;
    state[config.stateKey] = fileId || null;
    const key = getScopedFileIdKey(kind);
    if (fileId) localStorage.setItem(key, fileId);
    else localStorage.removeItem(key);
}

function clearCurrentDriveContext() {
    // Scoped IDs and pending snapshots intentionally remain recoverable for the
    // same account; only the active session and unsafe legacy keys are detached.
    Object.values(DRIVE_FILE_IDS).forEach(config => { state[config.stateKey] = null; });
    state.accountContextId = null;
    sessionStorage.removeItem('gdrive_account_context');
    localStorage.removeItem('gdrive_last_account_context');
    // Remove unsafe, unscoped keys left behind by older versions.
    Object.values(DRIVE_FILE_IDS).forEach(config => localStorage.removeItem(config.storageKey));
    localStorage.removeItem('pending_uploads');
}

// ==================== APP INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", async () => {
    populateYearSelectors();
    initUI();
    loadConfig();

    // Bereits eine aktive Session in diesem Tab? -> direkt laden
    const savedToken = sessionStorage.getItem('gdrive_access_token');
    const rememberedAccount = sessionStorage.getItem('gdrive_account_context') || localStorage.getItem('gdrive_last_account_context');
    if (savedToken) {
        await onAuthSuccess(savedToken);
    } else if (rememberedAccount) {
        showScreen('login-screen');
        waitForGisAndAutoReconnect();
    } else {
        showScreen('login-screen');
    }
});

function populateYearSelectors() {
    const currentYear = new Date().getFullYear();
    const firstYear = currentYear - 10;
    const lastYear = currentYear + 5;

    [
        { id: 'filter-year', includeAll: true },
        { id: 'fixed-filter-year', includeAll: true },
        { id: 'months-year', includeAll: false }
    ].forEach(({ id, includeAll }) => {
        const select = document.getElementById(id);
        if (!select) return;

        const previousValue = select.value;
        select.replaceChildren();

        if (includeAll) {
            const allOption = document.createElement('option');
            allOption.value = 'All';
            allOption.textContent = 'Alle';
            select.appendChild(allOption);
        }

        for (let year = firstYear; year <= lastYear; year++) {
            const option = document.createElement('option');
            option.value = String(year);
            option.textContent = String(year);
            select.appendChild(option);
        }

        const fallbackValue = includeAll ? 'All' : String(currentYear);
        select.value = Array.from(select.options).some(option => option.value === previousValue)
            ? previousValue
            : fallbackValue;
    });
}

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
        btnRefresh.addEventListener('click', async () => {
            if (state.mode === 'google') {
                try {
                    await loadTransactionsFromGoogle();
                } catch (error) {
                    alert(`Aktualisierung fehlgeschlagen: ${error.message}`);
                }
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
    consumeLaunchAction();
}

let launchActionConsumed = false;
function consumeLaunchAction() {
    if (launchActionConsumed || window.location.hash !== '#new') return false;
    const mainScreen = document.getElementById('main-screen');
    if (!mainScreen || !mainScreen.classList.contains('active')) return false;
    launchActionConsumed = true;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    openTransactionDialog();
    return true;
}

// ==================== GOOGLE DRIVE OPERATIONS ====================

function requireJsonArray(value, fileName) {
    if (!Array.isArray(value)) throw new Error(`${fileName} muss ein JSON-Array enthalten.`);
    return value;
}

function requireJsonObject(value, fileName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fileName} muss ein JSON-Objekt enthalten.`);
    }
    return value;
}

function applyScenarioSettings(settings) {
    const categories = settings.BudgetCategories || settings.budgetCategories;
    state.budgetCategories = Array.isArray(categories) ? categories : [];

    const normalizeName = (value, fallback) => {
        if (typeof value !== 'string') return fallback;
        const name = value.trim();
        return name && name.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(name) ? name : fallback;
    };
    state.partner1Name = normalizeName(settings.Partner1Name || settings.partner1Name, 'Markus');
    state.partner2Name = normalizeName(settings.Partner2Name || settings.partner2Name, 'Maren');
}

async function loadTransactionsFromGoogle() {
    if (!state.fileId) return false;

    const syncContext = captureSyncContext();
    if (!syncContext) return false;
    const previousData = {
        transactions: state.transactions,
        fixedExpenses: state.fixedExpenses,
        loans: state.loans,
        buildingCosts: state.buildingCosts,
        houseExpenses: state.houseExpenses,
        scenarioSettings: state.scenarioSettings,
        budgetCategories: state.budgetCategories,
        partner1Name: state.partner1Name,
        partner2Name: state.partner2Name
    };
    updateSyncStatusIndicator('local', 'Lade...');
    try {
        const pending = getPendingUploads();
        const localTransactions = pending.transactions
            ? requireJsonArray(cloneJson(pending.transactions.snapshot), 'Lokaler Transaktionsstand')
            : state.transactions || [];
        const remoteTransactions = requireJsonArray(await downloadFileContent(syncContext.fileContext), 'transactions.json');
        assertCurrentSyncContext(syncContext);

        const [fixedExpensesFileId, loansFileId, buildingCostsFileId, houseExpensesFileId, scenarioSettingsFileId] = await Promise.all([
            searchFile('fixed_expenses.json'),
            searchFile('loans.json'),
            searchFile('building_costs.json'),
            searchFile('house_expenses.json'),
            searchFile('scenario_settings.json')
        ]);
        assertCurrentSyncContext(syncContext);

        const readArray = async (kind, fileId, fileName) => {
            if (pending[kind]) return requireJsonArray(cloneJson(pending[kind].snapshot), `Lokaler Stand für ${fileName}`);
            if (!fileId) return [];
            return requireJsonArray(await downloadFileContent(fileId), fileName);
        };
        const readObject = async (kind, fileId, fileName) => {
            if (pending[kind]) return requireJsonObject(cloneJson(pending[kind].snapshot), `Lokaler Stand für ${fileName}`);
            if (!fileId) return {};
            return requireJsonObject(await downloadFileContent(fileId), fileName);
        };

        const [fixedExpenses, loans, buildingCosts, houseExpenses, scenarioSettings] = await Promise.all([
            readArray('fixedExpenses', fixedExpensesFileId, 'fixed_expenses.json'),
            readArray('loans', loansFileId, 'loans.json'),
            readArray('buildingCosts', buildingCostsFileId, 'building_costs.json'),
            readArray('houseExpenses', houseExpensesFileId, 'house_expenses.json'),
            readObject('scenarioSettings', scenarioSettingsFileId, 'scenario_settings.json')
        ]);
        assertCurrentSyncContext(syncContext);

        const fixedExpensesNeedMigration = ensureFixedExpenseStartDates(fixedExpenses);
        loans.forEach(loan => updateSingleLoanCalculations(loan));

        state.transactions = mergeTransactions(localTransactions, remoteTransactions);
        state.fixedExpenses = fixedExpenses;
        state.loans = loans;
        state.buildingCosts = buildingCosts;
        state.houseExpenses = houseExpenses;
        state.scenarioSettings = scenarioSettings;
        rememberDriveFileId('fixedExpenses', fixedExpensesFileId);
        rememberDriveFileId('loans', loansFileId);
        rememberDriveFileId('buildingCosts', buildingCostsFileId);
        rememberDriveFileId('houseExpenses', houseExpensesFileId);
        rememberDriveFileId('scenarioSettings', scenarioSettingsFileId);
        applyScenarioSettings(scenarioSettings);

        if (fixedExpensesNeedMigration) setPendingFlag('fixedExpenses', true);

        updateSyncStatusIndicator('connected', 'Google Drive');
        updateDataViews();

        // Offline vorgemerkte Änderungen jetzt hochladen
        await flushPendingUploads();
        consumeLaunchAction();
        return true;
    } catch (err) {
        if (!isCurrentSyncContext(syncContext)) {
            console.info('Veralteter Drive-Ladevorgang wurde nach einem Kontowechsel verworfen.');
            return false;
        }
        Object.assign(state, previousData);
        updateSyncStatusIndicator('local', 'Fehler');
        console.error("Drive Download Error:", err);
        throw err;
    }
}

async function saveTransactionsToGoogle({ stage = true } = {}) {
    const record = getPendingRecord('transactions', stage);
    if (!record) return true;
    const syncContext = captureSyncContext();
    if (!syncContext) {
        markOffline('transactions');
        return false;
    }

    return enqueueSave('transactions', syncContext, async () => {
        if (!isCurrentSyncContext(syncContext)) return false;
        updateSyncStatusIndicator('local', 'Synchronisiere...');
        try {
            const remoteTransactions = requireJsonArray(
                await downloadFileContent(syncContext.fileContext),
                'transactions.json'
            );
            assertCurrentSyncContext(syncContext);
            const merged = mergeTransactions(record.snapshot, remoteTransactions);

            const success = await uploadFileContent(syncContext.fileContext, merged);
            assertCurrentSyncContext(syncContext);
            if (!success) throw new Error('Fehler beim Hochladen auf Google Drive.');

            const wasLatest = clearPendingIfCurrent('transactions', record.revision);
            if (wasLatest) state.transactions = mergeTransactions(state.transactions, merged);
            const hasPending = Object.keys(getPendingUploads()).length > 0;
            updateSyncStatusIndicator(hasPending ? 'local' : 'connected', hasPending ? 'Ausstehend' : 'Google Drive');
            updateDataViews();
            return true;
        } catch (err) {
            if (!isCurrentSyncContext(syncContext)) {
                console.info('Veralteter Transaktions-Upload wurde nach einem Kontowechsel verworfen.');
                return false;
            }
            console.warn('Drive Sync fehlgeschlagen, Änderung wird lokal vorgemerkt:', err);
            markOffline('transactions');
            return false;
        }
    });
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
        if (state.mode !== 'google' || !state.accountContextId) {
            alert('Bitte zuerst das gewünschte Google-Drive-Konto verbinden, bevor Sie eine Datei-ID zuordnen.');
            return;
        }
        rememberDriveFileId('transactions', fileId);
        void loadTransactionsFromGoogle();
    }

    hideOverlay('settings-dialog');
    alert("Einstellungen erfolgreich gespeichert!");
}

function handleDisconnect() {
    clearCurrentDriveContext();
    state.accessToken = null;
    state.transactions = [];
    state.fixedExpenses = [];
    state.loans = [];
    state.buildingCosts = [];
    state.houseExpenses = [];
    state.scenarioSettings = {};
    state.budgetCategories = [];
    state.partner1Name = 'Markus';
    state.partner2Name = 'Maren';
    sessionStorage.removeItem('gdrive_access_token');

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

    const overviewYear = parseInt(document.getElementById('months-year')?.value, 10);
    const useOverviewContext = !id && state.activeTab === 'months';
    const targetYear = useOverviewContext && Number.isInteger(overviewYear) ? overviewYear : state.selectedYear;
    const targetMonth = useOverviewContext ? state.selectedOverviewMonth : state.selectedMonth;
    const activeYear = targetYear;
    const activeMonth = String(targetMonth).padStart(2, '0');
    const today = new Date();
    const day = (today.getMonth() + 1 === targetMonth && today.getFullYear() === targetYear)
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

async function handleTransactionSave(e) {
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
        await saveTransactionsToGoogle();
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

async function handleTransactionDeleteConfirmed() {
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
            await saveTransactionsToGoogle();
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
        rememberDriveFileId('buildingCosts', state.buildingCostsFileId);
    }

    listContainer.innerHTML = `<div class="loading-state">Lade Baukosten...</div>`;

    try {
        let data = await downloadFileContent(state.buildingCostsFileId);
        state.buildingCosts = data || [];
        renderBuildingCosts();
    } catch (err) {
        listContainer.innerHTML = `<div class="info-box" style="color:var(--color-expense)">Fehler beim Laden der Baukosten:<br>${escapeHtml(err.message)}</div>`;
    }
}

// ==================== FIXED EXPENSES GOOGLE SYNC ====================
async function saveFixedExpensesToGoogle(options = {}) {
    return saveJsonStateToGoogle('fixedExpenses', 'fixed_expenses.json', options);
}

// ==================== LOANS GOOGLE SYNC ====================
async function saveLoansToGoogle(options = {}) {
    return saveJsonStateToGoogle('loans', 'loans.json', {
        ...options,
        afterSuccess: () => state.loans.forEach(loan => updateSingleLoanCalculations(loan))
    });
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
    document.getElementById('fixed-field-startdate').value = DEFAULT_FIXED_EXPENSE_START_DATE;

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

            let startDateVal = DEFAULT_FIXED_EXPENSE_START_DATE;
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

async function handleFixedExpenseSave(e) {
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
    const startDate = new Date(startDateInput || DEFAULT_FIXED_EXPENSE_START_DATE).toISOString();
    let transactionsChanged = false;

    if (state.editingFixedExpenseId) {
        const fe = state.fixedExpenses.find(f => (f.id || f.Id) === state.editingFixedExpenseId);
        if (fe) {
            const generatedTransactions = state.transactions.filter(transaction =>
                !v(transaction, 'isDeleted') && isTransactionGeneratedByFixedExpense(transaction, fe));

            fe.title = title;
            fe.amount = amount;
            fe.isIncome = isIncome;
            fe.category = category;
            fe.dayOfMonth = dayOfMonth;
            fe.assignedTo = assignedTo;
            fe.notes = notes;
            fe.startDate = startDate;
            fe.startDateSchemaVersion = CURRENT_FIXED_EXPENSE_START_DATE_SCHEMA_VERSION;

            fe.Title = title;
            fe.Amount = amount;
            fe.IsIncome = isIncome;
            fe.Category = category;
            fe.DayOfMonth = dayOfMonth;
            fe.AssignedTo = assignedTo;
            fe.Notes = notes;
            fe.StartDate = startDate;
            fe.StartDateSchemaVersion = CURRENT_FIXED_EXPENSE_START_DATE_SCHEMA_VERSION;

            transactionsChanged = reconcileGeneratedFixedExpenseTransactions(fe, generatedTransactions);
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
            StartDate: startDate,
            startDateSchemaVersion: CURRENT_FIXED_EXPENSE_START_DATE_SCHEMA_VERSION,
            StartDateSchemaVersion: CURRENT_FIXED_EXPENSE_START_DATE_SCHEMA_VERSION
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
        await saveFixedExpensesToGoogle();
        if (transactionsChanged) await saveTransactionsToGoogle();
    } else {
        saveFixedExpensesToLocal();
        if (transactionsChanged) saveTransactionsToLocal();
        updateDataViews();
    }

    closeFixedExpenseDialog();
}

function reconcileGeneratedFixedExpenseTransactions(fixedExpense, transactions) {
    if (!transactions.length) return false;

    const start = new Date(v(fixedExpense, 'startDate'));
    const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const updatedAt = new Date().toISOString();

    transactions.forEach(transaction => {
        const transactionDate = new Date(v(transaction, 'date'));
        const transactionMonth = transactionDate.getUTCFullYear() * 12 + transactionDate.getUTCMonth();

        if (transactionMonth < startMonth) {
            setV(transaction, 'isDeleted', true);
            setV(transaction, 'updatedAt', updatedAt);
            return;
        }

        const year = transactionDate.getUTCFullYear();
        const month = transactionDate.getUTCMonth();
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const targetDay = Math.max(1, Math.min(parseInt(v(fixedExpense, 'dayOfMonth')) || 1, daysInMonth));

        setV(transaction, 'title', `${v(fixedExpense, 'title')} (Fixkosten)`);
        setV(transaction, 'amount', v(fixedExpense, 'amount'));
        setV(transaction, 'isIncome', !!v(fixedExpense, 'isIncome'));
        setV(transaction, 'category', v(fixedExpense, 'category'));
        setV(transaction, 'date', new Date(Date.UTC(year, month, targetDay)).toISOString());
        setV(transaction, 'notes', `Automatisch gebucht aus Fixkosten. ${v(fixedExpense, 'notes') || ''}`);
        setV(transaction, 'assignedTo', v(fixedExpense, 'assignedTo') || 'Gemeinsam');
        setV(transaction, 'fixedExpenseId', v(fixedExpense, 'id'));
        setV(transaction, 'updatedAt', updatedAt);
    });

    return true;
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

async function handleFixedExpenseDeleteConfirmed() {
    const id = state.deletingFixedExpenseId;
    if (id) {
        const idx = state.fixedExpenses.findIndex(f => (f.id || f.Id) === id);
        const fixedExpense = idx !== -1 ? state.fixedExpenses[idx] : null;
        let transactionsChanged = false;

        if (fixedExpense) {
            const deletedAt = new Date().toISOString();
            state.transactions.forEach(transaction => {
                if (!isTransactionGeneratedByFixedExpense(transaction, fixedExpense)) return;
                setV(transaction, 'isDeleted', true);
                setV(transaction, 'updatedAt', deletedAt);
                transactionsChanged = true;
            });
        }

        if (idx !== -1) {
            state.fixedExpenses.splice(idx, 1);
        }

        if (state.mode === 'google') {
            await saveFixedExpensesToGoogle();
            if (transactionsChanged) await saveTransactionsToGoogle();
        } else {
            saveFixedExpensesToLocal();
            if (transactionsChanged) saveTransactionsToLocal();
            updateDataViews();
        }
    }
    hideOverlay('fixed-confirm-dialog');
    state.deletingFixedExpenseId = null;
}

// ==================== SONDERTILGUNG HANDLER ====================
async function handleAddSondertilgung() {
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
        await saveLoansToGoogle();
    } else {
        saveLoansToLocal();
        renderLoans();
    }
}

// ==================== HAUSKOSTEN (CRUD + SYNC) ====================
async function saveHouseExpensesToGoogle(options = {}) {
    return saveJsonStateToGoogle('houseExpenses', 'house_expenses.json', options);
}

async function persistHouseExpenses() {
    if (state.mode === 'google') {
        await saveHouseExpensesToGoogle();
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

async function handleHouseExpenseSave(e) {
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

    await persistHouseExpenses();
    hideOverlay('hauskosten-dialog');
    state.editingHouseExpenseId = null;
}

async function handleHouseExpenseDelete() {
    const id = state.editingHouseExpenseId;
    if (!id) return;
    const idx = (state.houseExpenses || []).findIndex(h => (v(h, 'id')) === id);
    if (idx !== -1 && window.confirm('Diese Hauskosten-Position wirklich löschen?')) {
        state.houseExpenses.splice(idx, 1);
        await persistHouseExpenses();
        hideOverlay('hauskosten-dialog');
        state.editingHouseExpenseId = null;
    }
}

// ==================== BAUKOSTEN (CRUD + SYNC) ====================
const DEFAULT_BK_CATEGORIES = ['Planung', 'Grundstück', 'Rohbau', 'Ausbaustufe 1', 'Ausbaustufe 2', 'Ausbaustufe 3', 'Ausbaustufe 4', 'Einrichtung', 'Gartengestaltung'];

async function saveBuildingCostsToGoogle(options = {}) {
    return saveJsonStateToGoogle('buildingCosts', 'building_costs.json', options);
}

async function persistBuildingCosts() {
    if (state.mode === 'google') {
        await saveBuildingCostsToGoogle();
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
    select.replaceChildren();
    cats.forEach(category => select.add(new Option(String(category), String(category))));
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

async function handleBuildingCostSave(e) {
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

    await persistBuildingCosts();
    hideOverlay('baukosten-dialog');
    state.editingBuildingCostId = null;
}

async function handleBuildingCostDelete() {
    const id = state.editingBuildingCostId;
    if (!id) return;
    const idx = (state.buildingCosts || []).findIndex(b => (v(b, 'id')) === id);
    if (idx !== -1 && window.confirm('Diesen Baukosten-Eintrag wirklich löschen?')) {
        state.buildingCosts.splice(idx, 1);
        await persistBuildingCosts();
        hideOverlay('baukosten-dialog');
        state.editingBuildingCostId = null;
    }
}

// ==================== BELEG-FOTOS (BAUKOSTEN) ====================
// Foto vor dem Upload verkleinern (max. 1600px, JPEG) — spart Drive-Platz und Upload-Zeit.
const MAX_INVOICE_BYTES = 25 * 1024 * 1024;
const MAX_PDF_CANVAS_PIXELS = 16_000_000;
const MAX_PDF_PREVIEW_PAGES = 10;

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

async function persistInvoiceList() {
    if (!invoiceTarget) return;
    if (invoiceTarget.list === 'buildingCosts') {
        if (state.mode === 'google') await saveBuildingCostsToGoogle();
        else await persistBuildingCosts();
    } else if (invoiceTarget.list === 'transactions') {
        if (state.mode === 'google') await saveTransactionsToGoogle();
        else { saveTransactionsToLocal(); updateDataViews(); }
    } else if (invoiceTarget.list === 'fixedExpenses') {
        if (state.mode === 'google') await saveFixedExpensesToGoogle();
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
    } else if (v(item, 'invoicePath')) {
        // Alt-Beleg, der nur lokal am PC liegt (vor Einführung des Drive-Uploads
        // angehängt). Die Desktop-App lädt ihn beim nächsten Sync automatisch nach.
        statusEl.textContent = 'Beleg nur am PC verfügbar — wird beim nächsten PC-Sync hochgeladen.';
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

    if (file.size === 0 || file.size > MAX_INVOICE_BYTES) {
        alert('Belege müssen größer als 0 Byte und höchstens 25 MB groß sein.');
        return;
    }

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

        setV(item, 'invoiceDriveFileId', driveId);
        setV(item, 'invoiceFileName', fileName);
        // Sonst kann ein späterer Merge die neue Beleg-Verknüpfung mit dem
        // älteren Stand ohne Anhang überschreiben.
        setV(item, 'updatedAt', new Date().toISOString());
        await persistInvoiceList();

        // Erst nach erfolgreicher Verknüpfung löschen. Ein Fehler beim Aufräumen
        // darf den bereits sicher gespeicherten neuen Beleg nicht zurückrollen.
        if (oldId) {
            try {
                await deleteDriveFile(oldId);
            } catch (cleanupError) {
                console.warn('Alter Beleg konnte nicht gelöscht werden:', cleanupError);
            }
        }

        if (statusEl) statusEl.textContent = fileName;
        const btnView = document.getElementById(`btn-${prefix}-view-invoice`);
        if (btnView) btnView.style.display = 'block';
    } catch (err) {
        console.error('Beleg-Upload fehlgeschlagen:', err);
        if (statusEl) statusEl.textContent = 'Upload fehlgeschlagen — bitte erneut versuchen.';
    }
}

let currentInvoiceObjectUrl = null;

// PDF.js bei Bedarf nachladen (lokal aus /lib, wird vom Service Worker gecacht).
// iOS Safari zeigt PDFs in iframes/embeds nicht zuverlässig an — deshalb
// rendern wir die Seiten selbst auf Canvas-Elemente.
let pdfJsLoadPromise = null;
function loadPdfJs() {
    if (!pdfJsLoadPromise) {
        pdfJsLoadPromise = import('./lib/pdf.min.js')
            .then(pdfjsLib => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.js';
                return pdfjsLib;
            })
            .catch(error => {
                pdfJsLoadPromise = null;
                throw new Error(`PDF.js konnte nicht geladen werden: ${error.message}`);
            });
    }
    return pdfJsLoadPromise;
}

async function renderPdfPreview(blob) {
    if (!(blob instanceof Blob) || blob.size === 0 || blob.size > MAX_INVOICE_BYTES) {
        throw new Error('PDF ist leer oder größer als 25 MB.');
    }

    const pdfjsLib = await loadPdfJs();
    const container = document.getElementById('invoice-preview-pdf-pages');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'block';

    const data = new Uint8Array(await blob.arrayBuffer());
    if (data.length < 5 || String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') {
        throw new Error('Die Datei besitzt keinen gültigen PDF-Header.');
    }
    const loadingTask = pdfjsLib.getDocument({
        data,
        isEvalSupported: false,
        stopAtErrors: true,
        maxImageSize: MAX_PDF_CANVAS_PIXELS
    });
    const pdf = await loadingTask.promise;
    try {
        const pageCount = Math.min(pdf.numPages, MAX_PDF_PREVIEW_PAGES);
        const scrollBox = document.getElementById('invoice-preview-scroll');
        const targetWidth = Math.max(240, (scrollBox ? scrollBox.clientWidth : 360) - 8);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let p = 1; p <= pageCount; p++) {
            const page = await pdf.getPage(p);
            const baseViewport = page.getViewport({ scale: 1 });
            if (!Number.isFinite(baseViewport.width) || !Number.isFinite(baseViewport.height) || baseViewport.width <= 0 || baseViewport.height <= 0) {
                throw new Error(`PDF-Seite ${p} hat ungültige Abmessungen.`);
            }
            let scale = (targetWidth / baseViewport.width) * dpr;
            let viewport = page.getViewport({ scale });
            if (viewport.width * viewport.height > MAX_PDF_CANVAS_PIXELS) {
                scale *= Math.sqrt(MAX_PDF_CANVAS_PIXELS / (viewport.width * viewport.height));
                viewport = page.getViewport({ scale });
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            canvas.style.width = '100%';
            canvas.style.borderRadius = '8px';
            canvas.style.marginBottom = '8px';
            canvas.style.background = '#fff';

            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas-Kontext für die PDF-Vorschau ist nicht verfügbar.');
            await page.render({ canvasContext: context, viewport }).promise;
            container.appendChild(canvas);
        }

        if (pdf.numPages > pageCount) {
            const note = document.createElement('div');
            note.style.cssText = 'font-size:11px; color:var(--text-tertiary); padding:4px;';
            note.textContent = `... ${pdf.numPages - pageCount} weitere Seiten`;
            container.appendChild(note);
        }
    } finally {
        await loadingTask.destroy();
    }
}

async function isPdfInvoice(blob, fileName) {
    if ((fileName || '').toLowerCase().endsWith('.pdf')) return true;
    if ((blob.type || '').toLowerCase().split(';')[0] === 'application/pdf') return true;

    // Fallback für ältere Einträge ohne Dateinamen bzw. für Browser, die beim
    // Download keinen MIME-Typ mitliefern.
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    return header.length === 5
        && header[0] === 0x25 // %
        && header[1] === 0x50 // P
        && header[2] === 0x44 // D
        && header[3] === 0x46 // F
        && header[4] === 0x2D; // -
}

async function openInvoicePreview() {
    const item = resolveInvoiceItem();
    if (!item) return;
    const driveFileId = v(item, 'invoiceDriveFileId');
    if (!driveFileId) return;

    const fileName = v(item, 'invoiceFileName') || 'Beleg';

    const img = document.getElementById('invoice-preview-img');
    const pdfPages = document.getElementById('invoice-preview-pdf-pages');
    const loading = document.getElementById('invoice-preview-loading');
    const title = document.getElementById('invoice-preview-title');
    if (title) title.textContent = fileName;
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (pdfPages) { pdfPages.innerHTML = ''; pdfPages.style.display = 'none'; }
    if (loading) loading.style.display = 'block';

    showOverlay('invoice-preview-dialog');

    try {
        const blob = await downloadBinaryFile(driveFileId);
        if (!blob || blob.size === 0) throw new Error('Download fehlgeschlagen oder Datei ist leer');
        if (blob.size > MAX_INVOICE_BYTES) throw new Error('Der Beleg ist größer als 25 MB.');

        if (await isPdfInvoice(blob, fileName)) {
            await renderPdfPreview(blob);
        } else {
            if (currentInvoiceObjectUrl) URL.revokeObjectURL(currentInvoiceObjectUrl);
            currentInvoiceObjectUrl = URL.createObjectURL(blob);
            if (img) { img.src = currentInvoiceObjectUrl; img.style.display = 'block'; }
        }
    } catch (err) {
        console.error('Beleg-Vorschau fehlgeschlagen:', err);
        if (title) title.textContent = 'Beleg konnte nicht geladen werden.';
    } finally {
        if (loading) loading.style.display = 'none';
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
    setV(item, 'updatedAt', new Date().toISOString());
    await persistInvoiceList();

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
const PENDING_KEY = 'pending_uploads_v2';
const saveChains = new Map();

function captureSyncContext() {
    if (state.mode !== 'google' || !state.accessToken || !state.accountContextId || !state.fileId) return null;
    return Object.freeze({
        accountContext: String(state.accountContextId),
        fileContext: String(state.fileId)
    });
}

function isCurrentSyncContext(context) {
    return !!context
        && state.mode === 'google'
        && String(state.accountContextId || '') === context.accountContext
        && String(state.fileId || '') === context.fileContext;
}

function assertCurrentSyncContext(context) {
    if (!isCurrentSyncContext(context)) {
        throw new Error('Der Google-Drive-Kontext hat sich während der Synchronisierung geändert.');
    }
}

function getPendingStorageKey(accountContext = state.accountContextId, fileContext = state.fileId) {
    if (!accountContext) return null;
    return makeScopedStorageKey(PENDING_KEY, accountContext, fileContext || 'unbound');
}

function getPendingCopyKey(kind, accountContext = state.accountContextId, fileContext = state.fileId) {
    if (!accountContext) return null;
    return makeScopedStorageKey(`pending_copy_v2_${kind}`, accountContext, fileContext || 'unbound');
}

function getPendingUploads() {
    const key = getPendingStorageKey();
    if (!key) return {};
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value && typeof value === 'object' ? value : {};
    } catch (_) {
        return {};
    }
}

function writePendingUploads(pending) {
    const key = getPendingStorageKey();
    if (!key) throw new Error('Ausstehende Änderungen können keinem Drive-Konto zugeordnet werden.');
    if (Object.keys(pending).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(pending));
}

function setPendingFlag(kind, on, revision = null) {
    const pending = getPendingUploads();
    if (on) {
        const snapshot = cloneJson(state[kind] === undefined ? null : state[kind]);
        pending[kind] = nextPendingRecord(pending[kind], snapshot);
        const copyKey = getPendingCopyKey(kind);
        if (copyKey) localStorage.setItem(copyKey, JSON.stringify(snapshot));
    } else if (revision === null || Number(pending[kind]?.revision) === Number(revision)) {
        delete pending[kind];
        const copyKey = getPendingCopyKey(kind);
        if (copyKey) localStorage.removeItem(copyKey);
    }
    writePendingUploads(pending);
    return pending[kind] || null;
}

function persistLocalCopy(kind) {
    const key = getPendingCopyKey(kind);
    if (key) localStorage.setItem(key, JSON.stringify(state[kind] === undefined ? null : state[kind]));
}

function markOffline(kind) {
    if (state.accountContextId) {
        persistLocalCopy(kind);
        if (!getPendingUploads()[kind]) setPendingFlag(kind, true);
    }
    updateSyncStatusIndicator('local', 'Offline – ausstehend');
    updateDataViews();
}

function getPendingRecord(kind, stage = true) {
    return stage ? setPendingFlag(kind, true) : getPendingUploads()[kind] || null;
}

function clearPendingIfCurrent(kind, revision) {
    const current = getPendingUploads()[kind];
    if (Number(current?.revision) !== Number(revision)) return false;
    setPendingFlag(kind, false, revision);
    return true;
}

function enqueueSave(kind, context, task) {
    const chainKey = `${context.accountContext}::${context.fileContext}::${kind}`;
    const previous = saveChains.get(chainKey) || Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    saveChains.set(chainKey, current);
    return current.finally(() => {
        if (saveChains.get(chainKey) === current) saveChains.delete(chainKey);
    });
}

async function ensureDriveDataFile(kind, fileName, initialContent, syncContext) {
    assertCurrentSyncContext(syncContext);
    const config = DRIVE_FILE_IDS[kind];
    let fileId = config ? state[config.stateKey] : null;
    if (!fileId) {
        fileId = await searchFile(fileName);
        assertCurrentSyncContext(syncContext);
        if (fileId) rememberDriveFileId(kind, fileId);
    }
    if (fileId) return { fileId, created: false };

    assertCurrentSyncContext(syncContext);
    fileId = await createFileInGoogle(fileName, initialContent);
    assertCurrentSyncContext(syncContext);
    rememberDriveFileId(kind, fileId);
    return { fileId, created: true };
}

async function saveJsonStateToGoogle(kind, fileName, { stage = true, afterSuccess = null } = {}) {
    const record = getPendingRecord(kind, stage);
    if (!record) return true;
    const syncContext = captureSyncContext();
    if (!syncContext) {
        markOffline(kind);
        return false;
    }

    return enqueueSave(kind, syncContext, async () => {
        if (!isCurrentSyncContext(syncContext)) return false;
        updateSyncStatusIndicator('local', 'Synchronisiere...');
        try {
            const snapshot = cloneJson(record.snapshot);
            const { fileId, created } = await ensureDriveDataFile(kind, fileName, snapshot, syncContext);
            if (!created) {
                assertCurrentSyncContext(syncContext);
                await uploadFileContent(fileId, snapshot);
            }
            assertCurrentSyncContext(syncContext);
            const wasLatest = clearPendingIfCurrent(kind, record.revision);
            if (wasLatest && afterSuccess) afterSuccess(snapshot);
            updateSyncStatusIndicator(Object.keys(getPendingUploads()).length ? 'local' : 'connected', Object.keys(getPendingUploads()).length ? 'Ausstehend' : 'Google Drive');
            updateDataViews();
            return true;
        } catch (error) {
            if (!isCurrentSyncContext(syncContext)) {
                console.info(`Veralteter ${kind}-Upload wurde nach einem Kontowechsel verworfen.`);
                return false;
            }
            console.warn(`${kind} Sync fehlgeschlagen, wird vorgemerkt:`, error);
            markOffline(kind);
            return false;
        }
    });
}

export async function flushPendingUploads() {
    if (state.mode !== 'google' || !state.accessToken || !navigator.onLine) return;
    const pending = getPendingUploads();
    const kinds = Object.keys(pending);
    if (kinds.length === 0) return;

    updateSyncStatusIndicator('local', 'Hole Sync nach...');
    for (const kind of kinds) {
        try {
            if (kind === 'transactions') await saveTransactionsToGoogle({ stage: false });
            else if (kind === 'fixedExpenses') await saveFixedExpensesToGoogle({ stage: false });
            else if (kind === 'loans') await saveLoansToGoogle({ stage: false });
            else if (kind === 'houseExpenses') await saveHouseExpensesToGoogle({ stage: false });
            else if (kind === 'buildingCosts') await saveBuildingCostsToGoogle({ stage: false });
            else if (kind === 'scenarioSettings') await saveScenarioSettingsToGoogle({ stage: false });
        } catch (e) {
            console.warn(`Nachholen von ${kind} fehlgeschlagen, bleibt in der Warteschlange.`, e);
        }
    }
}

// ==================== SZENARIO-EINSTELLUNGEN ====================
let scenarioSaveTimer = null;

async function saveScenarioSettingsToGoogle(options = {}) {
    const syncSuccess = await saveJsonStateToGoogle('scenarioSettings', 'scenario_settings.json', options);
    const syncStatusEl = document.getElementById('sc-save-status');
    if (syncStatusEl) {
        syncStatusEl.textContent = syncSuccess
            ? `Gespeichert ${new Date().toLocaleTimeString('de-DE')}`
            : 'Offline gespeichert — wird nachsynchronisiert';
    }
    return syncSuccess;
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

    if (state.mode === 'google') setPendingFlag('scenarioSettings', true);

    clearTimeout(scenarioSaveTimer);
    scenarioSaveTimer = setTimeout(async () => {
        if (state.mode === 'google') {
            await saveScenarioSettingsToGoogle({ stage: false });
        } else {
            localStorage.setItem('local_scenario_settings', JSON.stringify(state.scenarioSettings));
            if (statusEl) statusEl.textContent = `Gespeichert ${new Date().toLocaleTimeString('de-DE')}`;
        }
    }, 800);
}
