import GPUMonitor from "../components/GPUMonitor";
import { useQuery } from "@tanstack/react-query";
import { monitoringApi } from "../api/client";

export default function Monitoring() {
  const { data: ingestStats } = useQuery({
    queryKey: ["ingest-stats"],
    queryFn: () => monitoringApi.ingestStats().then((r) => r.data),
    refetchInterval: 10000,
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Monitoring</h2>
        <p className="text-gray-500 text-sm">GPU, ingest, and stream metrics</p>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3 text-gray-400 uppercase tracking-wider">GPU NVENC</h3>
        <GPUMonitor />
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3 text-gray-400 uppercase tracking-wider">
          Ingest Channels
        </h3>
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-3 text-gray-500 font-medium">Channel</th>
                <th className="text-left p-3 text-gray-500 font-medium">Address</th>
                <th className="text-left p-3 text-gray-500 font-medium">Status</th>
                <th className="text-left p-3 text-gray-500 font-medium">Bitrate</th>
                <th className="text-left p-3 text-gray-500 font-medium">PCR Errors</th>
              </tr>
            </thead>
            <tbody>
              {!ingestStats || ingestStats.length === 0 ? (
                <tr><td colSpan={5} className="text-center p-8 text-gray-600">No active ingest channels</td></tr>
              ) : (
                ingestStats.map((ch) => (
                  <tr key={ch.channel_id} className="border-b border-gray-800/50">
                    <td className="p-3 font-mono text-xs">{ch.channel_id.slice(0, 8)}...</td>
                    <td className="p-3 font-mono text-xs text-gray-400">{ch.address}:{ch.port}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        ch.status === "running" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                      }`}>
                        {ch.status}
                      </span>
                    </td>
                    <td className="p-3 text-green-400 font-bold">{ch.bitrate_mbps} Mbps</td>
                    <td className="p-3 text-xs text-gray-400">{ch.pcr_discontinuities}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
