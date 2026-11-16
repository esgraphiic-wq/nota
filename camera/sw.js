// كاميرا المحل: يستقبل الملفات اللي بتتشارك من واتساب أو الاستوديو، ويخلي التطبيق يفتح من غير نت
var CACHE = "cam-v1";
var SHARED = "cam-shared";

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(["./", "manifest.json", "icon-192.png", "icon-512.png"]);
  }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method === "POST" && u.pathname.endsWith("/share")) {
    e.respondWith(handleShare(e.request));
    return;
  }
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (r) {
      var copy = r.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return r;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); })
  );
});

async function handleShare(req) {
  var count = 0;
  try {
    var data = await req.formData();
    var files = data.getAll("media");
    var cache = await caches.open(SHARED);
    var stamp = Date.now();
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f || !f.size) continue;
      var key = "./_shared/" + stamp + "-" + i;
      await cache.put(key, new Response(f, { headers: {
        "Content-Type": f.type || "application/octet-stream",
        "X-Name": encodeURIComponent(f.name || ("file-" + i))
      }}));
      count++;
    }
  } catch (err) {}
  return Response.redirect("./?shared=" + count, 303);
}
