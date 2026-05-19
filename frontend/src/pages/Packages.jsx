import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { packagesApi, channelsApi } from "../api/client";
import { Plus, Trash2, Pencil, Package, X, Check } from "lucide-react";
import clsx from "clsx";

// ── Modal crear / editar ────────────────────────────────────
function PackageModal({ initial, channels, onClose, onSave, saving }) {
  const empty = { name: "", description: "", price: "", max_devices: 2, channel_ids: [] };
  const [form, setForm] = useState(initial ?? empty);

  const toggle = (id) =>
    setForm((f) => ({
      ...f,
      channel_ids: f.channel_ids.includes(id)
        ? f.channel_ids.filter((x) => x !== id)
        : [...f.channel_ids, id],
    }));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isEdit = !!initial;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="font-bold text-lg">
            {isEdit ? "Editar paquete" : "Nuevo paquete"}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nombre del paquete *</label>
            <input
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 border border-gray-700"
              placeholder="Ej: Premium HD"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descripción</label>
            <textarea
              rows={2}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 border border-gray-700 resize-none"
              placeholder="Descripción breve del paquete"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          {/* Precio + Dispositivos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Precio mensual ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 border border-gray-700"
                placeholder="19.99"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dispositivos simultáneos</label>
              <select
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 border border-gray-700"
                value={form.max_devices}
                onChange={(e) => set("max_devices", Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n} dispositivo{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selección de canales */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Canales incluidos
              <span className="ml-2 text-brand-500 font-medium">
                {form.channel_ids.length} seleccionado{form.channel_ids.length !== 1 ? "s" : ""}
              </span>
            </label>
            <div className="max-h-44 overflow-y-auto space-y-1 border border-gray-700 rounded-lg p-2 bg-gray-800/50">
              {channels.length === 0 ? (
                <p className="text-xs text-gray-600 p-2">No hay canales disponibles</p>
              ) : (
                channels.map((ch) => {
                  const selected = form.channel_ids.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      onClick={() => toggle(ch.id)}
                      className={clsx(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors",
                        selected
                          ? "bg-brand-500/20 border border-brand-500/50 text-white"
                          : "hover:bg-gray-700 text-gray-400 border border-transparent"
                      )}
                    >
                      <div className={clsx(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        selected ? "bg-brand-500 border-brand-500" : "border-gray-600"
                      )}>
                        {selected && <Check size={10} />}
                      </div>
                      <span className="flex-1 truncate">{ch.name}</span>
                      <span className="text-xs text-gray-600 font-mono">
                        {ch.multicast_address}
                      </span>
                      <div className="flex gap-1">
                        {(ch.transcoding_profiles || []).slice(0, 2).map((p) => (
                          <span key={p} className="text-xs bg-gray-700 px-1 rounded text-gray-500">{p}</span>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            disabled={!form.name || !form.price || saving}
            onClick={() => onSave(form)}
            className="flex-1 py-2.5 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear paquete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete dialog ────────────────────────────────────
function ConfirmDelete({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-sm border border-red-900/50 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <p className="font-semibold">Eliminar paquete</p>
            <p className="text-xs text-gray-500">Esta acción no se puede deshacer</p>
          </div>
        </div>
        <p className="text-sm text-gray-300">
          ¿Eliminar <span className="font-bold text-white">"{name}"</span>?
          Los clientes con suscripciones activas a este paquete no se verán afectados hasta el vencimiento.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────
export default function Packages() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState(null);   // package object
  const [deleting, setDeleting]     = useState(null);   // package object

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: () => packagesApi.list().then((r) => r.data),
  });

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => channelsApi.list({ limit: 500, active_only: false }).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["packages"] });

  const createMutation = useMutation({
    mutationFn: (data) => packagesApi.create({
      ...data,
      price: parseFloat(data.price),
    }),
    onSuccess: () => { invalidate(); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => packagesApi.update(id, {
      ...data,
      price: parseFloat(data.price),
    }),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => packagesApi.delete(id),
    onSuccess: () => { invalidate(); setDeleting(null); },
  });

  const priceColor = (price) => {
    if (price < 12) return "text-green-400";
    if (price < 25) return "text-blue-400";
    if (price < 30) return "text-yellow-400";
    return "text-purple-400";
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Paquetes de canales</h2>
          <p className="text-gray-500 text-sm">
            {packages.length} paquete{packages.length !== 1 ? "s" : ""} configurado{packages.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm transition-colors"
        >
          <Plus size={14} /> Nuevo paquete
        </button>
      </div>

      {/* Grid de paquetes */}
      {isLoading ? (
        <div className="text-gray-600 text-sm p-8 text-center">Cargando...</div>
      ) : packages.length === 0 ? (
        <div className="col-span-3 text-center p-16 text-gray-600">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay paquetes configurados.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 bg-brand-500 rounded-lg text-sm hover:bg-brand-600"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map((pkg) => {
            // Buscar los nombres de canales incluidos
            const pkgChannels = channels.filter((ch) =>
              (pkg.channel_ids || []).includes(ch.id)
            );
            return (
              <div
                key={pkg.id}
                className="bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex flex-col"
              >
                {/* Card header */}
                <div className="p-5 flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-brand-500 flex-shrink-0" />
                      <h3 className="font-bold text-base leading-tight">{pkg.name}</h3>
                    </div>
                    {/* Botones editar / eliminar */}
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => setEditing({
                          ...pkg,
                          price: String(pkg.price),
                        })}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                        title="Editar paquete"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleting(pkg)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        title="Eliminar paquete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-gray-500 mb-4 leading-relaxed">{pkg.description}</p>
                  )}

                  {/* Lista de canales */}
                  <div className="space-y-1 mb-4">
                    {pkgChannels.length === 0 ? (
                      <p className="text-xs text-gray-600 italic">Sin canales asignados</p>
                    ) : (
                      pkgChannels.map((ch) => (
                        <div key={ch.id} className="flex items-center gap-2 text-xs text-gray-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="flex-1 truncate">{ch.name}</span>
                          <span className="text-gray-600 font-mono">{(ch.transcoding_profiles || [])[0]}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Card footer */}
                <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${priceColor(pkg.price)}`}>
                      ${Number(pkg.price).toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500">/mes</span>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>{(pkg.channel_ids || []).length} canal{(pkg.channel_ids || []).length !== 1 ? "es" : ""}</p>
                    <p>{pkg.max_devices} dispositivo{pkg.max_devices !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear */}
      {showCreate && (
        <PackageModal
          channels={channels}
          onClose={() => setShowCreate(false)}
          saving={createMutation.isPending}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}

      {/* Modal editar */}
      {editing && (
        <PackageModal
          initial={editing}
          channels={channels}
          onClose={() => setEditing(null)}
          saving={updateMutation.isPending}
          onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
        />
      )}

      {/* Confirm delete */}
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
