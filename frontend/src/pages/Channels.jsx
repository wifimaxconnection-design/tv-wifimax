import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsApi } from "../api/client";
import { Plus, Trash2, Pencil, Circle, Tv, X, Check, Power } from "lucide-react";
import clsx from "clsx";

const PROFILES_OPTIONS = ["1080p", "720p", "480p", "1080p_h265", "720p_h265"];

// ── Modal crear / editar canal ────────────────────────────────
function ChannelModal({ initial, onClose, onSave, saving }) {
  const empty = {
    name: "",
    multicast_address: "239.0.0.1",
    multicast_port: 1234,
    interface: "eth0",
    transcoding_profiles: ["1080p", "720p", "480p"],
    logo_url: "",
    epg_id: "",
    sort_order: 0,
  };
  const [form, setForm] = useState(initial ?? empty);
  const isEdit = !!initial;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleProfile = (p) =>
    setForm((f) => ({
      ...f,
      transcoding_profiles: f.transcoding_profiles.includes(p)
        ? f.transcoding_profiles.filter((x) => x !== p)
        : [...f.transcoding_profiles, p],
    }));

  const valid = form.name.trim() && form.multicast_address.trim() && form.multicast_port > 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Tv size={16} className="text-brand-500" />
            <h3 className="font-bold text-base">
              {isEdit ? "Editar canal" : "Nuevo canal"}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Nombre */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nombre del canal *</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Ej: Canal HD 1"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Multicast address + puerto */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Dirección multicast UDP *</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="239.x.x.x"
                value={form.multicast_address}
                onChange={(e) => set("multicast_address", e.target.value)}
              />
              <div className="flex flex-col">
                <label className="text-xs text-gray-400 mb-1">Puerto *</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="1234"
                  value={form.multicast_port}
                  onChange={(e) => set("multicast_port", parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Interfaz + orden */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Interfaz de red (NIC)</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="eth0"
                value={form.interface}
                onChange={(e) => set("interface", e.target.value)}
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-gray-400 mb-1 block">Orden</label>
              <input
                type="number"
                min={0}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.sort_order}
                onChange={(e) => set("sort_order", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Logo URL */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">URL del logo (opcional)</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="https://ejemplo.com/logo.png"
              value={form.logo_url || ""}
              onChange={(e) => set("logo_url", e.target.value)}
            />
          </div>

          {/* EPG ID */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">ID EPG / XMLTV (opcional)</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Ej: CanalHD1.ar"
              value={form.epg_id || ""}
              onChange={(e) => set("epg_id", e.target.value)}
            />
          </div>

          {/* Perfiles de transcodificación */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Perfiles de transcodificación
              <span className="ml-2 text-brand-500 font-medium">
                {form.transcoding_profiles.length} seleccionado{form.transcoding_profiles.length !== 1 ? "s" : ""}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROFILES_OPTIONS.map((p) => {
                const active = form.transcoding_profiles.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleProfile(p)}
                    className={clsx(
                      "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all",
                      active
                        ? "bg-brand-500 border-brand-500 text-white shadow-md"
                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    )}
                  >
                    {active && <Check size={10} />}
                    {p}
                  </button>
                );
              })}
            </div>
            {form.transcoding_profiles.length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">Seleccioná al menos un perfil</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            disabled={!valid || saving || form.transcoding_profiles.length === 0}
            onClick={() => onSave(form)}
            className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear canal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete ────────────────────────────────────────────
function ConfirmDelete({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-sm border border-red-900/50 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <p className="font-semibold">Eliminar canal</p>
            <p className="text-xs text-gray-500">Esta acción no se puede deshacer</p>
          </div>
        </div>
        <p className="text-sm text-gray-300">
          ¿Eliminar <span className="font-bold text-white">"{name}"</span>?
          Los paquetes que incluían este canal no se verán afectados automáticamente.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function Channels() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [deleting, setDeleting]     = useState(null);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => channelsApi.list({ limit: 500, active_only: false }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["channels"] });

  const createMutation = useMutation({
    mutationFn: channelsApi.create,
    onSuccess: () => { invalidate(); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => channelsApi.update(id, data),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: channelsApi.delete,
    onSuccess: () => { invalidate(); setDeleting(null); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => channelsApi.update(id, { is_active }),
    onSuccess: () => invalidate(),
  });

  const activeCount   = channels.filter((c) => c.is_active).length;
  const inactiveCount = channels.length - activeCount;

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Canales</h2>
          <p className="text-gray-500 text-sm">
            {activeCount} activos · {inactiveCount} inactivos · {channels.length} total
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm transition-colors"
        >
          <Plus size={14} /> Nuevo canal
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-gray-500 font-medium w-8" />
              <th className="px-4 py-3 text-gray-500 font-medium">Nombre</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Dirección multicast</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Interfaz</th>
              <th className="px-4 py-3 text-gray-500 font-medium">Perfiles</th>
              <th className="px-4 py-3 text-gray-500 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-600">
                  Cargando canales…
                </td>
              </tr>
            ) : channels.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-600">
                  No hay canales. Creá el primero.
                </td>
              </tr>
            ) : (
              channels.map((ch) => (
                <tr
                  key={ch.id}
                  className={clsx(
                    "border-b border-gray-800/50 transition-colors",
                    ch.is_active ? "hover:bg-gray-800/30" : "opacity-50 hover:opacity-70 hover:bg-gray-800/20"
                  )}
                >
                  {/* Estado online/offline */}
                  <td className="px-4 py-3">
                    <Circle
                      size={8}
                      className={clsx(
                        "fill-current",
                        ch.is_active ? "text-green-400" : "text-gray-600"
                      )}
                    />
                  </td>

                  {/* Nombre + EPG */}
                  <td className="px-4 py-3">
                    <p className="font-medium">{ch.name}</p>
                    {ch.epg_id && (
                      <p className="text-xs text-gray-600 font-mono mt-0.5">{ch.epg_id}</p>
                    )}
                  </td>

                  {/* Multicast */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {ch.multicast_address}:{ch.multicast_port}
                  </td>

                  {/* Interfaz */}
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {ch.interface}
                  </td>

                  {/* Perfiles */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(ch.transcoding_profiles || []).map((p) => (
                        <span
                          key={p}
                          className="text-xs bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-400"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Toggle activo/inactivo */}
                      <button
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: ch.id, is_active: !ch.is_active })
                        }
                        title={ch.is_active ? "Desactivar canal" : "Activar canal"}
                        className={clsx(
                          "p-1.5 rounded-lg transition-colors",
                          ch.is_active
                            ? "text-green-500 hover:bg-green-900/20 hover:text-green-400"
                            : "text-gray-600 hover:bg-gray-700 hover:text-gray-400"
                        )}
                      >
                        <Power size={13} />
                      </button>

                      {/* Editar */}
                      <button
                        onClick={() => setEditing(ch)}
                        title="Editar canal"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>

                      {/* Eliminar */}
                      <button
                        onClick={() => setDeleting(ch)}
                        title="Eliminar canal"
                        className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal crear */}
      {showCreate && (
        <ChannelModal
          onClose={() => setShowCreate(false)}
          saving={createMutation.isPending}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}

      {/* Modal editar */}
      {editing && (
        <ChannelModal
          initial={editing}
          onClose={() => setEditing(null)}
          saving={updateMutation.isPending}
          onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
        />
      )}

      {/* Confirmar eliminar */}
      {deleting && (
        <ConfirmDelete
          name={deleting.name}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
