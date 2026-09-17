// Service worker de GS Campo -- Fase 1 de la app de campo offline (ver
// docs/modulo-activos-especificacion.md, sección 5). Alcance deliberado:
// cachea el shell de la app (HTML + libreria de Supabase) para que abra
// sin señal, y deja pasar directo a la red cualquier llamada a Supabase
// (nunca se cachea una respuesta de la API -- los datos offline los
// maneja campo.html por su cuenta via IndexedDB, no este service worker).
// v2: el fetch handler original no filtraba por SHELL antes de cachear,
// así que cualquier navegador que haya abierto campo.html con la v1 puede
// tener el dashboard administrativo (portal.greenservicesg.com/) guardado
// en el cache viejo. Cambiar el nombre fuerza que el 'activate' de abajo
// (que ya borra cualquier cache con nombre distinto a CACHE_NAME) limpie
// ese cache viejo apenas el navegador actualice el service worker.
const CACHE_NAME = 'gs-campo-v2';
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

// Resuelve el SHELL contra la ubicación real del service worker (una sola
// vez, no en cada fetch) para poder comparar por URL absoluta exacta.
const SHELL_URLS = new Set(SHELL.map((ruta) => new URL(ruta, self.location.href).href));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear Supabase (ni el API REST ni Auth) -- siempre red directa.
  // Si falla por estar offline, el error lo maneja campo.html (cola en
  // IndexedDB), no este service worker.
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

  // BUG REAL encontrado 2026-09-16 al verificar el deploy en producción:
  // este service worker se registra sin `scope`, así que por default
  // controla TODO el origen (portal.greenservicesg.com), no solo
  // campo.html -- si el handler de abajo corriera para cualquier request,
  // terminaría cacheando el dashboard administrativo (con datos
  // financieros) apenas alguien abriera campo.html una vez en el mismo
  // navegador, exactamente el riesgo que el comentario de arriba decía
  // evitar. Se restringe explícitamente al SHELL declarado -- todo lo
  // demás (incluido el dashboard) pasa directo a la red, sin cachear.
  if (!SHELL_URLS.has(url.href)) {
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
