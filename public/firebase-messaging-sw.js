// public/firebase-messaging-sw.js
//
// WAJIB ada di folder public/ (bukan di lib atau components), karena
// service worker harus bisa diakses langsung di https://domain.com/firebase-messaging-sw.js
// Ini yang dicari Firebase Cloud Messaging saat register push notification.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Config di sini boleh di-hardcode (bukan lewat process.env) karena
// service worker jalan di luar build Next.js dan nggak bisa baca env vars.
// Ini aman karena apiKey Firebase web memang didesain untuk publik.
firebase.initializeApp({
  apiKey: "AIzaSyDDNnEjCYP48vEEDOnhxKkWWoD56xCzlgA",
  authDomain: "inspection-software-a5bed.firebaseapp.com",
  projectId: "inspection-software-a5bed",
  storageBucket: "inspection-software-a5bed.firebasestorage.app",
  messagingSenderId: "261187782296",
  appId: "1:261187782296:web:bb7da8690809d82872f2ed",
});

const messaging = firebase.messaging();

// Handle notification saat tab browser sedang di-background/ditutup
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || "Notification";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/icon.png", // ganti sesuai icon project kamu kalau ada
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
