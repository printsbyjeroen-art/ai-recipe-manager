import type { Metadata } from "next";
import "./globals.css";
import QueuePoller from "./QueuePoller";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  title: "AI Recipe Manager",
  description: "Personal AI-powered recipe database"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <QueuePoller />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

