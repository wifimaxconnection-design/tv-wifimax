import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, CheckCircle, XCircle, Wifi,
  Server, Radio, Globe, Cpu, Scissors, Clock, Bell
} from "lucide-react";
import clsx from "clsx";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import api from "../api/client";

// ── API helpers ───────────────────────────────────────────────
const nocApi = {
  dashboard:    () => api.get("/noc/dashboard"),
  events:       (p) => api.get("/noc/events", { params: p }),
  ackEvent:     (id, by) => api.patch(`/noc/events/${id}/acknowledge?by=${by}`),
  resolveEvent: (id) => api.patch(`/noc/events/${id}/resolve`),
  fiberCuts:    () => api.get("/noc/fiber-cuts"),
  maintenance:  () => api.get("/noc/maintenance"),
};

// ── Severity styles ───────────────────────────────────────────
const SEV = {
  disaster: { bg: "bg-red-900/60",   border: "border-red-700",   text: "text-red-300",   dot: "bg-red-500",    label: "DESASTRE" },
  critical: { bg: "bg-orange-900/40",border: "border-orange-700",text: "text-orange-300",dot: "bg-orange-500", label: "CRÍTICO"  },
  warning:  { bg: "bg-yellow-900/30",border: "border-yellow-700",text: "text-yellow-300",dot: "bg-yellow-400", label: "ALERTA"  },
  info:     { bg: "bg-blue-900/20",  border: "border-blue-800",  text: "text-blue-300",  dot: "bg-blue-400",   label: "INFO"    },
};

// ── Service status badge ──────────────────────────────────────
function ServiceBadge({ name, status, latency_ms }) {
  const s = {
    up:       "bg-green-900/40 border-green-700 text-green-400",
    degraded: "bg-yellow-900/40 border-yellow-700 text-yellow-400",
    down:     "bg-red-900/40 border-red-700 text-red-400",
  }[status] || "bg-gray-800 border-gray-700 text-gray-400";

  const icon = status === "up"
    ? <CheckCircle size={13} />
    : status === "down"
    ? <XCircle size={13} />
    : <AlertTriangle size={13} />;

  return (
    <div className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium", s)}>
      {icon}
      <span className="capitalize">{name.replace("-", " ")}</span>
      {latency_ms && <span className="opacity-60 ml-1">{Math.round(latency_ms)}ms</span>}
    </div>
  );
}

// ── NOC Event Row ─────────────────────────────────────────────
function EventRow({ event, onAck, onResolve }) {
  const s = SEV[event.severity] || SEV.info;
  const time = new Date(event.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={clsx("flex items-start gap-3 p-3 rounded-xl border mb-2 transition-all", s.bg, s.border)}>
      <div className={clsx("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", s.dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx("text-xs font-bold", s.text)}>{s.label}</span>
          <span className="text-xs text-gray-500">{event.source_service}</span>
          {event.affected_count > 0 && (
            <span className="text-xs text-gray-400 bg-gray-800 px-1.5 rounded">
              {event.affected_count} afectados
            </span>
          )}
          <span className="text-xs text-gray-600 ml-auto">{time}</span>
        </div>
        <p className="text-sm text-gray-200 mt-0.5 font-medium">{event.title}</p>
        {event.affected_entity && (
          <p className="text-xs text-gray-500 mt-0.5">{event.affected_entity}</p>
        )}
      </div>
      {event.status === "open" && (
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onAck(event.id, "noc")}
            className="text-xs px-2 py-1 bg-yellow-900/40 hover:bg-yellow-900/70 border border-yellow-800 rounded text-yellow-300">
            ACK
          </button>
          <button onClick={() => onResolve(event.id)}
            className="text-xs px-2 py-1 bg-green-900/40 hover:bg-green-900/70 border border-green-800 rounded text-green-300">
            OK
          </button>
        </div>
      )}
      {event.status !== "open" && (
        <span className={clsx("text-xs px-2 py-1 rounded",
          event.status === "resolved" ? "text-green-500 bg-green-900/20" : "text-yellow-500 bg-yellow-900/20"
        )}>
          {event.status === "resolved" ? "Resuelto" : "ACK"}
        </span>
      )}
    </div>
  );
}

// ── Fiber Cut Card ────────────────────────────────────────────
function FiberCutCard({ cut }) {
  return (
    <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Scissors size={14} className="text-red-400" />
        <span className="font-semibold text-sm text-red-300">Corte de fibra</span>
        <span className={clsx(
          "ml-auto text-xs px-2 py-0.5 rounded-full",
          cut.status === "repairing" ? "bg-yellow-900/50 text-yellow-300"
            : cut.status === "investigating" ? "bg-blue-900/50 text-blue-300"
            : "bg-red-900/50 text-red-300"
        )}>
          {cut.status}
        </span>
      </div>
      <p className="text-sm text-gray-300"><strong>OLT:</strong> {cut.olt_name}</p>
      <p className="text-sm text-gray-300"><strong>PON:</strong> {cut.pon_interface}</p>
      <p className="text-sm text-gray-300"><strong>ONUs:</strong> {cut.affected_onus} afectadas</p>
      {cut.location_desc && <p className="text-xs text-gray-500 mt-1">{cut.location_desc}</p>}
      {cut.tech_assigned && (
        <p className="text-xs text-gray-400 mt-1">Técnico: {cut.tech_assigned}</p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL NOC
// ════════════════════════════════════════════════════════════

export default function NOC() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["noc-dashboard"],
    queryFn: () => nocApi.dashboard().then(r => r.data),
    refetchInterval: 15000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["noc-events", filter],
    queryFn: () => nocApi.events({ status: filter, limit: 50 }).then(r => r.data.data),
    refetchInterval: 10000,
  });

  const ackMutation = useMutation({
    mutationFn: ({ id, by }) => nocApi.ackEvent(id, by),
    onSuccess: () => qc.invalidateQueries(["noc-events"]),
  });

  const resolveMutation = useMutation({
    mutationFn: (id) => nocApi.resolveEvent(id),
    onSuccess: () => { qc.invalidateQueries(["noc-events"]); qc.invalidateQueries(["noc-dashboard"]); },
  });

  const net = dash?.network || {};
  const services = dash?.platform?.services || [];
  const fiberCuts = dash?.fiber_cuts || [];
  const recentEvents = dash?.events?.recent || [];

  // ── Calcular estado global ────────────────────────────────
  const servicesUp   = services.filter(s => s.status === "up").length;
  const servicesDown = services.filter(s => s.status === "down").length;
  const globalStatus = servicesDown === 0 ? "operational" : servicesUp > 0 ? "degraded" : "outage";

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity size={20} className="text-brand-500" />
            NOC — Centro de Operaciones
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Estado en tiempo real · actualización cada 15s
          </p>
        </div>
        <div className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold",
          globalStatus === "operational" ? "bg-green-900/30 border-green-700 text-green-400"
            : globalStatus === "degraded" ? "bg-yellow-900/30 border-yellow-700 text-yellow-400"
            : "bg-red-900/40 border-red-700 text-red-400"
        )}>
          {globalStatus === "operational" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {globalStatus === "operational" ? "OPERACIONAL"
            : globalStatus === "degraded" ? "DEGRADADO" : "INTERRUPCIÓN"}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: "Servicios UP",     value: servicesUp,              color: "text-green-400" },
          { label: "Servicios DOWN",   value: servicesDown,            color: "text-red-400" },
          { label: "Eventos abiertos", value: net.events_open ?? 0,    color: "text-orange-400" },
          { label: "Cortes fibra",     value: net.fiber_cuts_open ?? 0,color: "text-red-500" },
          { label: "Sesiones live",    value: net.sessions_live ?? 0,  color: "text-brand-400" },
          { label: "BGP established",  value: net.bgp_established ?? 0,color: "text-blue-400" },
          { label: "Routers online",   value: net.routers_online ?? 0, color: "text-purple-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className={clsx("text-2xl font-bold", color)}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Services Health Grid */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Estado de Microservicios
        </h3>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => <ServiceBadge key={s.name} {...s} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Events Panel */}
        <div className="xl:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-sm">Eventos NOC</h3>
              <div className="flex gap-1">
                {["open", "acknowledged", "resolved"].map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={clsx("text-xs px-2.5 py-1 rounded-lg transition-colors capitalize",
                      filter === f ? "bg-brand-500 text-white" : "text-gray-500 hover:bg-gray-800")}>
                    {f === "open" ? "Abiertos" : f === "acknowledged" ? "ACK" : "Resueltos"}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 max-h-[480px] overflow-y-auto">
              {events.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                  <CheckCircle size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin eventos {filter}</p>
                </div>
              ) : events.map((e) => (
                <EventRow key={e.id} event={e}
                  onAck={(id, by) => ackMutation.mutate({ id, by })}
                  onResolve={(id) => resolveMutation.mutate(id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">

          {/* Fiber Cuts */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Scissors size={14} className="text-red-400" />
              <h3 className="font-semibold text-sm">Cortes de Fibra Activos</h3>
              {fiberCuts.length > 0 && (
                <span className="ml-auto bg-red-900/50 text-red-300 text-xs px-2 py-0.5 rounded-full">
                  {fiberCuts.length}
                </span>
              )}
            </div>
            <div className="p-3 max-h-[280px] overflow-y-auto space-y-2">
              {fiberCuts.length === 0 ? (
                <p className="text-center text-gray-600 text-xs py-6">Sin cortes activos</p>
              ) : fiberCuts.map((c) => <FiberCutCard key={c.id} cut={c} />)}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm text-gray-400 uppercase tracking-wider">Red ISP</h3>
            {[
              { label: "Canales IPTV activos",  v: net.channels_active ?? 0,      icon: Radio  },
              { label: "Clientes activos",       v: net.clients_active ?? 0,       icon: Server },
              { label: "Suscripciones",          v: net.subscriptions_active ?? 0, icon: Globe  },
              { label: "Pools IPv6 activos",     v: net.ipv6_pools_active ?? 0,    icon: Wifi   },
              { label: "Mantenimientos activos", v: net.maintenances_active ?? 0,  icon: Clock  },
            ].map(({ label, v, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-400">
                  <Icon size={13} />
                  <span>{label}</span>
                </div>
                <span className="font-bold text-white">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
