"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [loadingUser, setLoadingUser] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();
      setUser(user);
      setLoadingUser(false);
    };
    init();

    const {
      data: { subscription }
    } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loadingUser) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-4">
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <header className="mb-4 flex items-center justify-between">
        <motion.h1
          className="text-xl font-semibold tracking-tight"
          whileHover={{ scale: 1.03, rotate: -1 }}
          transition={{ type: "spring", stiffness: 250, damping: 12 }}
        >
          AI Recipe Manager
        </motion.h1>
        <nav className="flex items-center gap-3 text-sm">
          <motion.a
            href="/"
            className="rounded px-2 py-1 hover:bg-slate-100"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
          >
            Dashboard
          </motion.a>
          <motion.a
            href="/weekmenu"
            className="rounded px-2 py-1 hover:bg-slate-100"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
          >
            Week menu
          </motion.a>
          <motion.a
            href="/shopping-list"
            className="rounded px-2 py-1 hover:bg-slate-100"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
          >
            Shopping list
          </motion.a>
          <motion.a
            href="/ingredients"
            className="rounded px-2 py-1 hover:bg-slate-100"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
          >
            Ingredients
          </motion.a>
          <motion.a
            href="/import"
            className="rounded bg-blue-600 px-3 py-1 text-white shadow-sm hover:bg-blue-700"
            whileHover={{
              scale: 1.05,
              boxShadow: "0 10px 20px rgba(37,99,235,0.35)"
            }}
            whileTap={{ scale: 0.95 }}
          >
            Import Recipe
          </motion.a>
          {user ? (
            <button
              onClick={async () => {
                await supabaseBrowser.auth.signOut();
                window.location.href = "/auth";
              }}
              className="text-xs text-slate-600 hover:underline"
            >
              Sign out
            </button>
          ) : (
            <motion.a
              href="/auth"
              className="text-xs text-slate-600 hover:underline"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
            >
              Sign in
            </motion.a>
          )}
        </nav>
      </header>
      <main className="flex-1 pb-10">
        {user || window.location.pathname === "/auth" ? children : null}
        {!user && window.location.pathname !== "/auth" && (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-700 shadow-sm">
              <p className="mb-3 font-medium">
                Please sign in to access your recipes.
              </p>
              <a
                href="/auth"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Go to sign in
              </a>
            </div>
          </div>
        )}
      </main>
    </motion.div>
  );
}

