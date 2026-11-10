import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Franklin Offshore ePermit",
  description: "Franklin ePermit — Hot Work, Lifting and Hazardous Work digital workflow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">

        {children}

        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}