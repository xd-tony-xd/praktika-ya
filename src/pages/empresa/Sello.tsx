import { useCallback, useEffect, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiCircle, FiCopy, FiExternalLink } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Cargando, SelloStamp, Spinner, Switch } from "../../components/ui";
import { Link } from "../../lib/router";
import { callFn, errorMsg, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useAvisos } from "../../lib/avisos";
import { CRITERIOS_SELLO, fechaHora } from "../../lib/format";
import type { SelloPublico } from "../../lib/types";

export default function SelloEmpresa() {
  const { empresa, recargar } = useAuth();
  const avisos = useAvisos();
  const [sello, setSello] = useState<SelloPublico | null | undefined>(undefined);
  const [evaluando, setEvaluando] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresa) return;
    const { data } = await supabase.rpc("consultar_sello", { p_empresa_id: empresa.id });
    setSello((data as SelloPublico) ?? null);
  }, [empresa]);
  useEffect(() => { void cargar(); }, [cargar]);

  const cambiar = async (campo: "postulacion_ciega" | "comunica_motivo_no_seleccion", valor: boolean) => {
    if (!empresa) return;
    const { error } = await supabase.from("empresas").update({ [campo]: valor }).eq("id", empresa.id);
    if (error) return avisos.error("No se pudo guardar", error.message);
    await recargar();
    avisos.ok("Política actualizada", "Vuelve a evaluar el sello para que se refleje.");
  };

  const evaluar = async () => {
    setEvaluando(true);
    try {
      const r = await callFn<{ sello_otorgado: boolean }>("sello", { accion: "evaluar" });
      avisos[r.sello_otorgado ? "ok" : "aviso"](r.sello_otorgado ? "¡Sello otorgado!" : "Aún no cumples todos los criterios", r.sello_otorgado ? "Tus vacantes ya muestran la insignia." : "Revisa los criterios pendientes abajo.");
      await cargar();
    } catch (e) {
      avisos.error("No se pudo evaluar", errorMsg(e));
    } finally {
      setEvaluando(false);
    }
  };

  if (!empresa || sello === undefined) return <AppLayout titulo="Sello de transparencia"><Cargando /></AppLayout>;
  const d = sello?.detalle ?? {};
  const evaluado = Boolean(sello?.emitido_en);
  const urlPublica = `${window.location.origin}/sello/${empresa.id}`;

  return (
    <AppLayout titulo="Sello de transparencia">
      <section className="sello-hero">
        <SelloStamp size={150} vigente={Boolean(sello?.sello_vigente)} />
        <div>
          <h2>{sello?.sello_vigente ? "Tu sello está vigente" : evaluado ? "Tu empresa aún no tiene el sello" : "Solicita tu primera evaluación"}</h2>
          <p className="muted">El sello se calcula con datos reales de tus procesos: tus requisitos, cómo evalúa la IA y cuántos postulantes reciben respuesta. Dura 90 días y cada evaluación queda registrada con una huella verificable.</p>
          <div className="fila">
            <button className="btn btn-primary" onClick={evaluar} disabled={evaluando}>{evaluando ? <><Spinner /> Evaluando…</> : evaluado ? "Volver a evaluar" : "Evaluar ahora"}</button>
            {evaluado && <Link to={`/sello/${empresa.id}`} target="_blank" className="btn btn-ghost"><FiExternalLink /> Página pública</Link>}
            {evaluado && <button className="btn btn-link" onClick={() => { void navigator.clipboard.writeText(urlPublica); avisos.ok("Enlace copiado"); }}><FiCopy /> Copiar enlace</button>}
          </div>
          {evaluado && <p className="muted small">Última evaluación: {fechaHora(sello?.emitido_en)}</p>}
        </div>
      </section>

      <section className="caja">
        <h2>Tu política de selección</h2>
        <div className="stack">
          <Switch id="ciega" checked={empresa.postulacion_ciega} onChange={(v) => void cambiar("postulacion_ciega", v)} label="Postulación ciega: la IA no considera nombre, edad, sexo, foto ni datos de contacto" />
          <Switch id="motivo" checked={empresa.comunica_motivo_no_seleccion} onChange={(v) => void cambiar("comunica_motivo_no_seleccion", v)} label="Me comprometo a comunicar el motivo de no selección a los postulantes no aptos" />
        </div>
      </section>

      <section>
        <h2 className="h-seccion">Criterios</h2>
        <ul className="criterios">
          {Object.entries(CRITERIOS_SELLO).map(([k, c]) => {
            const ok = sello?.criterios_cumplidos.includes(k);
            let extra = "";
            if (k === "tasa_respuesta_mayor_o_igual_70%" && d.postulaciones_total !== undefined) extra = `${d.postulaciones_respondidas} de ${d.postulaciones_total} postulantes recibieron correo (${Math.round((d.tasa_respuesta ?? 0) * 100)} %).`;
            if (k === "comunica_motivo_no_seleccion" && d.no_aptos_total) extra = `${d.no_aptos_notificados} de ${d.no_aptos_total} no aptos recibieron su resultado.`;
            return (
              <li key={k} className={ok ? "ok" : ""}>
                {!evaluado ? <FiCircle /> : ok ? <FiCheckCircle aria-label="Cumple" /> : <FiAlertTriangle aria-label="Pendiente" />}
                <div><strong>{c.titulo}</strong><p>{c.detalle}</p>{extra && <p className="small muted">{extra}</p>}</div>
              </li>
            );
          })}
        </ul>
      </section>

      {d.vacantes_revisadas && d.vacantes_revisadas.some((v) => v.discriminatorio || !v.verificable) && (
        <section className="caja">
          <h2>Vacantes a corregir</h2>
          <ul className="lista-obs">
            {d.vacantes_revisadas.filter((v) => v.discriminatorio || !v.verificable).map((v) => (
              <li key={v.id}>
                <div className="fila-entre"><strong>{v.titulo}</strong><Link to={`/empresa/vacantes/${v.id}/editar`} className="btn btn-ghost btn-sm">Editar requisitos</Link></div>
                <ul>{v.observaciones.map((o, i) => <li key={i} className="small">{o}</li>)}</ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppLayout>
  );
}
