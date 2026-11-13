// Service worker Impact Board Leader — menerima & menampilkan push notification
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  const title = d.title || 'Impact Board Leader';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Jangan lupa isi aktivitas hari ini.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'daily-reminder',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
