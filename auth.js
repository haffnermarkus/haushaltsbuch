import { state, showScreen, updateSyncStatusIndicator, handleDisconnect } from './app.js';
import { searchFile, downloadFileContent, createFileInGoogle } from './api.js';
import { SEED_DATA } from './state.js';

// Erstellt den GIS Token Client und gibt ihn zurück
export function createTokenClient(callback) {
    return google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        scope: 'https://www.googleapis.com/auth/drive',
        callback: callback,
    });
}

// Versucht lautlos eine neue Session zu holen (ohne Popup wenn bereits eingeloggt)
export function tryAutoReconnect() {
    if (!state.clientId) return;
    const savedFileId = localStorage.getItem('gdrive_file_id');
    if (!savedFileId) return;

    try {
        const client = createTokenClient((response) => {
            if (response.error) {
                console.log('[Auth] Stilles Re-Auth fehlgeschlagen:', response.error);
                return;
            }
            onAuthSuccess(response.access_token, savedFileId);
        });
        client.requestAccessToken({ prompt: 'none' });
    } catch (e) {
        console.warn('[Auth] Auto-Reconnect nicht möglich:', e.message);
    }
}

// Wird beim Klick auf "Mit Google Drive verbinden" aufgerufen
export function handleGoogleConnect() {
    if (!state.clientId) {
        alert("Bitte konfigurieren Sie zuerst Ihre Google Client ID in den Einstellungen!");
        import('./app.js').then(app => app.openSettingsDialog());
        return;
    }

    try {
        const tokenClient = createTokenClient((response) => {
            if (response.error !== undefined) {
                alert(`Fehler bei Authentifizierung: ${response.error}`);
                return;
            }
            onAuthSuccess(response.access_token, localStorage.getItem('gdrive_file_id'));
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
        alert(`Google client error: ${e.message}`);
    }
}

// Gemeinsame Logik nach erfolgreicher Authentifizierung
export async function onAuthSuccess(accessToken, existingFileId) {
    state.mode = 'google';
    state.accessToken = accessToken;
    sessionStorage.setItem('gdrive_access_token', accessToken);

    showScreen('main-screen');
    updateSyncStatusIndicator('connected', 'Google Drive');

    state.buildingCostsFileId = localStorage.getItem('gdrive_building_costs_file_id');

    // 1. Suche oder erstelle die Transaktionsdatei
    if (existingFileId) {
        state.fileId = existingFileId;
        import('./app.js').then(app => app.loadTransactionsFromGoogle());
    } else {
        updateSyncStatusIndicator('local', 'Suche Datei...');
        let foundId = await searchFile('transactions.json');
        if (foundId) {
            state.fileId = foundId;
            localStorage.setItem('gdrive_file_id', foundId);
            import('./app.js').then(app => app.loadTransactionsFromGoogle());
        } else {
            updateSyncStatusIndicator('local', 'Erstelle Datei...');
            let newId = await createFileInGoogle('transactions.json', SEED_DATA);
            if (newId) {
                state.fileId = newId;
                localStorage.setItem('gdrive_file_id', newId);
                state.transactions = SEED_DATA;
                updateSyncStatusIndicator('connected', 'Google Drive');
                import('./app.js').then(app => app.updateDataViews());
            } else {
                updateSyncStatusIndicator('local', 'Fehler');
                alert("Fehler beim Erstellen der Transaktionsdatei.");
            }
        }
    }

    // 2. Suche Baukosten-Datei
    let bcId = await searchFile('building_costs.json');
    if (bcId) {
        state.buildingCostsFileId = bcId;
        localStorage.setItem('gdrive_building_costs_file_id', bcId);
    }

    // 4. Suche Fixkosten-Datei
    let feId = await searchFile('fixed_expenses.json');
    if (feId) {
        state.fixedExpensesFileId = feId;
        localStorage.setItem('gdrive_fixed_expenses_file_id', feId);
    }

    // 5. Suche Kredite-Datei
    let loansId = await searchFile('loans.json');
    if (loansId) {
        state.loansFileId = loansId;
        localStorage.setItem('gdrive_loans_file_id', loansId);
    }

    // 3. Suche und lade Szenarieneinstellungen (Kategorien & Partnernamen)
    let settingsId = await searchFile('scenario_settings.json');
    if (settingsId) {
        state.scenarioSettingsFileId = settingsId;
        localStorage.setItem('gdrive_scenario_settings_file_id', settingsId);
        let settings = await downloadFileContent(settingsId);
        if (settings) {
            state.scenarioSettings = settings;
            if (settings.BudgetCategories || settings.budgetCategories) {
                state.budgetCategories = settings.BudgetCategories || settings.budgetCategories;
                console.log('[Auth] Dynamische Kategorien geladen:', state.budgetCategories);
            }
            if (settings.Partner1Name || settings.partner1Name) {
                state.partner1Name = settings.Partner1Name || settings.partner1Name;
            }
            if (settings.Partner2Name || settings.partner2Name) {
                state.partner2Name = settings.Partner2Name || settings.partner2Name;
            }
            console.log('[Auth] Partnernamen geladen:', state.partner1Name, 'und', state.partner2Name);
            
            // Aktualisiere das Dropdown und die Views im HTML falls geladen
            import('./ui.js').then(ui => {
                ui.populateCategoryDropdown();
                ui.updatePartnerDropdowns();
                ui.updateDataViews();
            });
        }
    }
}
