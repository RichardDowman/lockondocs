"use client";

import { useState } from "react";
import Image from "next/image";
import {
  LayoutDashboard,
  Users as UsersIcon,
  ShieldCheck,
  ScrollText,
  Mail,
  DatabaseBackup,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardSection } from "@/components/admin/sections/dashboard-section";
import { UsersSection } from "@/components/admin/sections/users-section";
import { AdminManagementSection } from "@/components/admin/sections/admin-management-section";
import { AuditSection } from "@/components/admin/sections/audit-section";
import { EmailsSection } from "@/components/admin/sections/emails-section";
import { BackupsSection } from "@/components/admin/sections/backups-section";
import type { DateFilterValue } from "@/components/admin/date-filter";

export type AdminSection =
  | "dashboard"
  | "users"
  | "adminmgmt"
  | "audit"
  | "emails"
  | "backups";

interface NavItem {
  key: AdminSection;
  label: string;
  icon: typeof LayoutDashboard;
  superOnly?: boolean;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "adminmgmt", label: "Admin Management", icon: ShieldCheck, superOnly: true },
  { key: "audit", label: "Audit", icon: ScrollText },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "backups", label: "Backups", icon: DatabaseBackup },
];

// Filter passed from a dashboard drilldown into the Users section.
export interface UsersPrefill {
  status?: string;
  sort?: string;
  range?: DateFilterValue;
}

export function AdminConsole({
  isSuperAdmin,
  adminEmail,
}: {
  isSuperAdmin: boolean;
  adminEmail: string;
}) {
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [usersPrefill, setUsersPrefill] = useState<UsersPrefill | null>(null);

  const nav = NAV.filter((n) => !n.superOnly || isSuperAdmin);

  function go(key: AdminSection) {
    setSection(key);
    setMobileNavOpen(false);
  }

  // Called by dashboard cards to drill down into a filtered user list.
  function drilldownUsers(prefill: UsersPrefill) {
    setUsersPrefill(prefill);
    setSection("users");
    setMobileNavOpen(false);
  }

  function exitToApp() {
    window.location.assign("/home");
  }

  const NavList = (
    <nav className="flex flex-1 flex-col gap-1">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = section === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => go(item.key)}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-left text-sm font-medium transition-colors",
              active
                ? "gold-surface text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  const SidebarInner = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="relative h-8 w-8">
          <Image
            src="/logo.png"
            alt="LockonDocs logo"
            fill
            sizes="32px"
            className="object-contain"
          />
        </div>
        <div>
          <div className="font-display text-sm font-bold leading-tight text-foreground">
            LockonDocs
          </div>
          <div className="text-[11px] text-muted-foreground">Admin console</div>
        </div>
      </div>
      {NavList}
      <div className="space-y-2 border-t border-border pt-4">
        <div className="px-1 text-[11px] text-muted-foreground">
          Signed in as
          <div className="truncate font-medium text-foreground">{adminEmail}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={exitToApp}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Exit to app
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:block">
        <div className="sticky top-0 h-screen">{SidebarInner}</div>
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-card shadow-xl">
            <div className="flex justify-end p-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {SidebarInner}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-display text-base font-bold text-foreground">
            Admin console
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={exitToApp}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Exit
          </Button>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          {section === "dashboard" && (
            <DashboardSection onDrilldown={drilldownUsers} />
          )}
          {section === "users" && (
            <UsersSection
              isSuperAdmin={isSuperAdmin}
              prefill={usersPrefill}
              onConsumePrefill={() => setUsersPrefill(null)}
            />
          )}
          {section === "adminmgmt" && isSuperAdmin && <AdminManagementSection />}
          {section === "audit" && <AuditSection />}
          {section === "emails" && <EmailsSection />}
          {section === "backups" && <BackupsSection />}
        </main>
      </div>
    </div>
  );
}
