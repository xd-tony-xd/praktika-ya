import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { matchPath, navigate, useLocation } from "./lib/router";
import { useAuth } from "./lib/auth";
import { useConfig } from "./lib/config";
import { supabaseConfigurado } from "./lib/supabase";
import { Cargando } from "./components/ui";
import Inicio from "./pages/publico/Inicio";
import VacanteDetalle from "./pages/publico/VacanteDetalle";
import { Login, Restablecer } from "./pages/publico/Acceso";
import { FaltaConfiguracion, Mantenimiento, NoEncontrado, SelloVerificacion } from "./pages/publico/Varios";

const Postular = lazy(() => import("./pages/publico/Postular"));
const RegistroEmpresa = lazy(() => import("./pages/publico/RegistroEmpresa"));
const Panel = lazy(() => import("./pages/Panel"));
const VacantesEmpresa = lazy(() => import("./pages/empresa/Vacantes"));
const VacanteForm = lazy(() => import("./pages/empresa/VacanteForm"));
const PostulantesEmpresa = lazy(() => import("./pages/empresa/Postulantes"));
const Creditos = lazy(() => import("./pages/empresa/Creditos"));
const SelloEmpresa = lazy(() => import("./pages/empresa/Sello"));
const PerfilEmpresa = lazy(() => import("./pages/empresa/PerfilEmpresa"));
const EmpresasAdmin = lazy(() => import("./pages/admin/Empresas").then((m) => ({ default: m.EmpresasAdmin })));
const EmpresaDetalle = lazy(() => import("./pages/admin/Empresas").then((m) => ({ default: m.EmpresaDetalle })));
const VacantesAdmin = lazy(() => import("./pages/admin/VacantesAdmin").then((m) => ({ default: m.VacantesAdmin })));
const PostulantesVacanteAdmin = lazy(() => import("./pages/admin/VacantesAdmin").then((m) => ({ default: m.PostulantesVacanteAdmin })));
const CarrerasAdmin = lazy(() => import("./pages/admin/Catalogos").then((m) => ({ default: m.CarrerasAdmin })));
const PaquetesAdmin = lazy(() => import("./pages/admin/Catalogos").then((m) => ({ default: m.PaquetesAdmin })));
const ConfigAdmin = lazy(() => import("./pages/admin/Catalogos").then((m) => ({ default: m.ConfigAdmin })));
const PerfilAdmin = lazy(() => import("./pages/admin/PerfilAdmin"));

type Acceso = "publico" | "privado" | "empresa" | "admin";
interface Ruta { path: string; acceso: Acceso; render: (p: Record<string, string>) => ReactNode }

const RUTAS: Ruta[] = [
  { path: "/", acceso: "publico", render: () => <Inicio /> },
  { path: "/vacante/:id", acceso: "publico", render: (p) => <VacanteDetalle id={p.id} /> },
  { path: "/vacante/:id/postular", acceso: "publico", render: (p) => <Postular id={p.id} /> },
  { path: "/login", acceso: "publico", render: () => <Login /> },
  { path: "/restablecer", acceso: "publico", render: () => <Restablecer /> },
  { path: "/registro-empresa", acceso: "publico", render: () => <RegistroEmpresa /> },
  { path: "/sello/:id", acceso: "publico", render: (p) => <SelloVerificacion id={p.id} /> },
  { path: "/panel", acceso: "privado", render: () => <Panel /> },
  { path: "/empresa/vacantes", acceso: "empresa", render: () => <VacantesEmpresa /> },
  { path: "/empresa/vacantes/nueva", acceso: "empresa", render: () => <VacanteForm /> },
  { path: "/empresa/vacantes/:id/editar", acceso: "empresa", render: (p) => <VacanteForm id={p.id} /> },
  { path: "/empresa/postulantes", acceso: "empresa", render: () => <PostulantesEmpresa /> },
  { path: "/empresa/creditos", acceso: "empresa", render: () => <Creditos /> },
  { path: "/empresa/sello", acceso: "empresa", render: () => <SelloEmpresa /> },
  { path: "/empresa/perfil", acceso: "empresa", render: () => <PerfilEmpresa /> },
  { path: "/admin/empresas", acceso: "admin", render: () => <EmpresasAdmin /> },
  { path: "/admin/empresas/:id", acceso: "admin", render: (p) => <EmpresaDetalle id={p.id} /> },
  { path: "/admin/vacantes", acceso: "admin", render: () => <VacantesAdmin /> },
  { path: "/admin/vacantes/:id/postulantes", acceso: "admin", render: (p) => <PostulantesVacanteAdmin id={p.id} /> },
  { path: "/admin/carreras", acceso: "admin", render: () => <CarrerasAdmin /> },
  { path: "/admin/paquetes", acceso: "admin", render: () => <PaquetesAdmin /> },
  { path: "/admin/config", acceso: "admin", render: () => <ConfigAdmin /> },
  { path: "/admin/perfil", acceso: "admin", render: () => <PerfilAdmin /> },
];

// Rutas del sistema PHP anterior -> nuevas (para no romper enlaces guardados)
const ANTIGUAS: Record<string, string> = {
  "/index": "/", "/dashboard": "/panel", "/register-company": "/registro-empresa", "/vacancies": "/empresa/vacantes",
  "/vacancies/create": "/empresa/vacantes/nueva", "/vacancies/expired": "/empresa/vacantes", "/postulations": "/empresa/postulantes",
  "/company/profile": "/empresa/perfil", "/company/credits": "/empresa/creditos", "/admin/paquetes-ia": "/admin/paquetes",
  "/admin/profile": "/admin/perfil", "/maintenance": "/",
};

function Redirigir({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return <Cargando />;
}

export default function App() {
  const { pathname, href } = useLocation();
  const { cargando, session, rol, empresa, salir } = useAuth();
  const { config, cargado } = useConfig();

  const empresaNoActiva = rol === "empresa" && empresa && empresa.estado !== "aprobado";
  useEffect(() => {
    if (empresaNoActiva) void salir();
  }, [empresaNoActiva, salir]);

  if (!supabaseConfigurado) return <FaltaConfiguracion />;

  if (ANTIGUAS[pathname]) return <Redirigir to={ANTIGUAS[pathname]} />;
  const vieja = pathname.match(/^\/vacancies\/edit\/(\d+)$/);
  if (vieja) return <Redirigir to={`/empresa/vacantes/${vieja[1]}/editar`} />;

  let ruta: Ruta | undefined;
  let params: Record<string, string> = {};
  for (const r of RUTAS) {
    const m = matchPath(r.path, pathname);
    if (m) { ruta = r; params = m; break; }
  }
  if (!ruta) return <NoEncontrado />;

  if (!cargado || (ruta.acceso !== "publico" && cargando)) return <Cargando />;

  const libreEnMantenimiento = pathname === "/login" || pathname === "/restablecer";
  if (config.modo_mantenimiento === "on" && rol !== "admin" && !libreEnMantenimiento && !cargando) return <Mantenimiento />;

  if (ruta.acceso !== "publico") {
    if (!session || empresaNoActiva) return <Redirigir to={`/login?volver=${encodeURIComponent(href)}`} />;
    if (!rol) return <Cargando />;
    if (ruta.acceso === "empresa" && rol !== "empresa") return <Redirigir to="/panel" />;
    if (ruta.acceso === "admin" && rol !== "admin") return <Redirigir to="/panel" />;
  }

  return <Suspense fallback={<Cargando />}>{ruta.render(params)}</Suspense>;
}
