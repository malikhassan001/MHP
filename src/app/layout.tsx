import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MHP — Unified AI Super Agent Platform",
  description: "One AI workspace that can perform many different kinds of work. Multi-Agent orchestration, coding workspace, and tool registry.",
  icons: {
    icon: "/mhp_logo.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080C14] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
