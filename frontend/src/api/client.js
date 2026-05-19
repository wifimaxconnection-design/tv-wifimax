import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "/api/v1";

const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const channelsApi = {
  list: (params) => api.get("/channels", { params }),
  get: (id) => api.get(`/channels/${id}`),
  create: (data) => api.post("/channels", data),
  update: (id, data) => api.patch(`/channels/${id}`, data),
  delete: (id) => api.delete(`/channels/${id}`),
  status: (id) => api.get(`/channels/${id}/status`),
  categories: () => api.get("/channels/categories/"),
};

export const clientsApi = {
  list: (params) => api.get("/clients", { params }),
  get: (id) => api.get(`/clients/${id}`),
  create: (data) => api.post("/clients", data),
  update: (id, data) => api.patch(`/clients/${id}`, data),
  suspend: (id) => api.patch(`/clients/${id}/suspend`),
  activate: (id) => api.patch(`/clients/${id}/activate`),
  subscriptions: (id) => api.get(`/clients/${id}/subscriptions`),
  createSubscription: (data) => api.post("/clients/subscriptions", data),
  playlistInfo: (id) => api.get(`/clients/${id}/playlist-info`),
  m3uUrl: (id, profile = "1080p", baseUrl = "") => {
    const base = baseUrl || `${window.location.protocol}//${window.location.hostname}/hls`;
    return `${api.defaults.baseURL}/clients/${id}/m3u?profile=${profile}&base_url=${encodeURIComponent(base)}`;
  },
};

export const packagesApi = {
  list: () => api.get("/packages"),
  create: (data) => api.post("/packages", data),
  update: (id, data) => api.patch(`/packages/${id}`, data),
  delete: (id) => api.delete(`/packages/${id}`),
};

export const streamsApi = {
  active: () => api.get("/streams"),
  stats: () => api.get("/streams/stats"),
  m3u: () => api.get("/streams/m3u"),
};

export const monitoringApi = {
  gpu: () => api.get("/monitoring/gpu"),
  services: () => api.get("/monitoring/services"),
  ingestStats: () => api.get("/monitoring/ingest/channels"),
};

export default api;
