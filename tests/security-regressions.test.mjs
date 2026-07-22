import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const webRoot = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, webRoot), 'utf8');

test('PDF.js is current ESM and parsing disables eval', async () => {
    const [bundle, app] = await Promise.all([read('lib/pdf.min.js'), read('app.js')]);
    assert.match(bundle.slice(0, 2000), /pdfjsVersion = 6\.1\.200/);
    assert.match(app, /import\('\.\/lib\/pdf\.min\.js'\)/);
    assert.match(app, /isEvalSupported:\s*false/);
});

test('CSP blocks object embedding and unsafe eval', async () => {
    const html = await read('index.html');
    const csp = html.match(/Content-Security-Policy" content="([^"]+)/)?.[1] || '';
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com/);
    assert.doesNotMatch(csp, /unsafe-eval/);
});

test('service worker does not force activation or delete unrelated caches', async () => {
    const worker = await read('service-worker.js');
    const installBlock = worker.slice(worker.indexOf("addEventListener('install'"), worker.indexOf("addEventListener('activate'"));
    assert.doesNotMatch(installBlock, /skipWaiting\s*\(/);
    assert.match(worker, /name\.startsWith\(CACHE_PREFIX\)/);
});

test('Drive creation is app-tagged and new accounts are not demo-seeded', async () => {
    const [api, auth, syncUtils] = await Promise.all([read('api.js'), read('auth.js'), read('sync-utils.js')]);
    assert.match(api, /findOrCreateAppFolder/);
    assert.match(api, /parents:\s*\[folderId\]/);
    assert.match(syncUtils, /haushaltsbuchNamespace/);
    assert.match(syncUtils, /desktop-v1/);
    assert.match(auth, /auth\/drive\.file/);
    assert.doesNotMatch(auth, /auth\/drive['"]/);
    assert.match(auth, /createFileInGoogle\('transactions\.json', \[\]\)/);
    assert.doesNotMatch(auth, /SEED_DATA/);
});

test('invoice processing has upload, download, page and canvas limits', async () => {
    const app = await read('app.js');
    assert.match(app, /MAX_INVOICE_BYTES\s*=\s*25\s*\*\s*1024\s*\*\s*1024/);
    assert.match(app, /MAX_PDF_PREVIEW_PAGES\s*=\s*10/);
    assert.match(app, /MAX_PDF_CANVAS_PIXELS\s*=\s*16_000_000/);
    assert.match(app, /file\.size\s*>\s*MAX_INVOICE_BYTES/);
    assert.match(app, /blob\.size\s*>\s*MAX_INVOICE_BYTES/);
    assert.match(app, /const loadingTask = pdfjsLib\.getDocument/);
    assert.match(app, /await loadingTask\.destroy\(\)/);
});

test('accessibility permits zoom and privacy lists all synchronized data classes', async () => {
    const [html, privacy] = await Promise.all([read('index.html'), read('privacy.html')]);
    const viewport = html.match(/name="viewport" content="([^"]+)/)?.[1] || '';
    assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale=1/);
    for (const fileName of ['transactions.json', 'fixed_expenses.json', 'loans.json', 'building_costs.json', 'house_expenses.json', 'scenario_settings.json']) {
        assert.match(privacy, new RegExp(fileName.replace('.', '\\.')));
    }
    assert.match(privacy, /Fotos und PDFs/);
});

test('year filters are generated relative to the current year', async () => {
    const [html, app] = await Promise.all([read('index.html'), read('app.js')]);

    assert.doesNotMatch(html, /<option value="202[4-8]">202[4-8]<\/option>/);
    assert.match(app, /function populateYearSelectors\(\)/);
    assert.match(app, /currentYear - 10/);
    assert.match(app, /currentYear \+ 5/);
});
