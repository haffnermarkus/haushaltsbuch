import { state, handleDisconnect } from './app.js';
import {
    DRIVE_DOCUMENT_TYPE_KEY,
    DRIVE_LOGICAL_NAME_KEY,
    DRIVE_NAMESPACE,
    DRIVE_NAMESPACE_KEY,
    LEGACY_DRIVE_APP_PROPERTY_KEY,
    getDriveAppProperties,
    getDriveFileType
} from './sync-utils.js';

export class DriveApiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = 'DriveApiError';
        this.status = status;
    }
}

async function throwDriveError(response, operation) {
    let details = '';
    try {
        const payload = await response.clone().json();
        details = payload?.error?.message || '';
    } catch (_) { /* response body is optional */ }
    throw new DriveApiError(`${operation} fehlgeschlagen (${response.status})${details ? `: ${details}` : ''}`, response.status);
}

// REST helper to contact Google API.
export async function apiCall(url, options = {}) {
    options.headers = { ...(options.headers || {}) };
    options.headers.Authorization = `Bearer ${state.accessToken}`;
    options.headers.Accept = 'application/json';

    const response = await fetch(url, options);
    if (response.status === 401) {
        alert('Sitzung abgelaufen. Bitte verbinden Sie sich erneut mit Google Drive.');
        handleDisconnect();
        throw new DriveApiError('Google-Drive-Sitzung abgelaufen.', 401);
    }
    return response;
}

function escapeDriveQueryValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listDriveFiles(query) {
    const params = new URLSearchParams({
        q: query,
        spaces: 'drive',
        pageSize: '10',
        fields: 'files(id,name,modifiedTime,appProperties)'
    });
    if (state.apiKey) params.set('key', state.apiKey);

    const response = await apiCall(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!response.ok) await throwDriveError(response, 'Google-Drive-Dateisuche');
    const data = await response.json();
    return Array.isArray(data.files) ? data.files : [];
}

const APP_FOLDER_NAME = 'Haushaltsbuch';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const folderPromises = new Map();

async function findOrCreateAppFolder() {
    const accountContext = String(state.accountContextId || '');
    if (!accountContext) throw new DriveApiError('Google-Drive-Kontokontext fehlt.');
    if (folderPromises.has(accountContext)) return folderPromises.get(accountContext);

    const operation = (async () => {
        const namespacedQuery = [
            `appProperties has { key='${DRIVE_NAMESPACE_KEY}' and value='${DRIVE_NAMESPACE}' }`,
            `appProperties has { key='${DRIVE_DOCUMENT_TYPE_KEY}' and value='folder' }`,
            `mimeType='${FOLDER_MIME_TYPE}'`,
            'trashed=false'
        ].join(' and ');
        const namespaced = await listDriveFiles(namespacedQuery);
        if (namespaced.length > 1) {
            throw new DriveApiError('Mehrere Haushaltsbuch-App-Ordner gefunden. Bitte Duplikate in Google Drive bereinigen.', 409);
        }
        if (namespaced.length === 1) return namespaced[0].id;

        const legacyQuery = `name='${APP_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
        const legacy = await listDriveFiles(legacyQuery);
        if (legacy.length > 1) {
            throw new DriveApiError('Mehrere Ordner namens „Haushaltsbuch“ gefunden. Eine eindeutige Zuordnung ist nicht möglich.', 409);
        }
        if (legacy.length === 1) {
            const response = await apiCall(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(legacy[0].id)}?fields=id`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appProperties: {
                        [DRIVE_NAMESPACE_KEY]: DRIVE_NAMESPACE,
                        [DRIVE_DOCUMENT_TYPE_KEY]: 'folder'
                    }
                })
            });
            if (!response.ok) await throwDriveError(response, 'Kennzeichnen des Haushaltsbuch-Ordners');
            return legacy[0].id;
        }

        const response = await apiCall('https://www.googleapis.com/drive/v3/files?fields=id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: APP_FOLDER_NAME,
                mimeType: FOLDER_MIME_TYPE,
                appProperties: {
                    [DRIVE_NAMESPACE_KEY]: DRIVE_NAMESPACE,
                    [DRIVE_DOCUMENT_TYPE_KEY]: 'folder'
                }
            })
        });
        if (!response.ok) await throwDriveError(response, 'Erstellen des Haushaltsbuch-Ordners');
        const folder = await response.json();
        if (!folder.id) throw new DriveApiError('Google Drive hat keine Ordner-ID geliefert.');
        return folder.id;
    })();

    folderPromises.set(accountContext, operation);
    try {
        return await operation;
    } catch (error) {
        folderPromises.delete(accountContext);
        throw error;
    }
}

async function tagDriveFile(fileId, fileName, documentType = 'json') {
    const response = await apiCall(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appProperties: getDriveAppProperties(fileName, documentType) })
    });
    if (!response.ok) await throwDriveError(response, 'Kennzeichnen der Google-Drive-Datei');
}

// Find exactly one app-owned file. Legacy name-only files are tagged on first use.
export async function searchFile(fileName) {
    if (!state.accessToken) return null;
    const fileType = getDriveFileType(fileName);
    const taggedQuery = [
        `appProperties has { key='${DRIVE_NAMESPACE_KEY}' and value='${DRIVE_NAMESPACE}' }`,
        `appProperties has { key='${DRIVE_LOGICAL_NAME_KEY}' and value='${escapeDriveQueryValue(fileName)}' }`,
        `appProperties has { key='${DRIVE_DOCUMENT_TYPE_KEY}' and value='json' }`,
        'trashed=false'
    ].join(' and ');
    const taggedFiles = await listDriveFiles(taggedQuery);
    if (taggedFiles.length > 1) {
        throw new DriveApiError(`Mehrere Haushaltsbuch-Dateien vom Typ „${fileType}“ gefunden. Bitte Duplikate in Google Drive bereinigen.`, 409);
    }
    if (taggedFiles.length === 1) return taggedFiles[0].id;

    // Migration from the first Web namespace used by versions before v21.
    const oldTaggedQuery = `appProperties has { key='${LEGACY_DRIVE_APP_PROPERTY_KEY}' and value='${escapeDriveQueryValue(fileType)}' } and trashed=false`;
    const oldTaggedFiles = await listDriveFiles(oldTaggedQuery);
    if (oldTaggedFiles.length > 1) {
        throw new DriveApiError(`Mehrere ältere Haushaltsbuch-Dateien vom Typ „${fileType}“ gefunden. Bitte Duplikate in Google Drive bereinigen.`, 409);
    }
    if (oldTaggedFiles.length === 1) {
        await tagDriveFile(oldTaggedFiles[0].id, fileName);
        return oldTaggedFiles[0].id;
    }

    const legacyQuery = `name='${escapeDriveQueryValue(fileName)}' and trashed=false`;
    const legacyFiles = await listDriveFiles(legacyQuery);
    if (legacyFiles.length > 1) {
        throw new DriveApiError(`Mehrere Dateien namens „${fileName}“ gefunden. Eine eindeutige Zuordnung ist nicht möglich.`, 409);
    }
    if (legacyFiles.length === 0) return null;

    await tagDriveFile(legacyFiles[0].id, fileName);
    return legacyFiles[0].id;
}

export async function getDriveAccountContext() {
    const response = await apiCall('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)');
    if (!response.ok) await throwDriveError(response, 'Ermitteln des Google-Drive-Kontos');
    const data = await response.json();
    const context = data?.user?.permissionId || data?.user?.emailAddress;
    if (!context) throw new DriveApiError('Google Drive hat keinen stabilen Kontokontext geliefert.');
    return String(context);
}

export async function downloadFileContent(fileId) {
    if (!fileId) return null;
    const response = await apiCall(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) await throwDriveError(response, 'Herunterladen der Google-Drive-Datei');
    try {
        return await response.json();
    } catch (_) {
        throw new DriveApiError('Die Google-Drive-Datei enthält kein gültiges JSON.', response.status);
    }
}

export async function uploadFileContent(fileId, contentObj) {
    if (!fileId) return false;
    const response = await apiCall(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contentObj)
    });
    if (!response.ok) await throwDriveError(response, 'Hochladen der Google-Drive-Datei');
    return true;
}

// Binary receipts use resumable uploads so mobile clients can safely upload larger files.
export async function uploadBinaryFile(fileName, blob, mimeType) {
    if (!(blob instanceof Blob) || blob.size === 0) return null;
    const folderId = await findOrCreateAppFolder();

    const initResponse = await apiCall(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,mimeType',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType
            },
            body: JSON.stringify({
                name: fileName,
                mimeType,
                parents: [folderId],
                appProperties: getDriveAppProperties(fileName, 'receipt')
            })
        }
    );
    if (!initResponse.ok) await throwDriveError(initResponse, `Erstellen der Upload-Session für ${fileName}`);

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) throw new DriveApiError(`Upload-Session für ${fileName} enthält keine Zieladresse.`);

    const response = await apiCall(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob
    });
    if (!response.ok) await throwDriveError(response, `Hochladen von ${fileName}`);

    const file = await response.json();
    if (!file.id) throw new DriveApiError(`Google Drive hat für ${fileName} keine Datei-ID geliefert.`);
    if (file.size !== undefined && Number(file.size) !== blob.size) {
        await deleteDriveFile(file.id);
        throw new DriveApiError(`Unvollständiger Upload von ${fileName}: ${file.size} statt ${blob.size} Bytes.`);
    }
    return file.id;
}

export async function downloadBinaryFile(fileId) {
    if (!fileId) return null;
    const response = await apiCall(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) await throwDriveError(response, 'Herunterladen des Belegs');
    return await response.blob();
}

export async function deleteDriveFile(fileId) {
    if (!fileId) return false;
    const response = await apiCall(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) await throwDriveError(response, 'Löschen des Belegs');
    return true;
}

export async function createFileInGoogle(fileName, contentObj) {
    const folderId = await findOrCreateAppFolder();
    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId],
        appProperties: getDriveAppProperties(fileName, 'json')
    };
    const boundary = `haushaltsbuch_${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const body = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(contentObj) +
        closeDelimiter;

    const response = await apiCall('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
    });
    if (!response.ok) await throwDriveError(response, `Erstellen von ${fileName}`);
    const file = await response.json();
    if (!file.id) throw new DriveApiError(`Google Drive hat für ${fileName} keine Datei-ID geliefert.`);
    return file.id;
}
