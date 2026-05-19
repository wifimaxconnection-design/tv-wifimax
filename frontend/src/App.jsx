import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Channels from "./pages/Channels";
import Clients from "./pages/Clients";
import Packages from "./pages/Packages";
import Monitoring from "./pages/Monitoring";
import Streams from "./pages/Streams";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="channels" element={<Channels />} />
          <Route path="clients" element={<Clients />} />
          <Route path="packages" element={<Packages />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="streams" element={<Streams />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
