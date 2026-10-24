import { useCallback, useEffect, useMemo, useState } from "react";
import { FiDownload, FiEdit2, FiExternalLink, FiPlus, FiTrash2, FiUsers } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Cargando, Vacio } from "../../components/ui";
import { Link } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { useAvisos } from "../../lib/avisos";
import { diasRestantes, fecha, hoyISO, textoCierre } from "../../lib/format";
import { descargarExcel } from "../../lib/exportar";
import type { Vacante } from "../../lib/types";

export type VacanteFila = Vacante & {
  postulaciones: { count: number }[];
  vacante_carreras: { carreras: { nombre: string } | null }[];
  empresas?: { nombre_comercial: string } | null;
};

export const esVigente = (v: Vacante) => v.estado === "abierta" && (diasRestantes(v.fecha_limite) ?? 1) >= 0;

/** Cerrar o reabrir. Si se reabre una vencida, se extiende 15 días (igual que el sistema anterior). */
export async function alternarEstado(v: Vacante): Promise<string | null> {
  const abrir = !esVigente(v);
  const cambios: Partial<Vacante> = { estado: abrir ? "abierta" : "cerrada" };
  if (abrir && v.fecha_limite && (diasRestantes(v.fecha_limite) ?? 0) < 0) cambios.fecha_limite = hoyISO(15);
  const { error } = await supabase.from("vacantes").update(cambios).eq("id", v.id);
  return error ? error.message : null;
}

export default function VacantesEmpresa() {
  const avisos = useAvisos();
  const [vacantes, setVacantes] = useState<VacanteFila[] | null>(null);
  const [tab, setTab] = useState<"activas" | "cerradas">("activas");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("vacantes")
      .select("*, postulaciones(count), vacante_carreras(carreras(nombre))")
      .order("fecha_publicacion", { ascending: false });
    if (error) avisos.error("No se pudieron cargar tus vacantes", error.message);
    setVacantes((data as VacanteFila[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const lista = useMemo(() => (vacantes ?? []).filter((v) => (tab === "activas") === esVigente(v)), [vacantes, tab]);
  const nActivas = (vacantes ?? []).filter(esVigente).length;

  const alternar = async (v: VacanteFila) => {
    const err = await alternarEstado(v);
    if (err) return avisos.error("No se pudo cambiar el estado", err);
    avisos.ok(esVigente(v) ? "Vacante cerrada" : "Vacante reabierta", esVigente(v) ? "Ya no recibe postulaciones." : "Vuelve a recibir postulaciones.");
    void cargar();
  };

  const eliminar = async (v: VacanteFila) => {
    const n = v.postulaciones?.[0]?.count ?? 0;
    const ok = await avisos.confirmar({
      titulo: `¿Eliminar «${v.titulo_puesto}»?`,
      texto: n ? `También se eliminarán sus ${n} postulaciones. Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer.",
      confirmar: "Eliminar vacante",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("vacantes").delete().eq("id", v.id);
    if (error) return avisos.error("No se pudo eliminar", error.message);
    avisos.ok("Vacante eliminada");
    void cargar();
  };

  const exportar = () => descargarExcel("mis_vacantes", ["Título", "Carreras", "Modalidad", "Ubicación", "Estado", "Fecha límite", "Postulantes"],
    (vacantes ?? []).map((v) => [v.titulo_puesto, v.vacante_carreras.map((c) => c.carreras?.nombre).join(", "), v.modalidad, v.ubicacion, esVigente(v) ? "Abierta" : "Cerrada", v.fecha_limite, v.postulaciones?.[0]?.count ?? 0]), "#1e293b");

  return (
    <AppLayout
      titulo="Mis vacantes"
      acciones={<>
        <button className="btn btn-ghost btn-sm" onClick={exportar} disabled={!vacantes?.length}><FiDownload /> Exportar</button>
        <Link to="/empresa/vacantes/nueva" className="btn btn-primary btn-sm"><FiPlus /> Nueva vacante</Link>
      </>}
    >
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "activas"} className={tab === "activas" ? "activo" : ""} onClick={() => setTab("activas")}>Activas <span>{nActivas}</span></button>
        <button role="tab" aria-selected={tab === "cerradas"} className={tab === "cerradas" ? "activo" : ""} onClick={() => setTab("cerradas")}>Cerradas o vencidas <span>{(vacantes?.length ?? 0) - nActivas}</span></button>
      </div>
      {!vacantes ? <Cargando /> : lista.length === 0 ? (
        tab === "activas"
          ? <Vacio titulo="No tienes vacantes activas" texto="Publica una convocatoria y empieza a recibir CVs hoy." accion={<Link to="/empresa/vacantes/nueva" className="btn btn-primary"><FiPlus /> Publicar vacante</Link>} />
          : <Vacio titulo="No hay vacantes cerradas" />
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead><tr><th>Vacante</th><th>Modalidad</th><th>Cierre</th><th className="num">Postulantes</th><th className="acciones-col">Acciones</th></tr></thead>
            <tbody>
              {lista.map((v) => {
                const n = v.postulaciones?.[0]?.count ?? 0;
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.titulo_puesto}</strong>
                      <small className="muted block">{v.vacante_carreras.map((c) => c.carreras?.nombre).filter(Boolean).join(", ") || "Todas las carreras"}</small>
                    </td>
                    <td>{v.modalidad}{v.ubicacion ? <small className="muted block">{v.ubicacion}</small> : null}</td>
                    <td>{esVigente(v) ? textoCierre(v.fecha_limite) : v.estado === "cerrada" ? "Cerrada" : `Venció el ${fecha(v.fecha_limite)}`}</td>
                    <td className="num"><Link to={`/empresa/postulantes?vacante=${v.id}`}>{n}</Link></td>
                    <td className="acciones-col">
                      <div className="acciones">
                        <Link to={`/empresa/postulantes?vacante=${v.id}`} className="icon-btn" title="Ver postulantes" aria-label="Ver postulantes"><FiUsers /></Link>
                        <Link to={`/empresa/vacantes/${v.id}/editar`} className="icon-btn" title="Editar" aria-label="Editar"><FiEdit2 /></Link>
                        <a href={`/vacante/${v.id}`} target="_blank" rel="noreferrer" className="icon-btn" title="Ver publicación" aria-label="Ver publicación"><FiExternalLink /></a>
                        <button className="btn btn-ghost btn-sm" onClick={() => void alternar(v)}>{esVigente(v) ? "Cerrar" : "Reabrir"}</button>
                        <button className="icon-btn icon-danger" onClick={() => void eliminar(v)} title="Eliminar" aria-label="Eliminar"><FiTrash2 /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
