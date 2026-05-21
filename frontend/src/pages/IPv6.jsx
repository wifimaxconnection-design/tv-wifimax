import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Globe, Wifi, X, Check } from "lucide-react";
import clsx from "clsx";
import api from "../api/client";

const ipv6Api = {
  pools:       () => api.get("/ipv6/pools"),
  createPool:  (d) => api.post("/ipv6/pools", d),
  deletePool:  (id) => api.delete(`/ipv6/pools/${id}`),
  subscribers: (p) => api.get("/ipv6/subscribers", { params: p }),
  stats:       () => api.get("/ipv6/stats"),
  delegate:    (d) => api.post("/ipv6/delegate", d),
  genCommands: (d) => api.post("/ipv6/mikrotik/generate/ipv6-pool", d),
};

function PoolModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState({
    pool_name: "", ipv6_prefix: "2806:106e::", delegated_size: 56,
    wan_mode: "dhcpv6-pd", vlan: "", description: "",
    dns_primary: "2001:4860:4860::8888", dns_secondary: "2001:4860:4860::8844",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="font-bold flex items-center gap-2">
            <Globe size={16} className="text-brand-500" /> Nuevo Pool IPv6
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nombre del pool *</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="FTTH-PD-NORTE" value={form.pool_name} onChange={e => set("pool_name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Prefijo IPv6 (CIDR) *</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="2806:xxxx::/32" value={form.ipv6_prefix} onChange={e => set("ipv6_prefix", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tamaño delegado</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.delegated_size} onChange={e => set("delegated_size", Number(e.target.value))}>
                {[48,52,56,60,64].map(s => <option key={s} value={s}>/{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Modo WAN</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.wan_mode} onChange={e => set("wan_mode", e.target.value)}>
                {["dhcpv6-pd","slaac","static","pppoe-ipv6"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">DNS primario IPv6</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                value={form.dns_primary} onChange={e => set("dns_primary", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">VLAN</label>
              <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="200" value={form.vlan} onChange={e => set("vlan", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descripción</label>
            <textarea rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Pool IPv6 zona Norte..." value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700">Cancelar</button>
          <button disabled={!form.pool_name || !form.ipv6_prefix || saving}
            onClick={() => onSave({ ...form, vlan: form.vlan ? Number(form.vlan) : null })}
            className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-40">
            {saving ? "Creando…" : "Crear pool IPv6"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IPv6() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [genCmds, setGenCmds] = useState(null);

  const { data: pools = [], isLoading } = useQuery({
    queryKey: ["ipv6-pools"],
    queryFn: () => ipv6Api.pools().then(r => r.data.data),
    refetchInterval: 30000,
  });
  const { data: stats } = useQuery({
    queryKey: ["ipv6-stats"],
    queryFn: () => ipv6Api.stats().then(r => r.data.data),
    refetchInterval: 30000,
  });
  const { data: subs = [] } = useQuery({
    queryKey: ["ipv6-subs"],
    queryFn: () => ipv6Api.subscribers({}).then(r => r.data.data),
    refetchInterval: 60000,
  });

  const createMutation = useMutation({
    mutationFn: ipv6Api.createPool,
    onSuccess: () => { qc.invalidateQueries(["ipv6-pools"]); setShowCreate(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: ipv6Api.deletePool,
    onSuccess: () => qc.invalidateQueries(["ipv6-pools"]),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe size={18} className="text-brand-500" /> IPv6 Dual Stack
          </h2>
          <p className="text-gray-500 text-sm">Pools, DHCPv6-PD, delegación de prefijos</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm">
          <Plus size={14} /> Nuevo pool IPv6
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Pools activos",       v: stats.pools_active,        color: "text-brand-400" },
            { label: "Suscriptores IPv6",   v: stats.subscribers_active,  color: "text-green-400" },
            { label: "Prefijos delegados",  v: stats.prefixes_delegated,  color: "text-blue-400"  },
            { label: "BGP established",     v: stats.bgp_established,     color: "text-purple-400"},
          ].map(({ label, v, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className={clsx("text-2xl font-bold", color)}>{v ?? 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pools table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-sm">Pools IPv6</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-gray-500 font-medium">Pool</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Prefijo</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Delegado</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Modo WAN</th>
              <th className="px-4 py-3 text-gray-500 font-medium">VLAN</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-600">Cargando…</td></tr>
            ) : pools.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-600">Sin pools IPv6. Creá el primero.</td></tr>
            ) : pools.map(p => (
              <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                <td className="px-4 py-3 font-medium">{p.pool_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-blue-400">{p.ipv6_prefix}</td>
                <td className="px-4 py-3 text-xs text-gray-400">/{p.delegated_size}</td>
                <td className="px-4 py-3"><span className="text-xs bg-gray-800 px-2 py-0.5 rounded">{p.wan_mode}</span></td>
                <td className="px-4 py-3 text-xs text-gray-400">{p.vlan ?? "–"}</td>
                <td className="px-4 py-3">
                  <span className={clsx("text-xs px-2 py-0.5 rounded-full",
                    p.enabled ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500")}>
                    {p.enabled ? "● Activo" : "○ Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteMutation.mutate(p.id)}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent IPv6 subscribers */}
      {subs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="font-semibold text-sm">Suscriptores con Prefijo IPv6 Delegado</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-500 font-medium">ONU Serial</th>
                <th className="px-4 py-3 text-gray-500 font-medium">Prefijo Delegado</th>
                <th className="px-4 py-3 text-gray-500 font-medium">Pool</th>
                <th className="px-4 py-3 text-gray-500 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {subs.slice(0, 20).map(s => (
                <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-4 py-3 font-mono text-xs">{s.onu_serial}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-400">{s.delegated_prefix ?? "–"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{s.pool_name}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full",
                      s.status === "active" ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500")}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <PoolModal
          onClose={() => setShowCreate(false)}
          saving={createMutation.isPending}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}
    </div>
  );
}
