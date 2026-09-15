self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Do nothing. This empty listener satisfies PWA install requirements
  // without intercepting and causing console errors during local development.
});
