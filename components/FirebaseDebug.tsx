// Tempel komponen ini sementara di halaman mana saja (misal di app/page.tsx)
// buat ngecek Firebase konek atau nggak, TANPA perlu buka F12.
// Setelah kelihatan hasilnya dan sudah yakin OK, hapus lagi komponen ini.

"use client";

import { useState } from "react";
import { firebaseApp, getFirebaseMessaging } from "@/lib/firebase/client";
import { getToken } from "firebase/messaging";

export default function FirebaseDebug() {
  const config = firebaseApp.options;
  const [status, setStatus] = useState<string>("Belum dites");
  const [loading, setLoading] = useState(false);

  async function handleTestFCM() {
    setLoading(true);
    setStatus("Meminta izin notifikasi...");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(`❌ Izin ditolak (${permission})`);
        setLoading(false);
        return;
      }

      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        setStatus("❌ Browser tidak support FCM");
        setLoading(false);
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        setStatus("❌ VAPID key kosong di env");
        setLoading(false);
        return;
      }

      const token = await getToken(messaging, { vapidKey });
      if (token) {
        setStatus(`✅ KONEK! Token: ${token.slice(0, 30)}...`);
      } else {
        setStatus("❌ Tidak dapat token (cek service worker firebase-messaging-sw.js)");
      }
    } catch (err: any) {
      setStatus(`❌ Error: ${err.message}`);
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 10,
        left: 10,
        right: 10,
        background: "#111",
        color: "#0f0",
        padding: 12,
        fontSize: 12,
        fontFamily: "monospace",
        zIndex: 9999,
        borderRadius: 8,
        wordBreak: "break-all",
      }}
    >
      <p>projectId: {config.projectId || "❌ KOSONG"}</p>
      <p>apiKey: {config.apiKey ? "✅ ada" : "❌ KOSONG"}</p>
      <p>authDomain: {config.authDomain || "❌ KOSONG"}</p>
      <p>appId: {config.appId ? "✅ ada" : "❌ KOSONG"}</p>
      <hr style={{ margin: "8px 0", opacity: 0.3 }} />
      <button
        onClick={handleTestFCM}
        disabled={loading}
        style={{
          background: "#0f0",
          color: "#111",
          border: "none",
          padding: "6px 12px",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "monospace",
          fontWeight: "bold",
        }}
      >
        {loading ? "Testing..." : "Test Koneksi FCM"}
      </button>
      <p style={{ marginTop: 6 }}>Status: {status}</p>
    </div>
  );
}
