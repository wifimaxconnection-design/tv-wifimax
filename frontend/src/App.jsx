import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Channels from "./pages/Channels";
import Clients from "./pages/Clients";
import Packages from "./pages/Packages";
import Monitoring from "./pages/Monitoring";
import Streams from "./pages/Streams";
// ── Carrier-Grade Extensions (nuevas páginas, no reemplazan las anteriores)
import NOC    from "./pages/NOC";
import IPv6   from "./pages/IPv6";
import BGP    from "./pages/BGP";
import Alerts from "./pages/Alerts";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {/* Páginas existentes — SIN MODIFICAR */}
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="channels"   element={<Channels />} />
          <Route path="clients"    element={<Clients />} />
          <Route path="packages"   element={<Packages />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="streams"    element={<Streams />} />
          {/* Nuevas páginas carrier-grade */}
          <Route path="noc"    element={<NOC />} />
          <Route path="ipv6"   element={<IPv6 />} />
          <Route path="bgp"    element={<BGP />} />
          <Route path="alerts" element={<Alerts />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
