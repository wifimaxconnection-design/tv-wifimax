import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Network, Server, CheckCircle, XCircle, AlertTriangle, X } from "lucide-react";
import clsx from "clsx";
import api from "../api/client";

const bgpApi = {
  summary:     () => api.get("/bgp/summary"),
  routers:     () => api.get("/bgp/routers"),
  peers:       () => api.get("/bgp/peers"),
  addRouter:   (d) => api.post("/bgp/routers", d),
  routerStatus:(id) => api.get(`/bgp/routers/${id}/status`),
  genCommands: (p) => api.post("/bgp/mikrotik/generate/bgp-ipv6", null, { params: p }),
};

const STATUS_STYLE = {
  established: "bg-green-900/40 text-green-400 border-green-800",
  active:      "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  idle:        "bg-gray-800 text-gray-500 border-gray-700",
  error:       "bg-red-900/40 text-red-400 border-red-800",
};

function RouterModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState({ name:"", ip_address:"", username:"admin", password:"", api_port:80, local_as:64512, role:"edge", site:"", pop:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="font-bold flex items-center gap-2"><Server size={16} className="text-brand-500"/>Registrar Router MikroTik</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18}/></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {[["Nombre","name","CHR-CORE-01"],["IP Address","ip_address","192.168.1.1"],["Usuario","username","admin"],["Contraseña","password",""],["Sitio/POP","site",""]].map(([label,key,ph])=>(
            <div key={key}>
              <label className="text-xs text-gray-400 mb-1 block">{label}</label>
              <input type={key==="password"?"password":"text"} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={ph} value={form[key]} onChange={e=>set(key,e.target.value)}/>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs text-gray-400 mb-1 block">Puerto REST</label>
              <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" value={form.api_port} onChange={e=>set("api_port",Number(e.target.value))}/></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Local AS</label>
              <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" value={form.local_as} onChange={e=>set("local_as",Number(e.target.value))}/></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Rol</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" value={form.role} onChange={e=>set("role",e.target.value)}>
                {["core","edge","distribution","access"].map(r=><option key={r} value={r}>{r}</option>)}</select></div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700">Cancelar</button>
          <button disabled={!form.name||!form.ip_address||saving} onClick={()=>onSave(form)}
            className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-40">
            {saving?"Registrando…":"Registrar router"}</button>
        </div>
      </div>
    </div>
  );
}

export default function BGP() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedRouter, setSelectedRouter] = useState(null);
  const [genResult, setGenResult] = useState(null);

  const { data: summary }          = useQuery({ queryKey:["bgp-summary"],  queryFn:()=>bgpApi.summary().then(r=>r.data.data),  refetchInterval:30000 });
  const { data: routers=[], iRL }  = useQuery({ queryKey:["bgp-routers"],  queryFn:()=>bgpApi.routers().then(r=>r.data.data),  refetchInterval:30000 });
  const { data: peers=[] }         = useQuery({ queryKey:["bgp-peers"],    queryFn:()=>bgpApi.peers().then(r=>r.data.data),     refetchInterval:15000 });

  const addRouter = useMutation({ mutationFn:bgpApi.addRouter, onSuccess:()=>{qc.invalidateQueries(["bgp-routers"]);setShowAdd(false);} });

  const checkRouter = async (id) => {
    const r = await bgpApi.routerStatus(id);
    setSelectedRouter(r.data);
  };

  const s = summary || {};

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Network size={18} className="text-brand-500"/>BGP Orchestrator</h2>
          <p className="text-gray-500 text-sm">IPv6 carrier-grade routing — RouterOS v7</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm">
          <Plus size={14}/> Agregar Router
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:"Routers Online",     v:s.routers_online??0,    color:"text-green-400"},
          {label:"BGP Established",    v:s.peers_established??0, color:"text-brand-400"},
          {label:"Total Peers",        v:s.peers_total??0,       color:"text-blue-400"},
          {label:"Prefijos Anunciados",v:s.announcements_active??0,color:"text-purple-400"},
        ].map(({label,v,color})=>(
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className={clsx("text-2xl font-bold",color)}>{v}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Routers */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800"><h3 className="font-semibold text-sm">Routers MikroTik</h3></div>
          <div className="divide-y divide-gray-800">
            {routers.length===0 ? <p className="text-center py-8 text-gray-600 text-sm">Sin routers registrados</p>
            : routers.map(r=>(
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className={clsx("w-2 h-2 rounded-full", r.status==="online"?"bg-green-400":"r.status==='offline'"?"bg-red-400":"bg-gray-500")}/>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.ip_address} · AS{r.local_as} · {r.site||r.role}</p>
                </div>
                <span className={clsx("text-xs px-2 py-0.5 rounded-full border",STATUS_STYLE[r.status]||STATUS_STYLE.idle)}>
                  {r.status}</span>
                <button onClick={()=>checkRouter(r.id)} className="text-xs text-brand-400 hover:text-brand-300 ml-2">Check</button>
              </div>
            ))}
          </div>
        </div>

        {/* BGP Peers */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800"><h3 className="font-semibold text-sm">BGP Peers IPv6</h3></div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800 text-left">
              <th className="px-3 py-2 text-gray-500 text-xs font-medium">Peer</th>
              <th className="px-3 py-2 text-gray-500 text-xs font-medium">Tipo</th>
              <th className="px-3 py-2 text-gray-500 text-xs font-medium">Estado</th>
              <th className="px-3 py-2 text-gray-500 text-xs font-medium">RX</th>
            </tr></thead>
            <tbody>
              {peers.length===0 ? <tr><td colSpan={4} className="text-center py-8 text-gray-600 text-xs">Sin peers BGP</td></tr>
              : peers.map(p=>(
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-3 py-2">
                    <p className="font-medium text-xs">{p.peer_name}</p>
                    <p className="text-xs text-gray-500 font-mono">{p.remote_address}</p>
                  </td>
                  <td className="px-3 py-2"><span className="text-xs bg-gray-800 px-1.5 py-0.5 rounded">{p.peer_type}</span></td>
                  <td className="px-3 py-2">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full border",STATUS_STYLE[p.status]||STATUS_STYLE.idle)}>{p.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">{p.prefixes_rx}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Router status detail */}
      {selectedRouter && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex justify-between mb-3">
            <h3 className="font-semibold">{selectedRouter.router} — Estado BGP</h3>
            <button onClick={()=>setSelectedRouter(null)} className="text-gray-500 hover:text-white"><X size={16}/></button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-800 rounded-lg p-3 text-center"><p className="text-xl font-bold text-green-400">{selectedRouter.bgp_established??0}</p><p className="text-xs text-gray-500">Established</p></div>
            <div className="bg-gray-800 rounded-lg p-3 text-center"><p className="text-xl font-bold text-blue-400">{selectedRouter.bgp_sessions_total??0}</p><p className="text-xs text-gray-500">Total sessions</p></div>
          </div>
          {selectedRouter.sessions?.length > 0 && (
            <div className="overflow-x-auto">
              <pre className="text-xs text-green-400 font-mono bg-gray-950 rounded p-3 overflow-auto max-h-40">
                {JSON.stringify(selectedRouter.sessions, null, 2)}
              </pre>
            </div>
          )}
          {selectedRouter.error && <p className="text-xs text-red-400 mt-2">⚠ {selectedRouter.error}</p>}
        </div>
      )}

      {showAdd && <RouterModal onClose={()=>setShowAdd(false)} saving={addRouter.isPending} onSave={d=>addRouter.mutate(d)}/>}
    </div>
  );
}
