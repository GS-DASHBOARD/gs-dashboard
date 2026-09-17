// Service worker de GS Campo -- Fase 1 de la app de campo offline (ver
// docs/modulo-activos-especificacion.md, sección 5). Alcance deliberado:
// cachea el shell de la app (HTML + libreria de Supabase) para que abra
// sin señal, y deja pasar directo a la red cualquier llamada a Supabase
// (nunca se cachea una respuesta de la API -- los datos offline los
// maneja campo.html por su cuenta via IndexedDB, no este service worker).
const CACHE_NAME = 'gs-campo-v1';
const SHELL = [
  './campo.html',
  './campo-manifest.json',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear Supabase (ni el API REST ni Auth) -- siempre red directa.
  // Si falla por estar offline, el error lo maneja campo.html (cola en
  // IndexedDB), no este service worker.
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

  // Shell de la app: cache-first, así abre instantáneo y funciona offline.
  event.respondWith(
    caches.match(event.request).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(event.request).then((respuesta) => {
        if (respuesta.ok && event.request.method === 'GET') {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return respuesta;
      });
    })
  );
});
