import { Outlet, NavLink } from "react-router-dom";
import { Tv, Users, Package, Activity, Radio, BarChart3, Globe, Shield, Network, Bell } from "lucide-react";
import clsx from "clsx";

const navItems = [
  { to: "/dashboard",  icon: BarChart3, label: "Dashboard"  },
  { to: "/channels",   icon: Tv,        label: "Channels"   },
  { to: "/streams",    icon: Radio,     label: "Streams"    },
  { to: "/clients",    icon: Users,     label: "Clientes"   },
  { to: "/packages",   icon: Package,   label: "Paquetes"   },
  { to: "/monitoring", icon: Activity,  label: "Monitoring" },
  // Carrier-Grade
  { to: "/noc",        icon: Shield,    label: "NOC",     badge: "NEW" },
  { to: "/ipv6",       icon: Globe,     label: "IPv6",    badge: "NEW" },
  { to: "/bgp",        icon: Network,   label: "BGP",     badge: "NEW" },
  { to: "/alerts",     icon: Bell,      label: "Alertas", badge: "NEW" },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">IPTV Platform</h1>
          <p className="text-xs text-gray-500">ISP Admin Panel</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => { const { to, icon: Icon, label } = item; return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-brand-500 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {item.badge && (
                <span className="text-[9px] bg-green-600 text-white px-1 py-0.5 rounded font-bold">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ); })}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">v1.0.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-950">
        <Outlet />
      </main>
    </div>
  );
}
