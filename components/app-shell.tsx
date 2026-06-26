"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  FileCheck,
  FilePlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { UserRow } from "@/lib/supabase/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRow["role"][];
}

const NAV: NavItem[] = [
  { href: "/dashboard",     label: "Dashboard", icon: LayoutDashboard },
  { href: "/permits",       label: "Permits",   icon: ClipboardList },
  {
  href: "/permits/new",
  label: "New Permit",
  icon: FilePlus,
  roles: ["applicant", "guest_applicant", "contractor", "srm", "admin"],
  },
  { href: "/admin/users",   label: "Users",     icon: Users,        roles: ["admin"] },
  { href: "/admin/audit",   label: "Audit Log", icon: Shield,       roles: ["admin"] },
];

export function AppShell({ user, children }: { user: UserRow; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const visibleNav = NAV.filter(
    (n) => !n.roles || n.roles.includes(user.role) || user.role === "admin",
  );

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-white border-r border-slate-200 sticky top-0 h-screen">
        <SidebarContent
          user={user}
          pathname={pathname}
          nav={visibleNav}
          onSignOut={signOut}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 bg-white shadow-xl flex flex-col">
            <button
              type="button"
              className="absolute top-3 right-3 p-2 rounded-md hover:bg-slate-100"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              user={user}
              pathname={pathname}
              nav={visibleNav}
              onSignOut={signOut}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
          <button
            type="button"
            className="p-2 -ml-2 rounded-md hover:bg-slate-100"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-semibold">Franklin ePermit</div>
          <div className="w-9" />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  user,
  pathname,
  nav,
  onSignOut,
  onNavigate,
}: {
  user: UserRow;
  pathname: string;
  nav: NavItem[];
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
            F
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">Franklin ePermit</div>
            <div className="text-xs text-slate-500">FOI-SG-057</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-2">
        <div className="px-2 py-1">
          <div className="text-sm font-medium truncate">{user.full_name}</div>
          <div className="text-xs text-slate-500 truncate">{user.email}</div>
          <div className="text-xs text-slate-400 mt-0.5 capitalize">{user.role}</div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </>
  );
}
