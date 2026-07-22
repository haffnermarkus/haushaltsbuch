// Service Worker für die Haushaltsbuch-PWA.
const CACHE_PREFIX = 'haushaltsbuch-';
const CACHE_NAME = `${CACHE_PREFIX}v23`;

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './ui.js',
    './state.js',
    './sync-utils.js',
    './api.js',
    './auth.js',
    './lib/pdf.min.js',
    './lib/pdf.worker.min.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    // Do not call skipWaiting here: an old page and a new worker must never mix
    // incompatible module versions during an in-flight edit or sync.
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names
                    .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    const isGoogleApi = url.hostname === 'accounts.google.com'
        || url.hostname.endsWith('.googleapis.com')
        || url.hostname === 'googleapis.com';
    if (isGoogleApi) {
        event.respondWith(fetch(event.request));
        return;
    }

    if (url.origin !== self.location.origin) return;

    const refresh = fetch(event.request).then(response => {
        if (response.ok) {
            return caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, response.clone()))
                .then(() => response);
        }
        return response;
    });
    event.waitUntil(refresh.catch(() => undefined));
    event.respondWith(caches.match(event.request).then(cached => cached || refresh));
});

// Activation is only allowed after an explicit user-approved update flow.
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});
