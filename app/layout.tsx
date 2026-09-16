import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Franklin Offshore ePermit",
  description: "Hot Work Permit (Onshore) digital workflow — FOI-SG-057",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// 🔥 toggle maintenance di sini
const MAINTENANCE = true;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        
        {/* 🚧 MAINTENANCE BANNER */}
        {MAINTENANCE && (
          <div className="bg-yellow-500 text-black text-center p-2 text-sm font-medium">
            🚧 WEB APP IS UNDER MAINTENANCE — some features may not work
          </div>
        )}

        {children}

        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}