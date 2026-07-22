import {
    state,
    showScreen,
    updateSyncStatusIndicator,
    bindDriveAccountContext,
    rememberDriveFileId,
    loadTransactionsFromGoogle,
    consumeLaunchAction
} from './app.js';
import { createFileInGoogle, getDriveAccountContext, searchFile } from './api.js';

export function createTokenClient(callback) {
    return google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        // Least-privilege access: only files created or explicitly opened with
        // this OAuth client are visible to the app.
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback
    });
}

export function tryAutoReconnect() {
    if (!state.clientId || !localStorage.getItem('gdrive_last_account_context')) return;

    try {
        const client = createTokenClient((response) => {
            if (response.error) {
                console.log('[Auth] Stilles Re-Auth fehlgeschlagen:', response.error);
                return;
            }
            void onAuthSuccess(response.access_token);
        });
        client.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        console.warn('[Auth] Auto-Reconnect nicht möglich:', error.message);
    }
}

export function handleGoogleConnect() {
    if (!state.clientId) {
        alert('Bitte konfigurieren Sie zuerst Ihre Google Client ID in den Einstellungen!');
        import('./app.js').then(app => app.openSettingsDialog());
        return;
    }

    try {
        const tokenClient = createTokenClient((response) => {
            if (response.error !== undefined) {
                alert(`Fehler bei Authentifizierung: ${response.error}`);
                return;
            }
            void onAuthSuccess(response.access_token);
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
        alert(`Google client error: ${error.message}`);
    }
}

export async function onAuthSuccess(accessToken) {
    state.mode = 'google';
    state.accessToken = accessToken;
    sessionStorage.setItem('gdrive_access_token', accessToken);

    showScreen('main-screen');
    updateSyncStatusIndicator('local', 'Verbinde Konto...');

    try {
        const accountContext = await getDriveAccountContext();
        bindDriveAccountContext(accountContext);

        updateSyncStatusIndicator('local', 'Suche Datei...');
        // Eine bereits kontogebunden gespeicherte bzw. ausdrücklich eingegebene
        // Datei-ID hat Vorrang. Das ist unter drive.file wichtig, weil nicht jede
        // freigegebene Datei über eine globale Namenssuche sichtbar ist.
        const foundId = state.fileId || await searchFile('transactions.json');
        rememberDriveFileId('transactions', foundId);

        if (!state.fileId) {
            updateSyncStatusIndicator('local', 'Erstelle Datei...');
            const newId = await createFileInGoogle('transactions.json', []);
            rememberDriveFileId('transactions', newId);
            state.transactions = [];
        }

        const loaded = await loadTransactionsFromGoogle();
        if (!loaded) return;
        updateSyncStatusIndicator('connected', 'Google Drive');
        consumeLaunchAction();
    } catch (error) {
        console.error('[Auth] Google-Drive-Verbindung fehlgeschlagen:', error);
        updateSyncStatusIndicator('local', 'Fehler');
        alert(`Google Drive konnte nicht verbunden werden: ${error.message}`);
    }
}
