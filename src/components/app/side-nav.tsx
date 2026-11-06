"use client";

import {
  Anchor,
  Banknote,
  Bell,
  Building,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileSearch,
  FileText,
  Flag,
  Globe,
  LayoutDashboard,
  ListChecks,
  Lock,
  Map,
  MapPin,
  Menu,
  Percent,
  Receipt,
  Route,
  Scale,
  ScrollText,
  ShieldCheck,
  ShieldEllipsis,
  Ship,
  Smartphone,
  Sparkles,
  UserCog,
  Users,
  Vault,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Icons by name: server layouts pass the name, since components can't cross to the client. */
const ICONS = {
  dashboard: LayoutDashboard,
  notifications: Bell,
  assistant: Sparkles,
  trips: CalendarClock,
  map: Map,
  routes: Route,
  safety: ShieldCheck,
  reports: ChartColumn,
  vessels: Ship,
  crew: Users,
  documents: FileText,
  charters: Anchor,
  tenders: ClipboardList,
  invoices: Receipt,
  payouts: Banknote,
  billing: CreditCard,
  team: UserCog,
  captain: Smartphone,
  privacy: Lock,
  admin: ShieldEllipsis,
  countries: Globe,
  ruleSets: ListChecks,
  orgs: Building,
  reviewDocuments: FileSearch,
  disputes: Scale,
  escrow: Vault,
  fees: Percent,
  jetties: MapPin,
  audit: ScrollText,
  flags: Flag,
  passengers: Users,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Small count shown after the label (e.g. unread notifications). */
  badge?: number;
}
export interface NavGroup {
  /** Section heading; the first group usually has none. */
  label?: string;
  items: NavItem[];
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Signed-in navigation: a fixed sidebar on large screens, a slide-in drawer behind a Menu button
 * on phones. `top` (logo, company) and `bottom` (account) are rendered by the server layout.
 */
export function SideNav({
  groups,
  home,
  logo,
  top,
  bottom,
  mobileBar,
  label,
  menuLabel,
  closeLabel,
}: {
  groups: NavGroup[];
  /** Where the logo links to. */
  home: string;
  logo: ReactNode;
  top: ReactNode;
  bottom: ReactNode;
  /** Extra items on the phone top bar, right side (e.g. the notifications bell). */
  mobileBar?: ReactNode;
  label: string;
  menuLabel: string;
  closeLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Following a link closes the drawer (state reset during render, not in an effect).
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  useEffect(() => {
    // The company switcher submits as soon as it changes.
    const select = document.querySelector<HTMLSelectElement>("select[data-autosubmit]");
    const onChange = () => select?.form?.requestSubmit();
    select?.addEventListener("change", onChange);
    return () => select?.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a, button, select")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Phone top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-background/80 px-4 backdrop-blur-xl lg:hidden">
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={menuLabel}
          aria-expanded={open}
          aria-controls="side-nav"
          className="-ml-2 flex size-10 cursor-pointer items-center justify-center rounded-xs text-foreground hover:bg-surface-raised"
        >
          <Menu className="size-5" />
        </button>
        <Link href={home} className="shrink-0 rounded-xs focus-visible:outline-2 focus-visible:outline-accent">
          {logo}
        </Link>
        <div className="ml-auto flex items-center gap-2">{mobileBar}</div>
      </div>

      {/* Dim the page behind the open drawer */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="side-nav"
        ref={panel}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-hairline bg-background transition-[translate,visibility] duration-200 lg:visible lg:w-64 lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-start gap-2 border-b border-hairline p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Link href={home} className="w-fit rounded-xs focus-visible:outline-2 focus-visible:outline-accent">
              {logo}
            </Link>
            {top}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
            aria-label={closeLabel}
            className="-mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xs text-body hover:bg-surface-raised hover:text-foreground lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav aria-label={label} className="flex-1 [scrollbar-width:thin] overflow-y-auto px-3 py-4">
          {groups.map((group, i) => (
            <div key={group.label ?? i} className={cn(i > 0 && "mt-6")}>
              {group.label && <p className="mb-2 px-3 label-mono-sm text-meta">{group.label}</p>}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-10 items-center gap-3 rounded-sm px-3 text-sm transition-colors",
                          active
                            ? "bg-surface-raised font-medium text-foreground"
                            : "text-body hover:bg-surface-raised hover:text-foreground",
                        )}
                      >
                        <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-accent" : "text-meta")} />
                        <span className="truncate">{item.label}</span>
                        {!!item.badge && (
                          <span className="ml-auto flex min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 text-[11px] font-medium text-accent-foreground">
                            {item.badge > 9 ? "9+" : item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-hairline p-4">{bottom}</div>
      </aside>
    </>
  );
}
