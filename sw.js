const VERSAO = '1.3.1';
const CACHE = `tanq-${VERSAO}`;

const ARQUIVOS = [
  './',
  './index.html',
  `./style.css?v=${VERSAO}`,
  `./app.js?v=${VERSAO}`,
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Rede primeiro, cache como reserva.
 *
 * A estratégia inversa (cache primeiro) era mais rápida, mas fazia o app continuar
 * exibindo a versão antiga mesmo depois de uma atualização publicada — o celular
 * respondia do cache antes de olhar a rede. Agora, havendo internet, sempre chega
 * a versão mais nova; sem internet, o cache assume e o app continua funcionando.
 */
self.addEventListener('fetch', (event) => {
  const requisicao = event.request;

  if (requisicao.method !== 'GET') return;

  event.respondWith(
    fetch(requisicao)
      .then((resposta) => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE)
            .then((cache) => cache.put(requisicao, copia))
            .catch(() => {});
        }
        return resposta;
      })
      .catch(() => caches.match(requisicao).then((cached) => {
        if (cached) return cached;
        // navegação offline em uma URL não cacheada (ex: com ?parametro) cai na tela principal
        if (requisicao.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
