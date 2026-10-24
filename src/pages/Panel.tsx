import { useEffect, useState } from "react";
import { FiDownload, FiPlus } from "react-icons/fi";
import { AppLayout } from "../components/AppLayout";
import { Avatar, Cargando, EstadoBadge, MatchDial, SelloStamp, Stat, Vacio } from "../components/ui";
import { Link } from "../lib/router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { fecha, fechaHora, solesCentimos } from "../lib/format";
import { descargarExcel } from "../lib/exportar";
import { useAvisos } from "../lib/avisos";
import type { Empresa, EstadoPostulacion } from "../lib/types";

type Stats = Record<string, number | boolean>;
interface PostReciente { id: number; nombre_completo: string; match_porcentaje: number; estado_postulacion: EstadoPostulacion; fecha_postulacion: string; vacantes: { titulo_puesto: string } | null }

export default function Panel() {
  const { rol, empresa, perfil } = useAuth();
  const avisos = useAvisos();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recientes, setRecientes] = useState<PostReciente[]>([]);
  const [pendientes, setPendientes] = useState<Empresa[]>([]);

  useEffect(() => {
    void supabase.rpc("estadisticas_panel").then(({ data }) => setStats((data as Stats) ?? {}));
    if (rol === "empresa") {
      void supabase.from("postulaciones")
        .select("id,nombre_completo,match_porcentaje,estado_postulacion,fecha_postulacion,vacantes!inner(titulo_puesto)")
        .order("fecha_postulacion", { ascending: false }).limit(6)
        .then(({ data }) => setRecientes((data as unknown as PostReciente[]) ?? []));
    } else if (rol === "admin") {
      void supabase.from("empresas").select("*").eq("estado", "pendiente").order("creado_en", { ascending: false }).limit(6)
        .then(({ data }) => setPendientes((data as Empresa[]) ?? []));
    }
  }, [rol]);

  const exportarPostulantes = async () => {
    const { data, error } = await supabase.from("postulaciones")
      .select("dni,nombre_completo,correo_estudiante,celular,estado_postulacion,match_porcentaje,fecha_postulacion,vacantes!inner(titulo_puesto)")
      .order("match_porcentaje", { ascending: false }).limit(10000);
    if (error) return avisos.error("No se pudo exportar", error.message);
    const rows = (data as unknown as (PostReciente & { dni: string; correo_estudiante: string; celular: string })[]) ?? [];
    descargarExcel(rol === "admin" ? "reporte_global_postulantes" : "postulantes", ["Convocatoria", "DNI", "Candidato", "Correo", "Celular", "Estado", "Match IA %", "Fecha"],
      rows.map((r) => [r.vacantes?.titulo_puesto, r.dni, r.nombre_completo, r.correo_estudiante, r.celular, r.estado_postulacion, Math.round(r.match_porcentaje), fechaHora(r.fecha_postulacion)]));
  };

  const nombre = rol === "admin" ? (perfil?.nombre ?? "Administrador") : (empresa?.nombre_comercial ?? "");

  return (
    <AppLayout
      titulo="Resumen"
      acciones={rol === "empresa" ? <Link to="/empresa/vacantes/nueva" className="btn btn-primary btn-sm"><FiPlus /> Nueva vacante</Link> : undefined}
    >
      <p className="saludo">Hola, {nombre.split(" ")[0]}.</p>
      {!stats ? <Cargando /> : rol === "admin" ? (
        <>
          <div className="stats">
            <Stat valor={Number(stats.total_empresas)} label="Empresas registradas" nota={Number(stats.empresas_pendientes) ? <Link to="/admin/empresas?estado=pendiente">{String(stats.empresas_pendientes)} por revisar</Link> : "Ninguna por revisar"} />
            <Stat valor={Number(stats.vacantes_activas)} label="Vacantes activas" nota={`${stats.total_vacantes} en total`} />
            <Stat valor={Number(stats.total_postulaciones)} label="Postulaciones" nota={`${stats.analizadas} analizadas con IA`} />
            <Stat valor={solesCentimos(Number(stats.ingresos_centimos))} label="Ventas de créditos IA" />
          </div>
          <div className="grid-panel">
            <section className="caja">
              <header className="caja-head"><h2>Empresas esperando aprobación</h2><Link to="/admin/empresas?estado=pendiente">Ver todas</Link></header>
              {pendientes.length === 0 ? <p className="muted">No hay solicitudes pendientes.</p> : (
                <ul className="lista">
                  {pendientes.map((e) => (
                    <li key={e.id}>
                      <Link to={`/admin/empresas/${e.id}`} className="lista-item">
                        <Avatar src={e.foto_perfil} nombre={e.nombre_comercial} size={38} />
                        <span><strong>{e.nombre_comercial}</strong><small className="muted">RUC {e.ruc} — {fecha(e.creado_en)}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="caja">
              <header className="caja-head"><h2>Reportes</h2></header>
              <div className="stack">
                <button className="btn btn-ghost" onClick={exportarPostulantes}><FiDownload /> Postulantes de toda la plataforma</button>
                <Link to="/admin/empresas" className="btn btn-ghost"><FiDownload /> Reporte de empresas</Link>
                <Link to="/admin/carreras" className="btn btn-ghost"><FiDownload /> Reporte de carreras</Link>
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="stats">
            <Stat valor={Number(stats.vacantes_activas)} label="Vacantes activas" nota={`${stats.total_vacantes} publicadas en total`} />
            <Stat valor={Number(stats.total_postulaciones)} label="Postulantes" nota={`${stats.aptos} aptos`} />
            <Stat valor={Number(stats.pendientes)} label="Por analizar" nota={Number(stats.pendientes) ? <Link to="/empresa/postulantes?estado=en_espera">Analizar ahora</Link> : "Todo al día"} />
            <Stat valor={Number(stats.saldo)} label="Créditos IA" nota={<Link to="/empresa/creditos">Comprar créditos</Link>} />
          </div>
          <div className="grid-panel">
            <section className="caja">
              <header className="caja-head"><h2>Últimas postulaciones</h2><Link to="/empresa/postulantes">Ver todas</Link></header>
              {recientes.length === 0 ? (
                <Vacio titulo="Aún no tienes postulantes" texto="Publica una vacante y compártela con universidades." accion={<Link to="/empresa/vacantes/nueva" className="btn btn-primary">Publicar vacante</Link>} />
              ) : (
                <ul className="lista">
                  {recientes.map((p) => (
                    <li key={p.id}>
                      <Link to={`/empresa/postulantes?ver=${p.id}`} className="lista-item">
                        <MatchDial valor={p.estado_postulacion === "en_espera" ? null : Number(p.match_porcentaje)} size={42} />
                        <span><strong>{p.nombre_completo}</strong><small className="muted">{p.vacantes?.titulo_puesto} — {fechaHora(p.fecha_postulacion)}</small></span>
                        <EstadoBadge estado={p.estado_postulacion} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="caja caja-sello-panel">
              <SelloStamp size={96} vigente={Boolean(stats.sello_vigente)} />
              <div>
                <h2>{stats.sello_vigente ? "Tu sello está vigente" : "Obtén el sello de transparencia"}</h2>
                <p className="muted small">{stats.sello_vigente ? "Tus vacantes muestran la insignia de selección transparente." : "Las vacantes con sello generan más confianza entre los estudiantes."}</p>
                <Link to="/empresa/sello" className="btn btn-ghost btn-sm">Ver criterios</Link>
                <button className="btn btn-link btn-sm" onClick={exportarPostulantes}><FiDownload /> Exportar postulantes</button>
              </div>
            </section>
          </div>
        </>
      )}
    </AppLayout>
  );
}
