import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, Plus, CheckCircle, XCircle, Clock, X } from "lucide-react";
import clsx from "clsx";
import api from "../api/client";

const alertsApi = {
  rules:     () => api.get("/alerts/rules"),
  incidents: () => api.get("/alerts/incidents"),
  testAlert: (phone) => api.post(`/alerts/test?phone=${encodeURIComponent(phone)}`),
  createRule:(d) => api.post("/alerts/rules", d),
  sendAlert: (d) => api.post("/alerts/send", d),
};

export default function Alerts() {
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [showRule, setShowRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({ name:"", severity_min:"critical", recipients:"", cooldown_minutes:15, max_per_hour:4, enabled:true });

  const { data: rules=[] }     = useQuery({ queryKey:["alert-rules"],     queryFn:()=>alertsApi.rules().then(r=>r.data.data) });
  const { data: incidents=[] } = useQuery({ queryKey:["alert-incidents"], queryFn:()=>alertsApi.incidents().then(r=>r.data.data), refetchInterval:30000 });

  const testMutation = useMutation({
    mutationFn: (phone) => alertsApi.testAlert(phone),
    onSuccess: (r) => setTestResult(r.data),
  });

  const ruleMutation = useMutation({
    mutationFn: (d) => alertsApi.createRule(d),
    onSuccess: () => { qc.invalidateQueries(["alert-rules"]); setShowRule(false); },
  });

  const sentCount = incidents.filter(i=>i.status==="sent").length;
  const failCount = incidents.filter(i=>i.status==="failed").length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Bell size={18} className="text-brand-500"/>Alertas WhatsApp NOC</h2>
          <p className="text-gray-500 text-sm">Evolution API / Meta Cloud API — deduplicación y cooldown</p>
        </div>
        <button onClick={()=>setShowRule(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm">
          <Plus size={14}/> Nueva regla
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {label:"Reglas activas",  v:rules.filter(r=>r.enabled).length, color:"text-brand-400"},
          {label:"Enviadas hoy",    v:sentCount,                           color:"text-green-400"},
          {label:"Fallidas",        v:failCount,                           color:"text-red-400"},
        ].map(({label,v,color})=>(
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className={clsx("text-2xl font-bold",color)}>{v}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Test alert */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Send size={14} className="text-brand-500"/>Enviar alerta de prueba</h3>
        <div className="flex gap-3">
          <input className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="+5219991234567 (con código de país)" value={testPhone} onChange={e=>setTestPhone(e.target.value)}/>
          <button disabled={!testPhone||testMutation.isPending}
            onClick={()=>{ setTestResult(null); testMutation.mutate(testPhone); }}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm disabled:opacity-40">
            {testMutation.isPending?"Enviando…":"Enviar prueba"}
          </button>
        </div>
        {testResult && (
          <div className={clsx("mt-3 text-xs px-3 py-2 rounded-lg border",
            testResult.status==="success"?"bg-green-900/30 border-green-800 text-green-400":"bg-red-900/30 border-red-800 text-red-400")}>
            {testResult.status==="success" ? "✓ Mensaje enviado correctamente" : `✗ Error: ${testResult.error||"Fallo al enviar"}`}
          </div>
        )}
      </div>

      {/* Alert Rules */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800"><h3 className="font-semibold text-sm">Reglas de alerta</h3></div>
        {rules.length===0 ? (
          <div className="text-center py-8 text-gray-600"><Bell size={28} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm">Sin reglas configuradas</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Nombre</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Severidad mín.</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Cooldown</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Estado</th>
            </tr></thead>
            <tbody>
              {rules.map(r=>(
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3"><span className={clsx("text-xs px-2 py-0.5 rounded-full",
                    r.severity_min==="disaster"?"bg-red-900/50 text-red-400":r.severity_min==="critical"?"bg-orange-900/40 text-orange-400":"bg-yellow-900/30 text-yellow-400")}>
                    {r.severity_min}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.cooldown_minutes} min</td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full",r.enabled?"bg-green-900/40 text-green-400":"bg-gray-800 text-gray-500")}>
                      {r.enabled?"● Activa":"○ Inactiva"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Incidents log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800"><h3 className="font-semibold text-sm">Historial de alertas</h3></div>
        <div className="divide-y divide-gray-800 max-h-72 overflow-y-auto">
          {incidents.length===0 ? <p className="text-center py-8 text-gray-600 text-xs">Sin historial</p>
          : incidents.slice(0,30).map(i=>(
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              {i.status==="sent" ? <CheckCircle size={13} className="text-green-400 flex-shrink-0"/>
                : i.status==="failed" ? <XCircle size={13} className="text-red-400 flex-shrink-0"/>
                : <Clock size={13} className="text-gray-500 flex-shrink-0"/>}
              <span className="text-xs text-gray-400 font-mono">{i.recipient?.replace(/\d(?=\d{4})/g,"*") || "–"}</span>
              <span className={clsx("text-xs px-1.5 py-0.5 rounded",i.status==="sent"?"bg-green-900/40 text-green-400":"bg-red-900/40 text-red-400")}>{i.status}</span>
              <span className="text-xs text-gray-600 ml-auto">{new Date(i.sent_at).toLocaleTimeString("es-MX")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rule modal */}
      {showRule && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="font-bold">Nueva regla de alerta</h3>
              <button onClick={()=>setShowRule(false)} className="text-gray-500 hover:text-white"><X size={18}/></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div><label className="text-xs text-gray-400 mb-1 block">Nombre</label>
                <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  value={ruleForm.name} onChange={e=>setRuleForm(f=>({...f,name:e.target.value}))}/></div>
              <div><label className="text-xs text-gray-400 mb-1 block">Severidad mínima</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none"
                  value={ruleForm.severity_min} onChange={e=>setRuleForm(f=>({...f,severity_min:e.target.value}))}>
                  {["info","warning","critical","disaster"].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="text-xs text-gray-400 mb-1 block">Números destinatarios (separados por coma)</label>
                <textarea rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="+5219991234567,+5219997654321"
                  value={ruleForm.recipients} onChange={e=>setRuleForm(f=>({...f,recipients:e.target.value}))}/></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-400 mb-1 block">Cooldown (min)</label>
                  <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none"
                    value={ruleForm.cooldown_minutes} onChange={e=>setRuleForm(f=>({...f,cooldown_minutes:Number(e.target.value)}))}/></div>
                <div><label className="text-xs text-gray-400 mb-1 block">Máx/hora</label>
                  <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none"
                    value={ruleForm.max_per_hour} onChange={e=>setRuleForm(f=>({...f,max_per_hour:Number(e.target.value)}))}/></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
              <button onClick={()=>setShowRule(false)} className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700">Cancelar</button>
              <button disabled={!ruleForm.name||ruleMutation.isPending}
                onClick={()=>ruleMutation.mutate({...ruleForm, recipients: ruleForm.recipients.split(",").map(s=>s.trim()).filter(Boolean)})}
                className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-40">
                {ruleMutation.isPending?"Creando…":"Crear regla"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
