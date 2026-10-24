import { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiExternalLink, FiSearch, FiUsers } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Cargando, Vacio } from "../../components/ui";
import { Link, setQuery, useLocation } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { useAvisos } from "../../lib/avisos";
import { fecha, textoCierre } from "../../lib/format";
import { alternarEstado, esVigente, type VacanteFila } from "../empresa/Vacantes";
import { TablaPostulantes } from "../empresa/Postulantes";

export function VacantesAdmin() {
  const avisos = useAvisos();
  const { query } = useLocation();
  const [lista, setLista] = useState<VacanteFila[] | null>(null);
  const [q, setQ] = useState(query.get("q") ?? "");
  const tab = query.get("tab") === "cerradas" ? "cerradas" : "activas";
  const fMod = query.get("modalidad") ?? "";

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("vacantes")
      .select("*, empresas(nombre_comercial), postulaciones(count), vacante_carreras(carreras(nombre))")
      .order("fecha_publicacion", { ascending: false }).limit(2000);
    setLista((data as VacanteFila[]) ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const t = (query.get("q") ?? "").toLowerCase();
    return (lista ?? []).filter((v) => (tab === "activas") === esVigente(v) && (!fMod || v.modalidad === fMod) &&
      (!t || `${v.titulo_puesto} ${v.empresas?.nombre_comercial}`.toLowerCase().includes(t)));
  }, [lista, tab, fMod, query]);

  const alternar = async (v: VacanteFila) => {
    const err = await alternarEstado(v);
    if (err) return avisos.error("No se pudo cambiar", err);
    avisos.ok(esVigente(v) ? "Vacante cerrada" : "Vacante reabierta");
    void cargar();
  };

  return (
    <AppLayout titulo="Vacantes de la plataforma">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "activas"} className={tab === "activas" ? "activo" : ""} onClick={() => setQuery({ tab: null })}>Activas</button>
        <button role="tab" aria-selected={tab === "cerradas"} className={tab === "cerradas" ? "activo" : ""} onClick={() => setQuery({ tab: "cerradas" })}>Cerradas o vencidas</button>
      </div>
      <div className="toolbar">
        <form className="buscador buscador-sm" onSubmit={(e) => { e.preventDefault(); setQuery({ q: q.trim() || null }); }}>
          <FiSearch aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setQuery({ q: q.trim() || null })} placeholder="Puesto o empresa" aria-label="Buscar vacante" />
        </form>
        <select value={fMod} onChange={(e) => setQuery({ modalidad: e.target.value || null })} aria-label="Modalidad">
          <option value="">Todas las modalidades</option><option>Presencial</option><option>Híbrido</option><option>Remoto</option>
        </select>
      </div>
      {!lista ? <Cargando /> : visibles.length === 0 ? <Vacio titulo="No hay vacantes aquí" /> : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead><tr><th>Vacante</th><th>Empresa</th><th>Modalidad</th><th>Cierre</th><th className="num">Postulantes</th><th className="acciones-col">Acciones</th></tr></thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.titulo_puesto}</strong><small className="muted block">{v.vacante_carreras.map((c) => c.carreras?.nombre).filter(Boolean).join(", ")}</small></td>
                  <td><Link to={`/admin/empresas/${v.empresa_id}`}>{v.empresas?.nombre_comercial}</Link></td>
                  <td>{v.modalidad}</td>
                  <td>{esVigente(v) ? textoCierre(v.fecha_limite) : fecha(v.fecha_limite)}</td>
                  <td className="num">{v.postulaciones?.[0]?.count ?? 0}</td>
                  <td className="acciones-col"><div className="acciones">
                    <Link to={`/admin/vacantes/${v.id}/postulantes`} className="icon-btn" title="Postulantes" aria-label="Postulantes"><FiUsers /></Link>
                    <a href={`/vacante/${v.id}`} target="_blank" rel="noreferrer" className="icon-btn" title="Ver publicación" aria-label="Ver publicación"><FiExternalLink /></a>
                    <button className="btn btn-ghost btn-sm" onClick={() => void alternar(v)}>{esVigente(v) ? "Cerrar" : "Reabrir"}</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

export function PostulantesVacanteAdmin({ id }: { id: string }) {
  const [titulo, setTitulo] = useState("");
  useEffect(() => {
    void supabase.from("vacantes").select("titulo_puesto, empresas(nombre_comercial)").eq("id", Number(id)).maybeSingle().then(({ data }) => {
      const d = data as { titulo_puesto: string; empresas: { nombre_comercial: string } | null } | null;
      if (d) setTitulo(`${d.titulo_puesto} — ${d.empresas?.nombre_comercial ?? ""}`);
    });
  }, [id]);
  return (
    <AppLayout titulo="Postulantes de la vacante">
      <Link to="/admin/vacantes" className="volver"><FiArrowLeft /> Vacantes</Link>
      {titulo && <p className="saludo">{titulo}</p>}
      <p className="muted small">Vista de solo lectura. El análisis con IA y los correos los gestiona la empresa.</p>
      <TablaPostulantes soloLectura vacanteFija={Number(id)} />
    </AppLayout>
  );
}
