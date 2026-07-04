import { state, handleDisconnect } from './app.js';

// REST helper to contact Google API
export async function apiCall(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    options.headers['Authorization'] = `Bearer ${state.accessToken}`;
    options.headers['Accept'] = 'application/json';
    
    let response = await fetch(url, options);
    if (response.status === 401) {
        alert("Sitzung abgelaufen. Bitte verbinden Sie sich erneut mit Google Drive.");
        handleDisconnect();
        return null;
    }
    return response;
}

// Search for a file by name in Google Drive
export async function searchFile(fileName) {
    if (!state.accessToken) return null;
    try {
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false${state.apiKey ? `&key=${state.apiKey}` : ''}`;
        let response = await apiCall(searchUrl);
        if (response && response.ok) {
            let data = await response.json();
            if (data.files && data.files.length > 0) {
                return data.files[0].id;
            }
        }
    } catch (err) {
        console.warn(`[Drive API] Fehler beim Suchen von ${fileName}:`, err);
    }
    return null;
}

// Download file content by ID
export async function downloadFileContent(fileId) {
    if (!fileId) return null;
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    let response = await apiCall(downloadUrl);
    if (response && response.ok) {
        return await response.json();
    }
    return null;
}

// Upload/overwrite file content by ID
export async function uploadFileContent(fileId, contentObj) {
    if (!fileId) return false;
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    let response = await apiCall(updateUrl, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(contentObj)
    });
    return response && response.ok;
}

// Create new file with content on Google Drive
export async function createFileInGoogle(fileName, contentObj) {
    try {
        const metadata = {
            name: fileName,
            mimeType: 'application/json'
        };
        
        const boundary = 'foo_bar_boundary';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        
        const body = 
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(contentObj) +
            closeDelimiter;

        let response = await apiCall('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: body
        });
        
        if (response && response.ok) {
            let file = await response.json();
            return file.id;
        }
    } catch (err) {
        console.error(`[Drive API] Fehler beim Erstellen von ${fileName}:`, err);
    }
    return null;
}
