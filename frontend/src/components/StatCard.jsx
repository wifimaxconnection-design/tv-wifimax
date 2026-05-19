import clsx from "clsx";

export default function StatCard({ title, value, subtitle, icon: Icon, color = "blue", trend }) {
  const colors = {
    blue: "text-blue-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    purple: "text-purple-400",
    nvidia: "text-[#76b900]",
  };

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">{title}</p>
          <p className={clsx("text-3xl font-bold mt-1", colors[color])}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={clsx("p-2 rounded-lg bg-gray-800", colors[color])}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <p className={clsx("text-xs mt-3", trend >= 0 ? "text-green-400" : "text-red-400")}>
          {trend >= 0 ? "+" : ""}{trend}% vs last hour
        </p>
      )}
    </div>
  );
}
