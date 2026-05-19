import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsApi } from "../api/client";
import { Plus, Trash2, Circle, Tv } from "lucide-react";
import clsx from "clsx";

const PROFILES_OPTIONS = ["1080p", "720p", "480p", "1080p_h265", "720p_h265"];

function ChannelModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    multicast_address: "239.0.0.1",
    multicast_port: 1234,
    interface: "eth0",
    transcoding_profiles: ["1080p", "720p", "480p"],
  });

  const toggle = (p) =>
    setForm((f) => ({
      ...f,
      transcoding_profiles: f.transcoding_profiles.includes(p)
        ? f.transcoding_profiles.filter((x) => x !== p)
        : [...f.transcoding_profiles, p],
    }));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700 space-y-4">
        <h3 className="font-bold text-lg">Add Channel</h3>
        <input
          className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Channel name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            placeholder="239.x.x.x"
            value={form.multicast_address}
            onChange={(e) => setForm((f) => ({ ...f, multicast_address: e.target.value }))}
          />
          <input
            className="w-24 bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            type="number"
            placeholder="Port"
            value={form.multicast_port}
            onChange={(e) => setForm((f) => ({ ...f, multicast_port: +e.target.value }))}
          />
        </div>
        <input
          className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono outline-none"
          placeholder="NIC interface (e.g. eth0)"
          value={form.interface}
          onChange={(e) => setForm((f) => ({ ...f, interface: e.target.value }))}
        />
        <div>
          <p className="text-xs text-gray-500 mb-2">Transcoding Profiles</p>
          <div className="flex flex-wrap gap-2">
            {PROFILES_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => toggle(p)}
                className={clsx(
                  "text-xs px-3 py-1 rounded-full border transition-colors",
                  form.transcoding_profiles.includes(p)
                    ? "bg-brand-500 border-brand-500 text-white"
                    : "border-gray-700 text-gray-400 hover:border-gray-500"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            className="flex-1 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white"
          >
            Create Channel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Channels() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => channelsApi.list({ limit: 200, active_only: false }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: channelsApi.create,
    onSuccess: () => { qc.invalidateQueries(["channels"]); setShowModal(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: channelsApi.delete,
    onSuccess: () => qc.invalidateQueries(["channels"]),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Channels</h2>
          <p className="text-gray-500 text-sm">{channels.length} total channels</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 rounded-lg text-sm hover:bg-brand-600"
        >
          <Plus size={14} /> Add Channel
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-3 text-gray-500 font-medium">Status</th>
              <th className="text-left p-3 text-gray-500 font-medium">Name</th>
              <th className="text-left p-3 text-gray-500 font-medium">Multicast</th>
              <th className="text-left p-3 text-gray-500 font-medium">Interface</th>
              <th className="text-left p-3 text-gray-500 font-medium">Profiles</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center p-8 text-gray-600">Loading...</td></tr>
            ) : channels.length === 0 ? (
              <tr><td colSpan={6} className="text-center p-8 text-gray-600">No channels yet</td></tr>
            ) : (
              channels.map((ch) => (
                <tr key={ch.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="p-3">
                    <Circle size={8} className={clsx("fill-current", ch.is_active ? "text-green-400" : "text-gray-600")} />
                  </td>
                  <td className="p-3 font-medium">{ch.name}</td>
                  <td className="p-3 font-mono text-xs text-gray-400">
                    {ch.multicast_address}:{ch.multicast_port}
                  </td>
                  <td className="p-3 text-xs text-gray-400 font-mono">{ch.interface}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {(ch.transcoding_profiles || []).map((p) => (
                        <span key={p} className="text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => deleteMutation.mutate(ch.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ChannelModal
          onClose={() => setShowModal(false)}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}
    </div>
  );
}
