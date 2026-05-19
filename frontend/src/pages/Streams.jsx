import { useQuery } from "@tanstack/react-query";
import { streamsApi } from "../api/client";
import { formatDistanceToNow } from "date-fns";

export default function Streams() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["stream-sessions"],
    queryFn: () => streamsApi.active().then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ["stream-stats"],
    queryFn: () => streamsApi.stats().then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Live Streams</h2>
          <p className="text-gray-500 text-sm">Active viewer sessions</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{stats?.active_sessions ?? 0}</p>
            <p className="text-xs text-gray-500">Active</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">{stats?.channels_streaming ?? 0}</p>
            <p className="text-xs text-gray-500">Channels</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-3 text-gray-500 font-medium">IP Address</th>
              <th className="text-left p-3 text-gray-500 font-medium">Channel</th>
              <th className="text-left p-3 text-gray-500 font-medium">Profile</th>
              <th className="text-left p-3 text-gray-500 font-medium">Device</th>
              <th className="text-left p-3 text-gray-500 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center p-8 text-gray-600">Loading...</td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={5} className="text-center p-8 text-gray-600">No active sessions</td></tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 font-mono text-xs">{s.ip_address}</td>
                  <td className="p-3 font-mono text-xs text-gray-400">{s.channel_id.slice(0, 8)}...</td>
                  <td className="p-3">
                    {s.profile && (
                      <span className="text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{s.profile}</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-500">{s.device_type || "–"}</td>
                  <td className="p-3 text-xs text-gray-500">
                    {formatDistanceToNow(new Date(s.started_at), { addSuffix: false })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
