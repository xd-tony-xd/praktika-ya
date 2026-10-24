import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FiAward, FiBell, FiBriefcase, FiCreditCard, FiGrid, FiLayers, FiLogOut, FiMenu, FiPackage,
  FiSettings, FiUser, FiUsers, FiX, FiHome, FiExternalLink,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { Link, navigate, useLocation } from "../lib/router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { fechaHora } from "../lib/format";
import { useAvisos } from "../lib/avisos";
import { Avatar, Logo } from "./ui";

interface Item { to: string; label: string; icon: IconType }

const NAV_EMPRESA: Item[] = [
  { to: "/panel", label: "Resumen", icon: FiGrid },
  { to: "/empresa/vacantes", label: "Mis vacantes", icon: FiBriefcase },
  { to: "/empresa/postulantes", label: "Postulantes", icon: FiUsers },
  { to: "/empresa/creditos", label: "Créditos IA", icon: FiCreditCard },
  { to: "/empresa/sello", label: "Sello de transparencia", icon: FiAward },
  { to: "/empresa/perfil", label: "Perfil de empresa", icon: FiUser },
];

const NAV_ADMIN: Item[] = [
  { to: "/panel", label: "Resumen", icon: FiGrid },
  { to: "/admin/empresas", label: "Empresas", icon: FiHome },
  { to: "/admin/vacantes", label: "Vacantes", icon: FiBriefcase },
  { to: "/admin/carreras", label: "Carreras", icon: FiLayers },
  { to: "/admin/paquetes", label: "Paquetes IA y ventas", icon: FiPackage },
  { to: "/admin/config", label: "Configuración", icon: FiSettings },
  { to: "/admin/perfil", label: "Mi perfil", icon: FiUser },
];

interface Notif { id: number; nombre_completo: string; fecha_postulacion: string; vacantes: { titulo_puesto: string } | null }

function Notificaciones() {
  const [items, setItems] = useState<Notif[]>([]);
  const [abierto, setAbierto] = useState(false);
  const avisos = useAvisos();
  const ref = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("postulaciones")
      .select("id,nombre_completo,fecha_postulacion,vacantes!inner(titulo_puesto)")
      .eq("notificacion_leida", false)
      .order("fecha_postulacion", { ascending: false })
      .limit(15);
    setItems((data as unknown as Notif[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
    const canal = supabase
      .channel("nuevas-postulaciones")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "postulaciones" }, (payload) => {
        const n = (payload.new as { nombre_completo?: string })?.nombre_completo;
        avisos.info("Nueva postulación", n ? `${n} acaba de postular.` : undefined);
        void cargar();
      })
      .subscribe();
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => {
      void supabase.removeChannel(canal);
      document.removeEventListener("mousedown", cerrar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  const leer = async (id: number) => {
    await supabase.from("postulaciones").update({ notificacion_leida: true }).eq("id", id);
    setItems((x) => x.filter((i) => i.id !== id));
    setAbierto(false);
    navigate(`/empresa/postulantes?ver=${id}`);
  };
  const leerTodas = async () => {
    await supabase.from("postulaciones").update({ notificacion_leida: true }).eq("notificacion_leida", false);
    setItems([]);
  };

  return (
    <div className="notif" ref={ref}>
      <button className="icon-btn" onClick={() => setAbierto((v) => !v)} aria-label={`Notificaciones (${items.length} sin leer)`} aria-expanded={abierto}>
        <FiBell />
        {items.length > 0 && <span className="notif-dot">{items.length > 9 ? "9+" : items.length}</span>}
      </button>
      {abierto && (
        <div className="notif-panel">
          <header>
            <strong>Postulaciones nuevas</strong>
            {items.length > 0 && <button className="btn btn-link btn-sm" onClick={leerTodas}>Marcar todas como leídas</button>}
          </header>
          {items.length === 0 ? (
            <p className="muted notif-vacio">No tienes postulaciones nuevas.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => void leer(n.id)}>
                    <strong>{n.nombre_completo}</strong>
                    <span>{n.vacantes?.titulo_puesto}</span>
                    <small>{fechaHora(n.fecha_postulacion)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ titulo, acciones, children }: { titulo: string; acciones?: ReactNode; children: ReactNode }) {
  const { perfil, empresa, rol, salir } = useAuth();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const nav = rol === "admin" ? NAV_ADMIN : NAV_EMPRESA;
  const nombre = rol === "admin" ? perfil?.nombre || "Administrador" : empresa?.nombre_comercial || "Mi empresa";
  const foto = rol === "admin" ? perfil?.foto_perfil : empresa?.foto_perfil;

  useEffect(() => {
    document.title = `${titulo} · Panel`;
  }, [titulo]);

  const cerrarSesion = async () => {
    await salir();
    navigate("/login");
  };

  return (
    <div className={`app ${menu ? "app-menu" : ""}`}>
      <aside className="side" aria-label="Menú del panel">
        <div className="side-top">
          <Logo claro to="/panel" />
          <button className="icon-btn side-close" onClick={() => setMenu(false)} aria-label="Cerrar menú"><FiX /></button>
        </div>
        <p className="side-rol">{rol === "admin" ? "Administración" : "Empresa"}</p>
        <nav>
          {nav.map((i) => {
            const activo = i.to === "/panel" ? pathname === "/panel" : pathname.startsWith(i.to);
            return (
              <Link key={i.to} to={i.to} className={activo ? "activo" : ""} aria-current={activo ? "page" : undefined} onClick={() => setMenu(false)}>
                <i.icon aria-hidden /> {i.label}
              </Link>
            );
          })}
        </nav>
        <div className="side-bottom">
          <Link to="/" target="_blank" rel="noreferrer"><FiExternalLink aria-hidden /> Ver sitio público</Link>
          <button onClick={cerrarSesion}><FiLogOut aria-hidden /> Cerrar sesión</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="top">
          <button className="icon-btn top-burger" onClick={() => setMenu(true)} aria-label="Abrir menú"><FiMenu /></button>
          <h1>{titulo}</h1>
          <div className="top-right">
            {acciones}
            {rol === "empresa" && <Notificaciones />}
            <div className="top-user">
              <Avatar src={foto} nombre={nombre} size={36} />
              <span>{nombre}</span>
            </div>
          </div>
        </header>
        <div className="app-content">{children}</div>
      </div>
      {menu && <div className="side-scrim" onClick={() => setMenu(false)} />}
    </div>
  );
}
