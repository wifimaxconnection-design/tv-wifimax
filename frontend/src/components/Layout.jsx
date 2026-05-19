import { Outlet, NavLink } from "react-router-dom";
import { Tv, Users, Package, Activity, Radio, BarChart3 } from "lucide-react";
import clsx from "clsx";

const navItems = [
  { to: "/dashboard", icon: BarChart3, label: "Dashboard" },
  { to: "/channels", icon: Tv, label: "Channels" },
  { to: "/streams", icon: Radio, label: "Streams" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/packages", icon: Package, label: "Packages" },
  { to: "/monitoring", icon: Activity, label: "Monitoring" },
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
          {navItems.map(({ to, icon: Icon, label }) => (
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
              {label}
            </NavLink>
          ))}
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
