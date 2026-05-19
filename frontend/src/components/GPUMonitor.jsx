import { useQuery } from "@tanstack/react-query";
import { monitoringApi } from "../api/client";
import { Thermometer, Cpu, HardDrive, Zap } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function GpuCard({ gpu }) {
  const tempColor =
    gpu.temperature_celsius > 85
      ? "text-red-400"
      : gpu.temperature_celsius > 70
      ? "text-yellow-400"
      : "text-green-400";

  const memPct = Math.round((gpu.memory_used_mb / gpu.memory_total_mb) * 100);

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <div className="flex items-center gap-2 mb-4">
        <Cpu size={16} className="text-[#76b900]" />
        <h3 className="font-semibold text-sm">{gpu.name}</h3>
        <span className="ml-auto text-xs text-gray-500">GPU {gpu.gpu_index}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">NVENC Usage</p>
          <p className="text-2xl font-bold text-[#76b900]">{gpu.nvenc_usage_percent}%</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
            <div
              className="bg-[#76b900] h-1.5 rounded-full transition-all"
              style={{ width: `${gpu.nvenc_usage_percent}%` }}
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500">Temperature</p>
          <p className={`text-2xl font-bold ${tempColor}`}>{gpu.temperature_celsius}°C</p>
          <div className="flex items-center gap-1 mt-1">
            <Thermometer size={12} className={tempColor} />
            <span className="text-xs text-gray-500">
              {gpu.temperature_celsius > 85 ? "HOT" : gpu.temperature_celsius > 70 ? "WARM" : "OK"}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500">VRAM</p>
          <p className="text-lg font-bold text-blue-400">
            {gpu.memory_used_mb.toFixed(0)} / {gpu.memory_total_mb.toFixed(0)} MB
          </p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${memPct}%` }}
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500">Power Draw</p>
          <p className="text-lg font-bold text-yellow-400">{gpu.power_draw_watts}W</p>
          <p className="text-xs text-gray-600">{gpu.driver_version}</p>
        </div>
      </div>
    </div>
  );
}

export default function GPUMonitor() {
  const { data: gpus, isLoading, isError } = useQuery({
    queryKey: ["gpu-status"],
    queryFn: () => monitoringApi.gpu().then((r) => r.data),
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="text-gray-500 text-sm p-4">Loading GPU data...</div>;
  if (isError) return (
    <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
      Transcoder service unreachable
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.isArray(gpus) && gpus.map((gpu) => <GpuCard key={gpu.gpu_index} gpu={gpu} />)}
    </div>
  );
}
