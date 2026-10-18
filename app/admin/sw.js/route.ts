// Admin service worker: caches static files only and shows "Internet yo‘q" for pages when offline; data is never cached.
export const dynamic = "force-static";

const OFFLINE = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Internet yo‘q</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7fbff;color:#102c47;font:16px system-ui,sans-serif;text-align:center;padding:24px}button{margin-top:16px;padding:12px 20px;border:0;border-radius:10px;background:#102c47;color:#fff;font:inherit;font-weight:700}</style></head><body><div><div style="font-size:42px">✳</div><h1 style="font-size:20px">Internet yo‘q</h1><p>Aloqa tiklangach qayta urinib ko‘ring.</p><button onclick="location.reload()">Qayta urinish</button></div></body></html>`;

const worker = `const CACHE = "bk-admin-static-v1";
const OFFLINE = ${JSON.stringify(OFFLINE)};
const isStatic = path => path.startsWith("/_next/static/") || path.startsWith("/admin-icons/");
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (isStatic(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; })));
  } else if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })));
  }
});
`;

export function GET() {
  // Scope "/admin" (the admin home itself) is wider than this file's folder "/admin/": allowed by this header.
  return new Response(worker, { headers: { "content-type": "text/javascript; charset=utf-8", "service-worker-allowed": "/admin", "cache-control": "no-cache" } });
}
