/* Service worker for task reminders (Phase 1). Its only job is to host
 * registration.showNotification(...) so reminder banners are reliable even when
 * the tab is backgrounded. The scheduling/polling itself runs in the page
 * (reminders.js) — there is no background push here (that is Phase 2, web-push).
 * Tapping a notification focuses an existing app tab (or opens one). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
