import { useQuery } from "@tanstack/react-query";
import { channelsApi } from "../api/client";
import { Tv, Circle } from "lucide-react";
import clsx from "clsx";

export default function ChannelList({ limit = 10 }) {
  const { data, isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => channelsApi.list({ limit }).then((r) => r.data),
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="text-gray-500 text-sm p-4">Loading channels...</div>;

  return (
    <div className="space-y-1">
      {(data || []).map((ch) => (
        <div
          key={ch.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Circle
            size={8}
            className={clsx("fill-current", ch.is_active ? "text-green-400" : "text-gray-600")}
          />
          <Tv size={14} className="text-gray-500" />
          <span className="text-sm flex-1 truncate">{ch.name}</span>
          <span className="text-xs text-gray-600 font-mono">
            {ch.multicast_address}:{ch.multicast_port}
          </span>
          <div className="flex gap-1">
            {(ch.transcoding_profiles || []).slice(0, 3).map((p) => (
              <span
                key={p}
                className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
