'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Package,
  ShoppingCart,
  Users,
  LogOut,
  ChevronDown,
  Box,
  LayoutDashboard,
  Database,
  Ticket,
  Mail,
  Activity,
  BarChart3,
  Warehouse,
  DollarSign,
  MessageCircleQuestion,
  MessageSquare,
  Star,
  Archive,
  Headphones,
  Settings,
  Percent,
  RotateCcw,
  Clock,
  Building2,
  FileText,
  // Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// ─── Section-based navigation structure ───
interface MenuItem {
  title: string;
  href: string;
  icon: any;
  submenu?: { title: string; href: string }[];
}

interface NavSection {
  label: string;
  items: MenuItem[];
}

const navSections: NavSection[] = [
  {
    label: '',
    items: [
      {
        title: 'Strona główna',
        href: '/homepage',
        icon: LayoutDashboard,
        submenu: [
          { title: 'Dashboard', href: '/homepage' },
          { title: 'Karuzele produktów', href: '/homepage/carousels' },
        ],
      },
    ],
  },
  {
    label: 'Sprzedaż',
    items: [
      {
        title: 'Zamówienia',
        href: '/orders',
        icon: ShoppingCart,
        submenu: [
          { title: 'Wszystkie', href: '/orders' },
          { title: 'Nieopłacone', href: '/orders?status=OPEN' },
          { title: 'Opłacone', href: '/orders?status=CONFIRMED' },
          { title: 'W realizacji', href: '/orders?status=PROCESSING' },
          { title: 'Wysłane', href: '/orders?status=SHIPPED' },
          { title: 'Anulowane', href: '/orders/pending-cancellations' },
          { title: 'Archiwum', href: '/orders/archive' },
        ],
      },
      {
        title: 'Kupony',
        href: '/coupons',
        icon: Ticket,
      },
      {
        title: 'Faktury',
        href: '/invoices',
        icon: FileText,
      },
      {
        title: 'Przeceny',
        href: '/sale-campaigns',
        icon: Percent,
      },
      {
        title: 'Opóźnienia dostaw',
        href: '/delivery-delays',
        icon: Clock,
      },
      {
        title: 'Szablony e-mail',
        href: '/email-templates',
        icon: Mail,
      },
    ],
  },
  {
    label: 'Produkty',
    items: [
      {
        title: 'Produkty',
        href: '/products',
        icon: Package,
        submenu: [
          { title: 'Lista produktów', href: '/products' },
          { title: 'Kategorie', href: '/categories' },
        ],
      },
      {
        title: 'Cennik',
        href: '/pricing',
        icon: DollarSign,
      },
      {
        title: 'Omnibus & Top',
        href: '/omnibus',
        icon: BarChart3,
      },
    ],
  },
  {
    label: 'Obsługa klienta',
    items: [
      {
        title: 'Tickety',
        href: '/messages',
        icon: MessageSquare,
        submenu: [
          { title: 'Wszystkie zgłoszenia', href: '/messages' },
          { title: 'Archiwum', href: '/messages/archive' },
        ],
      },
      {
        title: 'Zwroty i reklamacje',
        href: '/returns',
        icon: RotateCcw,
      },
      {
        title: 'WuBuś — pytania',
        href: '/chatbot-unmatched',
        icon: MessageCircleQuestion,
      },
      {
        title: 'Opinie',
        href: '/reviews',
        icon: Star,
      },
    ],
  },
  {
    label: 'Marketing',
    items: [
      {
        title: 'Newsletter',
        href: '/newsletter',
        icon: Mail,
      },
    ],
  },
  {
    label: 'Zarządzanie',
    items: [
      {
        title: 'Użytkownicy',
        href: '/users',
        icon: Users,
      },
      {
        title: 'Współpraca B2B',
        href: '/b2b',
        icon: Building2,
      },
      {
        title: 'Magazyn (WMS)',
        href: '/warehouse',
        icon: Warehouse,
        submenu: [
          { title: 'Stan magazynowy', href: '/warehouse' },
          { title: 'Ruchy magazynowe', href: '/warehouse/movements' },
          { title: 'Masowy transfer', href: '/warehouse/bulk-transfer' },
          { title: 'Magazyny', href: '/warehouse/locations' },
        ],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        title: 'Activity Log',
        href: '/activity-log',
        icon: Activity,
      },
      {
        title: 'Integracje',
        href: '/integrations',
        icon: Box,
        submenu: [
          { title: 'Hurtownie', href: '/wholesalers' },
          { title: 'Baselinker', href: '/baselinker' },
          { title: 'Import produktów', href: '/baselinker/import' },
          { title: 'Aktualizacja produktów', href: '/baselinker/update-products' },
          { title: 'Podgląd hurtowni (dry run)', href: '/baselinker/dry-run' },
          { title: 'Synchronizacja stanów', href: '/stock-sync' },
        ],
      },
    ],
  },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);

  const toggleMenu = (title: string) => {
    setOpenMenus((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-64 h-full bg-admin-sidebar border-r border-admin-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-admin-border">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
            <Box className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-white">WBTrade</span>
          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Admin</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 sidebar-scroll">
        {navSections.map((section, sIdx) => {
          const isCollapsed = collapsedSections.includes(section.label);

          return (
            <div key={sIdx} className={sIdx > 0 ? 'mt-3' : ''}>
              {/* Section header */}
              {section.label && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 mb-1 group"
                >
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider group-hover:text-gray-400 transition-colors">
                    {section.label}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                </button>
              )}

              {/* Section items */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                }`}
              >
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.title}>
                      {item.submenu ? (
                        <div>
                          <button
                            onClick={() => toggleMenu(item.title)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                              isActive(item.href)
                                ? 'bg-slate-700/50 text-white'
                                : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon className="w-[18px] h-[18px]" />
                              {item.title}
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${
                                openMenus.includes(item.title) ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          <div
                            className={`overflow-hidden transition-all duration-200 ease-in-out ${
                              openMenus.includes(item.title) ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
                            }`}
                          >
                            <ul className="mt-1 ml-8 space-y-0.5 pb-1">
                              {item.submenu.map((sub) => (
                                <li key={sub.href}>
                                  <Link
                                    href={sub.href}
                                    className={`block px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                                      pathname === sub.href
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                                    }`}
                                  >
                                    {sub.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={item.href}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive(item.href)
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                          }`}
                        >
                          <item.icon className="w-[18px] h-[18px]" />
                          {item.title}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-admin-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
            {user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` : '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user ? `${user.firstName} ${user.lastName}` : 'Ładowanie...'}</p>
            <p className="text-xs text-slate-400">{user?.role === 'ADMIN' ? 'Administrator' : user?.role === 'WAREHOUSE' ? 'Magazynier' : user?.role || ''}</p>
          </div>
          <button onClick={logout} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/30 transition-all duration-200" title="Wyloguj">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
