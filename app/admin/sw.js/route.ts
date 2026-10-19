// Admin service worker: static files cache-first; pages network-first with the last copy when slow/offline; RSC, data and POST never cached.
export const dynamic = "force-static";

const OFFLINE = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Internet yo‘q</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7fbff;color:#102c47;font:16px system-ui,sans-serif;text-align:center;padding:24px}button{margin-top:16px;padding:12px 20px;border:0;border-radius:10px;background:#102c47;color:#fff;font:inherit;font-weight:700}</style></head><body><div><div style="font-size:42px">✳</div><h1 style="font-size:20px">Internet yo‘q</h1><p>Aloqa tiklangach qayta urinib ko‘ring.</p><button onclick="location.reload()">Qayta urinish</button></div></body></html>`;

const worker = `const CACHE = "bk-admin-static-v2", PAGES = "bk-admin-pages-v1";
const OFFLINE = ${JSON.stringify(OFFLINE)};
const BADGE = '<div style="position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:99;background:#8a6100;color:#fff;padding:6px 12px;border-radius:999px;font:600 12px system-ui">Oflayn — oxirgi ma\u2019lumot</div>';
const isStatic = path => path.startsWith("/_next/static/") || path.startsWith("/_next/image") || path.startsWith("/admin-icons/") || path.startsWith("/brand/") || [".woff2", ".woff", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"].some(ext => path.endsWith(ext));
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== PAGES).map(key => caches.delete(key)))).then(() => self.clients.claim())));
// Pages: the network first (fresh data after every action); slow (3 s) or offline → the last copy on this phone, marked "Oflayn". Never RSC / data / POST.
async function page(request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(response => { if (response.ok && response.type === "basic" && !response.redirected) cache.put(request, response.clone()); return response; });
  const slow = new Promise(resolve => setTimeout(resolve, 3000));
  const first = await Promise.race([network.catch(() => null), slow]);
  if (first) return first;
  const cached = await cache.match(request);
  if (cached) return new Response((await cached.text()).replace("</body>", BADGE + "</body>"), { headers: { "content-type": "text/html; charset=utf-8" } });
  return network.catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } }));
}
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  // Signed out (or session ended): this phone keeps no admin pages.
  if (url.pathname.startsWith("/admin/login")) event.waitUntil(caches.delete(PAGES));
  if (isStatic(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; })));
  } else if (request.mode === "navigate" && !["/admin/login", "/admin/register", "/admin/password"].some(prefix => url.pathname.startsWith(prefix))) {
    event.respondWith(page(request));
  }
});
`;

export function GET() {
  // Scope "/admin" (the admin home itself) is wider than this file's folder "/admin/": allowed by this header.
  return new Response(worker, { headers: { "content-type": "text/javascript; charset=utf-8", "service-worker-allowed": "/admin", "cache-control": "no-cache" } });
}
