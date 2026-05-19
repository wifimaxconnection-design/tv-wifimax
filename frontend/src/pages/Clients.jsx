import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi, packagesApi } from "../api/client";
import {
  Plus, Pencil, UserX, UserCheck, X, Phone, Mail,
  MapPin, Smartphone, Calendar, Package, CreditCard,
  AlertTriangle, Copy, Download, CheckCheck, Tv,
  ChevronDown, ChevronUp,
} from "lucide-react";
import clsx from "clsx";

// ─── Helpers ────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return "–";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
};

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

// ════════════════════════════════════════════════════════════
// MODAL: REGISTRAR / EDITAR CLIENTE
// ════════════════════════════════════════════════════════════
function ClientModal({ initial, onClose, onSave, saving }) {
  const empty = { name: "", email: "", phone: "", address: "", max_devices: 3, odoo_partner_id: "", notes: "" };
  const [form, setForm] = useState(initial ?? empty);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.email.trim();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="font-bold">{initial ? "Editar cliente" : "Registrar nuevo cliente"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nombre completo *</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Juan García" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email *</label>
              <input type="email" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="juan@ejemplo.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Teléfono</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="+54 11 1234-5678" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Dirección</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Av. Siempreviva 742" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dispositivos simultáneos</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.max_devices} onChange={(e) => set("max_devices", Number(e.target.value))}>
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} dispositivo{n>1?"s":""}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ID Odoo (partner)</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="123" value={form.odoo_partner_id} onChange={(e) => set("odoo_partner_id", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas internas</label>
            <textarea rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Observaciones, datos de instalación…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700">Cancelar</button>
          <button disabled={!valid || saving} onClick={() => onSave(form)}
            className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-40">
            {saving ? "Guardando…" : initial ? "Guardar cambios" : "Registrar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MODAL: ASIGNAR PAQUETE A CLIENTE
// ════════════════════════════════════════════════════════════
function AssignPackageModal({ client, onClose, onSave, saving, error, success }) {
  const today = new Date().toISOString().split("T")[0];
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
  const [form, setForm] = useState({ package_id: "", starts_at: today, expires_at: nextYear });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: () => packagesApi.list().then((r) => r.data),
  });

  const selectedPkg = packages.find((p) => p.id === form.package_id);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      {/* flex-col + max-h fija → el footer siempre visible, el body hace scroll */}
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header — fijo arriba */}
        <div className="px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <h3 className="font-bold text-base">Asignar paquete de canales</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Cliente: <span className="text-white font-medium">{client.name}</span>
          </p>
        </div>

        {/* Body — hace scroll cuando hay muchos paquetes */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Selector de paquete */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Seleccioná el paquete de canales *
            </label>
            {packages.length === 0 ? (
              <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-3 text-xs text-yellow-600">
                No hay paquetes configurados. Creá uno en la sección Paquetes primero.
              </div>
            ) : (
              <div className="space-y-2">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, package_id: pkg.id }))}
                    className={clsx(
                      "w-full text-left rounded-xl p-3 border transition-all",
                      form.package_id === pkg.id
                        ? "bg-brand-500/20 border-brand-500 ring-1 ring-brand-500"
                        : "bg-gray-800/50 border-gray-700 hover:border-gray-500 hover:bg-gray-800"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Radio visual */}
                      <div className={clsx(
                        "mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                        form.package_id === pkg.id
                          ? "border-brand-500 bg-brand-500"
                          : "border-gray-600"
                      )}>
                        {form.package_id === pkg.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{pkg.name}</p>
                        {pkg.description && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-snug">{pkg.description}</p>
                        )}
                        <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                          <span>📺 {pkg.channel_ids?.length ?? 0} canales</span>
                          <span>📱 máx. {pkg.max_devices} disp.</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-brand-400 text-base">${pkg.price}</p>
                        <p className="text-xs text-gray-500">/mes</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Fecha de inicio *</label>
              <input
                type="date"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Fecha de vencimiento *</label>
              <input
                type="date"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
          </div>

          {/* Preview del paquete seleccionado */}
          {selectedPkg && (
            <div className="bg-green-900/10 border border-green-900/30 rounded-xl px-4 py-3">
              <p className="text-xs text-green-400 font-medium mb-1">✓ Paquete seleccionado</p>
              <p className="font-semibold text-sm">{selectedPkg.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedPkg.channel_ids?.length ?? 0} canales ·
                máx. {selectedPkg.max_devices} dispositivos ·
                ${selectedPkg.price}/mes
              </p>
            </div>
          )}
        </div>

        {/* Feedback */}
        {error && (
          <div className="mx-6 mb-2 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-400">
            ⚠ {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mb-2 px-3 py-2 bg-green-900/30 border border-green-800/50 rounded-lg text-xs text-green-400">
            ✓ Paquete asignado correctamente
          </div>
        )}

        {/* Footer — fijo abajo, siempre visible */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-800 flex-shrink-0 bg-gray-900 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!form.package_id || saving}
            onClick={() => onSave({
              client_id: client.id,
              package_id: form.package_id,
              starts_at: form.starts_at + "T00:00:00",
              expires_at: form.expires_at + "T23:59:59",
            })}
            className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Asignando…" : "Asignar paquete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MODAL: PLAYLIST M3U PARA DISPOSITIVO FINAL
// ════════════════════════════════════════════════════════════
function PlaylistModal({ client, onClose }) {
  const [profile, setProfile] = useState("1080p");
  const { copied, copy } = useCopy();

  const { data: info, isLoading, isError } = useQuery({
    queryKey: ["playlist-info", client.id],
    queryFn: () => clientsApi.playlistInfo(client.id).then((r) => r.data),
    retry: false,
  });

  const PROFILES = ["1080p", "720p", "480p", "1080p_h265", "720p_h265"];
  const available = info?.available_profiles ?? [];

  const baseUrl = `${window.location.protocol}//${window.location.hostname}/hls`;
  const m3uUrl = `${window.location.protocol}//${window.location.hostname}/api/v1/clients/${client.id}/m3u?profile=${profile}&base_url=${encodeURIComponent(baseUrl)}`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <Tv size={16} className="text-brand-500" />
              Playlist para dispositivo final
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Cliente: <span className="text-white">{client.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1">

          {/* Estado de carga */}
          {isLoading && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">
              Verificando suscripciones…
            </div>
          )}

          {/* Sin suscripciones activas */}
          {isError || (!isLoading && info?.active_subscriptions === 0) ? (
            <div className="px-6 py-8 text-center space-y-3">
              <AlertTriangle size={36} className="mx-auto text-yellow-600 opacity-70" />
              <p className="font-semibold">Sin suscripciones activas</p>
              <p className="text-xs text-gray-500">
                Este cliente no tiene paquetes asignados o están vencidos.<br />
                Usá el botón <strong>"Asignar paquete"</strong> en la tabla para agregar uno.
              </p>
            </div>
          ) : !isLoading && info && (
            <div className="px-6 py-5 space-y-5">

              {/* Resumen de acceso */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-900/20 border border-green-900/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-400">{info.total_channels}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Canales</p>
                </div>
                <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-brand-400">{info.active_subscriptions}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Paquetes</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-white">{available.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Calidades</p>
                </div>
              </div>

              {/* Paquetes del cliente */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Paquetes activos incluidos</p>
                <div className="flex flex-wrap gap-2">
                  {info.packages?.map((p) => (
                    <span key={p.id} className="text-xs bg-brand-500/20 text-brand-300 px-2.5 py-1 rounded-full border border-brand-500/30">
                      {p.name}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Vence: <span className="text-gray-400">{fmtDate(info.expires_at)}</span>
                </p>
              </div>

              {/* Selector de calidad */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Seleccioná la calidad de video</p>
                <div className="flex flex-wrap gap-2">
                  {PROFILES.map((p) => {
                    const ok = available.includes(p);
                    return (
                      <button key={p} disabled={!ok} onClick={() => setProfile(p)}
                        className={clsx(
                          "text-xs px-3 py-1.5 rounded-full border transition-all",
                          p === profile && ok ? "bg-brand-500 border-brand-500 text-white font-medium"
                            : ok ? "border-gray-600 text-gray-300 hover:border-gray-400"
                              : "border-gray-800 text-gray-700 cursor-not-allowed"
                        )}>
                        {p}
                        {!ok && <span className="ml-1 text-gray-700">✗</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* URL M3U */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-400 font-medium">
                  🔗 URL de la playlist — perfil <span className="text-brand-400 font-bold">{profile}</span>
                </p>
                <div className="bg-gray-900 rounded-lg p-3">
                  <code className="text-xs text-green-400 break-all leading-relaxed">{m3uUrl}</code>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => copy(m3uUrl)}
                    className="flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors font-medium">
                    {copied
                      ? <><CheckCheck size={14} className="text-green-400" /> ¡Copiado!</>
                      : <><Copy size={14} /> Copiar URL</>}
                  </button>
                  <a href={m3uUrl}
                    download={`playlist_${client.name.replace(/\s+/g, "_").toLowerCase()}_${profile}.m3u`}
                    className="flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors font-medium">
                    <Download size={14} /> Descargar .m3u
                  </a>
                </div>
              </div>

              {/* Instrucciones por dispositivo */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                  Cómo instalar en el dispositivo
                </p>
                {[
                  { icon: "📺", label: "Smart TV (Tizen/WebOS)", steps: "IPTV Smarters o SS IPTV → Agregar lista → URL M3U → Pegar URL" },
                  { icon: "📦", label: "STB / MAG / Android Box", steps: "Configuración → Lista M3U → pegar URL → Guardar" },
                  { icon: "💻", label: "VLC", steps: "Menú Medio → Abrir URL de red → Pegar URL → Reproducir" },
                  { icon: "🎮", label: "Kodi", steps: "Complementos → PVR IPTV Simple Client → Configurar → URL M3U" },
                  { icon: "📱", label: "Android / iPhone", steps: "IPTV Smarters Pro → Agregar → Nombre usuario → URL M3U → cargar" },
                ].map(({ icon, label, steps }) => (
                  <div key={label} className="bg-gray-800/60 border border-gray-800 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-gray-200">{icon} {label}</p>
                    <p className="text-xs text-gray-500 mt-1">{steps}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="w-full py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// FILA EXPANDIBLE: DETALLE DEL CLIENTE
// ════════════════════════════════════════════════════════════
function ClientRow({ client, packages, onEdit, onSuspend, onActivate, onAssign, onPlaylist }) {
  const [expanded, setExpanded] = useState(false);

  // Siempre carga suscripciones para mostrar en la columna "Paquetes activos"
  const { data: subs = [] } = useQuery({
    queryKey: ["client-subs", client.id],
    queryFn: () => clientsApi.subscriptions(client.id).then((r) => r.data),
    staleTime: 30000,
  });

  const activeSubs = subs.filter((s) => {
    const exp = new Date(s.expires_at);
    return s.is_active && exp > new Date();
  });

  return (
    <>
      {/* Fila principal */}
      <tr className={clsx(
        "border-b border-gray-800/60 transition-colors",
        expanded ? "bg-gray-800/40" : "hover:bg-gray-800/20",
        !client.is_active && "opacity-60"
      )}>
        {/* Nombre + expand */}
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-3 text-left w-full"
          >
            <div className={clsx(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
              client.is_active ? "bg-brand-500/20 text-brand-400" : "bg-gray-800 text-gray-500"
            )}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm leading-tight">{client.name}</p>
              <p className="text-xs text-gray-500 truncate">{client.email}</p>
            </div>
            {expanded
              ? <ChevronUp size={14} className="text-gray-500 ml-auto flex-shrink-0" />
              : <ChevronDown size={14} className="text-gray-500 ml-auto flex-shrink-0" />}
          </button>
        </td>

        {/* Teléfono */}
        <td className="px-4 py-3 text-xs text-gray-400">{client.phone || "–"}</td>

        {/* Estado */}
        <td className="px-4 py-3">
          <span className={clsx(
            "text-xs px-2 py-1 rounded-full font-medium",
            client.is_active ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
          )}>
            {client.is_active ? "● Activo" : "● Suspendido"}
          </span>
        </td>

        {/* Paquetes asignados */}
        <td className="px-4 py-3">
          {activeSubs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {activeSubs.map((s) => {
                const pkg = packages.find((p) => p.id === s.package_id);
                return pkg ? (
                  <span key={s.id} className="text-xs bg-green-900/30 text-green-400 border border-green-900/40 px-2 py-0.5 rounded-full">
                    {pkg.name}
                  </span>
                ) : null;
              })}
            </div>
          ) : (
            <span className="text-xs text-gray-600 italic">Sin paquete</span>
          )}
        </td>

        {/* ACCIONES PRINCIPALES — siempre visibles */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 justify-end flex-wrap">
            {/* ASIGNAR PAQUETE */}
            <button
              onClick={(e) => { e.stopPropagation(); onAssign(client); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 border border-brand-500/30 transition-colors font-medium"
              title="Asignar paquete de canales"
            >
              <Package size={12} /> Asignar paquete
            </button>

            {/* GENERAR PLAYLIST */}
            <button
              onClick={(e) => { e.stopPropagation(); onPlaylist(client); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-900/30 transition-colors font-medium"
              title="Generar lista M3U para dispositivo"
            >
              <Tv size={12} /> Ver playlist
            </button>

            {/* EDITAR */}
            <button onClick={(e) => { e.stopPropagation(); onEdit(client); }}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
              title="Editar datos del cliente">
              <Pencil size={13} />
            </button>

            {/* SUSPENDER / REACTIVAR */}
            {client.is_active ? (
              <button onClick={(e) => { e.stopPropagation(); onSuspend(client.id); }}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                title="Suspender cliente">
                <UserX size={13} />
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onActivate(client.id); }}
                className="p-1.5 rounded-lg text-gray-600 hover:text-green-400 hover:bg-green-900/20 transition-colors"
                title="Reactivar cliente">
                <UserCheck size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Fila expandida: detalle completo */}
      {expanded && (
        <tr className="border-b border-gray-800/60 bg-gray-800/20">
          <td colSpan={5} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">

              {/* Contacto */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Contacto</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <Mail size={11} className="text-gray-600" /> {client.email}
                  </div>
                  {client.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                      <Phone size={11} className="text-gray-600" /> {client.phone}
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-start gap-2 text-xs text-gray-300">
                      <MapPin size={11} className="text-gray-600 mt-0.5" /> {client.address}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <Smartphone size={11} className="text-gray-600" /> {client.max_devices} dispositivos
                  </div>
                  {client.odoo_partner_id && (
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                      <CreditCard size={11} className="text-gray-600" /> Odoo #{client.odoo_partner_id}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar size={11} className="text-gray-600" /> Alta: {fmtDate(client.created_at)}
                  </div>
                </div>
              </div>

              {/* Suscripciones */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Suscripciones</p>
                {subs.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">Sin suscripciones</p>
                ) : (
                  <div className="space-y-2">
                    {subs.map((sub) => {
                      const pkg = packages.find((p) => p.id === sub.package_id);
                      const expired = new Date(sub.expires_at) < new Date();
                      return (
                        <div key={sub.id} className={clsx(
                          "rounded-lg p-2.5 border",
                          sub.is_active && !expired
                            ? "bg-green-900/10 border-green-900/30"
                            : "bg-gray-800/40 border-gray-700/50 opacity-60"
                        )}>
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-xs">{pkg?.name ?? "Paquete eliminado"}</p>
                            <span className={clsx("text-xs px-1.5 py-0.5 rounded-full",
                              sub.is_active && !expired ? "bg-green-900/50 text-green-400" : "bg-gray-700 text-gray-500"
                            )}>
                              {expired ? "Vencida" : "Activa"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {fmtDate(sub.starts_at)} → {fmtDate(sub.expires_at)}
                            {pkg && <span className="ml-2 text-brand-400">${pkg.price}/mes</span>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Notas internas</p>
                {client.notes
                  ? <p className="text-xs text-gray-400 leading-relaxed">{client.notes}</p>
                  : <p className="text-xs text-gray-600 italic">Sin notas</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function Clients() {
  const qc = useQueryClient();
  const [showCreate,   setShowCreate]   = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [assigning,    setAssigning]    = useState(null);
  const [playlist,     setPlaylist]     = useState(null);
  const [search,       setSearch]       = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => clientsApi.list({ active_only: false, limit: 500 }).then((r) => r.data),
    refetchInterval: 60000,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: () => packagesApi.list().then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["clients"] });

  const createMutation = useMutation({
    mutationFn: clientsApi.create,
    onSuccess: () => { invalidate(); setShowCreate(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => clientsApi.update(id, data),
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const suspendMutation  = useMutation({ mutationFn: clientsApi.suspend,   onSuccess: invalidate });
  const activateMutation = useMutation({ mutationFn: clientsApi.activate,  onSuccess: invalidate });
  const subMutation = useMutation({
    mutationFn: clientsApi.createSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist-info"] });
      qc.invalidateQueries({ queryKey: ["client-subs"] });
      setAssigning(null);
    },
  });

  const total     = clients.length;
  const active    = clients.filter((c) => c.is_active).length;
  const suspended = total - active;

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.odoo_partner_id || "").includes(q)
    );
  });

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Clientes</h2>
          <p className="text-gray-500 text-sm">
            {active} activos · {suspended} suspendidos · {total} total
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm transition-colors font-medium">
          <Plus size={14} /> Registrar cliente
        </button>
      </div>

      {/* Leyenda de botones */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-500" />
          <strong className="text-brand-400">Asignar paquete</strong> — vincula un paquete de canales al cliente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <strong className="text-green-400">Ver playlist</strong> — genera la URL M3U para configurar en STB/TV/App
        </span>
        <span className="flex items-center gap-1.5 ml-auto cursor-pointer text-gray-600 hover:text-gray-400"
          onClick={() => {}}>
          ↓ Click en una fila para ver detalles completos
        </span>
      </div>

      {/* Buscador */}
      <input className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="Buscar por nombre, email, teléfono…"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {/* Tabla */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-gray-500 font-medium">Cliente</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Teléfono</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Estado</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Paquetes activos</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-600">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <p className="text-gray-600">
                    {search ? "Sin resultados." : "No hay clientes. Registrá el primero."}
                  </p>
                </td>
              </tr>
            ) : filtered.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                packages={packages}
                onEdit={setEditing}
                onSuspend={(id) => suspendMutation.mutate(id)}
                onActivate={(id) => activateMutation.mutate(id)}
                onAssign={setAssigning}
                onPlaylist={setPlaylist}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* MODALES */}
      {showCreate && (
        <ClientModal
          onClose={() => setShowCreate(false)}
          saving={createMutation.isPending}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}
      {editing && (
        <ClientModal
          initial={editing}
          onClose={() => setEditing(null)}
          saving={updateMutation.isPending}
          onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
        />
      )}
      {assigning && (
        <AssignPackageModal
          client={assigning}
          onClose={() => { setAssigning(null); subMutation.reset(); }}
          saving={subMutation.isPending}
          success={subMutation.isSuccess}
          error={subMutation.isError
            ? (subMutation.error?.response?.data?.detail ?? "Error al asignar. Intentá de nuevo.")
            : null}
          onSave={(data) => subMutation.mutate(data)}
        />
      )}
      {playlist && (
        <PlaylistModal
          client={playlist}
          onClose={() => setPlaylist(null)}
        />
      )}
    </div>
  );
}
