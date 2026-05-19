import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi } from "../api/client";
import { UserX, UserCheck, Users } from "lucide-react";

export default function Clients() {
  const qc = useQueryClient();
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => clientsApi.list({ active_only: false, limit: 500 }).then((r) => r.data),
    refetchInterval: 60000,
  });

  const suspendMutation = useMutation({
    mutationFn: clientsApi.suspend,
    onSuccess: () => qc.invalidateQueries(["clients"]),
  });

  const activateMutation = useMutation({
    mutationFn: clientsApi.activate,
    onSuccess: () => qc.invalidateQueries(["clients"]),
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Clients</h2>
        <p className="text-gray-500 text-sm">{clients.length} registered ISP subscribers</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-3 text-gray-500 font-medium">Name</th>
              <th className="text-left p-3 text-gray-500 font-medium">Email</th>
              <th className="text-left p-3 text-gray-500 font-medium">Odoo ID</th>
              <th className="text-left p-3 text-gray-500 font-medium">Max Devices</th>
              <th className="text-left p-3 text-gray-500 font-medium">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center p-8 text-gray-600">Loading...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={6} className="text-center p-8 text-gray-600">No clients yet</td></tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-xs text-gray-400">{c.email}</td>
                  <td className="p-3 text-xs font-mono text-gray-600">{c.odoo_partner_id || "–"}</td>
                  <td className="p-3 text-center">{c.max_devices}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.is_active ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                    }`}>
                      {c.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="p-3">
                    {c.is_active ? (
                      <button
                        onClick={() => suspendMutation.mutate(c.id)}
                        className="text-gray-600 hover:text-red-400"
                        title="Suspend"
                      >
                        <UserX size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => activateMutation.mutate(c.id)}
                        className="text-gray-600 hover:text-green-400"
                        title="Activate"
                      >
                        <UserCheck size={14} />
                      </button>
                    )}
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
