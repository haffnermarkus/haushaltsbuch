// Service Worker für Haushaltsbuch PWA
// Cacht App-Shell für Offline-Nutzung

const CACHE_NAME = 'haushaltsbuch-v19'; // v19: mobiler Beleg-Upload über Drive-Upload-Session

// Dateien die immer gecacht werden (App Shell)
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './ui.js',
    './state.js',
    './api.js',
    './auth.js',
    './lib/pdf.min.js',
    './lib/pdf.worker.min.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// ==================== INSTALL ====================
// Beim ersten Laden: App Shell in Cache schreiben
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] App Shell wird gecacht...');
            return cache.addAll(APP_SHELL);
        }).then(() => {
            // Sofort aktiv werden ohne auf alten SW zu warten
            return self.skipWaiting();
        })
    );
});

// ==================== ACTIVATE ====================
// Alte Cache-Versionen bereinigen
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Alter Cache wird gelöscht:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ==================== FETCH ====================
// Strategie: Cache First für App Shell, Network First für Google APIs
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Google APIs & Accounts: immer Netzwerk (kein Cache – OAuth-Flows)
    if (url.hostname.includes('google') || url.hostname.includes('googleapis')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Google Fonts: Netzwerk mit Cache-Fallback
    if (url.hostname.includes('fonts')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // App Shell: Cache First – sofort aus Cache, im Hintergrund aktualisieren
    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(response => {
                // Aktualisiertes File im Cache speichern
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached); // Offline: weiter aus Cache bedienen

            // Cached Version sofort zurückgeben, Netzwerk läuft im Hintergrund
            return cached || networkFetch;
        })
    );
});

// ==================== UPDATE NOTIFICATION ====================
// Clients benachrichtigen wenn neuer SW verfügbar
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
