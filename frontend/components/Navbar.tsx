"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type NavbarProps = {
  userEmail?: string | null;
};

export default function Navbar({ userEmail }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  const navLinks = [
    { href: "/dashboard", label: "Opportunities", icon: "💼" },
    { href: "/activity", label: "Email & AI Log", icon: "📬" },
    { href: "/profile", label: "My Profile", icon: "👤" },
    { href: "/settings/relevance", label: "Relevance Rules", icon: "⚙️" },
  ];

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-black text-black text-base shadow-sm">
                P
              </span>
              <span className="font-bold text-lg text-white tracking-tight">
                Placement <span className="text-emerald-400">AI</span>
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gray-800/80 text-emerald-400 shadow-sm"
                        : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                    }`}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Email & Actions */}
          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="hidden sm:inline-block text-xs font-mono text-gray-400 max-w-[200px] truncate border border-gray-800 rounded-full px-3 py-1 bg-gray-900/60">
                {userEmail}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="rounded-lg border border-gray-700/80 px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:border-red-500/50 hover:bg-red-950/30 hover:text-red-300 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Mobile Navigation Links */}
        <div className="flex md:hidden border-t border-gray-800/60 py-2 gap-1 overflow-x-auto">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-gray-800 text-emerald-400"
                    : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
