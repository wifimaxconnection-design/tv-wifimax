import { useQuery } from "@tanstack/react-query";
import { streamsApi, channelsApi, monitoringApi } from "../api/client";
import StatCard from "../components/StatCard";
import GPUMonitor from "../components/GPUMonitor";
import ChannelList from "../components/ChannelList";
import { Radio, Tv, Users, Activity, Wifi, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Dashboard() {
  const { data: streamStats } = useQuery({
    queryKey: ["stream-stats"],
    queryFn: () => streamsApi.stats().then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => monitoringApi.services().then((r) => r.data),
    refetchInterval: 30000,
  });

  const stats = streamStats || {};
  const svc = services || {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-0.5">Real-time IPTV platform overview</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Sessions"
          value={stats.active_sessions ?? "–"}
          icon={Radio}
          color="green"
          subtitle="Live viewers"
        />
        <StatCard
          title="Channels Streaming"
          value={stats.channels_streaming ?? "–"}
          icon={Tv}
          color="blue"
          subtitle="With active viewers"
        />
        <StatCard
          title="Total Today"
          value={stats.total_sessions_today ?? "–"}
          icon={Users}
          color="purple"
          subtitle="Sessions started"
        />
        <StatCard
          title="Platform Status"
          value={
            Object.values(svc).filter((v) => v === "healthy").length > 0
              ? "Healthy"
              : "Checking..."
          }
          icon={Activity}
          color={Object.values(svc).some((v) => v !== "healthy") ? "yellow" : "green"}
          subtitle={`${Object.values(svc).filter((v) => v === "healthy").length} services OK`}
        />
      </div>

      {/* Services Health */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="font-semibold text-sm mb-4 text-gray-300">Microservice Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {["ingest", "transcoder", "packager", "auth", "odoo_connector"].map((svcName) => {
            const status = svc[svcName] || "unknown";
            return (
              <div key={svcName} className="flex flex-col items-center gap-1">
                <div
                  className={`w-3 h-3 rounded-full ${
                    status === "healthy"
                      ? "bg-green-400"
                      : status === "unreachable"
                      ? "bg-red-500"
                      : "bg-yellow-400"
                  }`}
                />
                <span className="text-xs text-gray-500 capitalize">{svcName.replace("_", " ")}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* GPU Monitor */}
      <div>
        <h3 className="font-semibold text-sm mb-3 text-gray-300">GPU Status – NVENC RTX 4500 Ada</h3>
        <GPUMonitor />
      </div>

      {/* Channels */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h3 className="font-semibold text-sm text-gray-300">Active Channels</h3>
        </div>
        <div className="p-2">
          <ChannelList limit={20} />
        </div>
      </div>
    </div>
  );
}
