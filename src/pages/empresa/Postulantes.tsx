import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCpu, FiDownload, FiFileText, FiMail, FiSearch, FiZap } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Cargando, EstadoBadge, MatchDial, Modal, Spinner, Vacio } from "../../components/ui";
import { Link, setQuery, useLocation } from "../../lib/router";
import { ApiError, callFn, errorMsg, supabase, urlFirmada } from "../../lib/supabase";
import { useAvisos } from "../../lib/avisos";
import { useAuth } from "../../lib/auth";
import { useConfig } from "../../lib/config";
import { estadoLabel, fecha, fechaHora } from "../../lib/format";
import { descargarExcel } from "../../lib/exportar";
import type { EstadoPostulacion, Postulacion } from "../../lib/types";

type Fila = Postulacion & { vacantes: { id: number; titulo_puesto: string; modalidad: string } | null };

const PLANTILLAS: Record<"Apto" | "No Apto", { asunto: string; mensaje: string }> = {
  Apto: {
    asunto: "Siguientes pasos en tu postulación",
    mensaje: "Hola {nombre}:\n\nGracias por postular a {puesto}. Tu perfil cumple con lo que buscamos y queremos conocerte. En los próximos días te contactaremos para coordinar una entrevista.\n\nSaludos,",
  },
  "No Apto": {
    asunto: "Resultado de tu postulación",
    mensaje: "Hola {nombre}:\n\nGracias por postular a {puesto}. En esta ocasión elegimos perfiles que se ajustan más a los requisitos del puesto.\n\nMotivo principal: \n\nTe animamos a seguir postulando a nuestras próximas convocatorias.\n\nSaludos,",
  },
};

async function abrirCv(path: string) {
  const w = window.open("", "_blank");
  const url = await urlFirmada("cvs", path);
  if (url && w) w.location.href = url;
  else w?.close();
}

export function TablaPostulantes({ soloLectura = false, vacanteFija }: { soloLectura?: boolean; vacanteFija?: number }) {
  const avisos = useAvisos();
  const { config } = useConfig();
  const { query } = useLocation();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [vacantes, setVacantes] = useState<{ id: number; titulo_puesto: string }[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [analizando, setAnalizando] = useState<Set<number>>(new Set());
  const [progreso, setProgreso] = useState<{ hechos: number; total: number; fallidos: number } | null>(null);
  const [detalle, setDetalle] = useState<Fila | null>(null);
  const [correo, setCorreo] = useState<{ ids: number[]; titulo: string; tipo: "Apto" | "No Apto" } | null>(null);
  const [busqueda, setBusqueda] = useState(query.get("q") ?? "");

  const fVacante = vacanteFija ? String(vacanteFija) : query.get("vacante") ?? "";
  const fEstado = query.get("estado") ?? "";
  const fQ = query.get("q") ?? "";
  const verId = Number(query.get("ver") ?? 0);
  const umbral = Number(config.umbral_apto) || 60;

  const cargar = useCallback(async () => {
    let q = supabase.from("postulaciones").select("*, vacantes!inner(id,titulo_puesto,modalidad)")
      .order("match_porcentaje", { ascending: false }).order("fecha_postulacion", { ascending: false }).limit(2000);
    if (fVacante) q = q.eq("vacante_id", Number(fVacante));
    const { data, error } = await q;
    if (error) avisos.error("No se pudieron cargar los postulantes", error.message);
    setFilas((data as Fila[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fVacante]);

  const cargarSaldo = useCallback(async () => {
    if (soloLectura) return;
    const { data } = await supabase.from("creditos_empresa").select("saldo").maybeSingle();
    setSaldo(data?.saldo ?? 0);
  }, [soloLectura]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    void cargarSaldo();
    if (!vacanteFija) void supabase.from("vacantes").select("id,titulo_puesto").order("titulo_puesto").then(({ data }) => setVacantes(data ?? []));
  }, [cargarSaldo, vacanteFija]);

  useEffect(() => {
    if (verId && filas) {
      const f = filas.find((x) => x.id === verId);
      if (f) setDetalle(f);
    }
  }, [verId, filas]);

  const visibles = useMemo(() => {
    const t = fQ.toLowerCase();
    return (filas ?? []).filter((p) =>
      (!fEstado || p.estado_postulacion === fEstado) &&
      (!t || `${p.nombre_completo} ${p.correo_estudiante} ${p.dni} ${p.vacantes?.titulo_puesto}`.toLowerCase().includes(t)));
  }, [filas, fEstado, fQ]);

  const pendientes = visibles.filter((p) => p.estado_postulacion === "en_espera");
  const aptos = visibles.filter((p) => p.estado_postulacion === "Apto");
  const noAptos = visibles.filter((p) => p.estado_postulacion === "No Apto");

  const aplicarResultado = (id: number, r: { puntaje: number; descripcion: string; estado: EstadoPostulacion }) => {
    setFilas((fs) => fs?.map((p) => (p.id === id ? { ...p, match_porcentaje: r.puntaje, ia_analisis_descripcion: r.descripcion, estado_postulacion: r.estado, analizado_en: new Date().toISOString() } : p)) ?? null);
    setDetalle((d) => (d && d.id === id ? { ...d, match_porcentaje: r.puntaje, ia_analisis_descripcion: r.descripcion, estado_postulacion: r.estado } : d));
  };

  /** Analiza un CV. Devuelve "sin_creditos" para cortar el análisis masivo. */
  const analizarUno = async (p: Fila, silencioso = false): Promise<"ok" | "error" | "sin_creditos"> => {
    setAnalizando((s) => new Set(s).add(p.id));
    try {
      const r = await callFn<{ puntaje: number; descripcion: string; estado: EstadoPostulacion; saldo: number }>("analizar-cv", { postulacion_id: p.id });
      aplicarResultado(p.id, r);
      setSaldo(r.saldo);
      if (!silencioso) avisos.ok(`${p.nombre_completo}: ${r.puntaje}%`, r.estado === "Apto" ? "Cumple lo esencial del puesto." : "No alcanza el mínimo para este puesto.");
      return "ok";
    } catch (e) {
      const sinCreditos = e instanceof ApiError && e.data.sin_creditos;
      if (sinCreditos) {
        setSaldo(Number(e.data.saldo ?? 0));
        avisos.aviso("Te quedaste sin créditos IA", "Compra un paquete en Créditos IA para seguir analizando.");
        return "sin_creditos";
      }
      if (!silencioso) avisos.error("No se pudo analizar", errorMsg(e));
      return "error";
    } finally {
      setAnalizando((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  };

  const analizarTodos = async () => {
    const cola = [...pendientes];
    if (!cola.length) return;
    const ok = await avisos.confirmar({
      titulo: `¿Analizar ${cola.length} ${cola.length === 1 ? "CV" : "CVs"} con IA?`,
      texto: `Se usará 1 crédito por cada análisis completado. Tienes ${saldo ?? 0} créditos. Si un análisis falla, el crédito se devuelve.`,
      confirmar: "Analizar ahora",
    });
    if (!ok) return;
    const estado = { hechos: 0, total: cola.length, fallidos: 0 };
    setProgreso({ ...estado });
    let detener = false;
    const worker = async () => {
      while (cola.length && !detener) {
        const p = cola.shift()!;
        const r = await analizarUno(p, true);
        if (r === "sin_creditos") { detener = true; estado.fallidos += cola.length + 1; cola.length = 0; }
        else if (r === "error") estado.fallidos++;
        estado.hechos++;
        setProgreso({ ...estado });
      }
    };
    await Promise.all([worker(), worker()]);
    const exitos = estado.total - estado.fallidos;
    avisos[estado.fallidos ? "aviso" : "ok"]("Análisis terminado", `${exitos} de ${estado.total} CVs analizados.${estado.fallidos ? ` ${estado.fallidos} no se pudieron analizar.` : ""}`);
    setTimeout(() => setProgreso(null), 2500);
  };

  const cambiarEstado = async (p: Fila, estado: EstadoPostulacion) => {
    const { error } = await supabase.from("postulaciones").update({ estado_postulacion: estado }).eq("id", p.id);
    if (error) return avisos.error("No se pudo cambiar el estado", error.message);
    setFilas((fs) => fs?.map((x) => (x.id === p.id ? { ...x, estado_postulacion: estado } : x)) ?? null);
    setDetalle((d) => (d && d.id === p.id ? { ...d, estado_postulacion: estado } : d));
    avisos.ok(`Marcado como ${estadoLabel[estado].toLowerCase()}`);
  };

  const exportar = () => descargarExcel("postulantes", ["Convocatoria", "DNI", "Candidato", "Correo", "Celular", "Estado", "Match IA %", "Fecha", "Notificado"],
    visibles.map((p) => [p.vacantes?.titulo_puesto, p.dni, p.nombre_completo, p.correo_estudiante, p.celular, estadoLabel[p.estado_postulacion], Math.round(p.match_porcentaje), fechaHora(p.fecha_postulacion), p.notificado_en ? fechaHora(p.notificado_en) : "No"]));

  return (
    <>
      <div className="toolbar">
        <form className="buscador buscador-sm" onSubmit={(e) => { e.preventDefault(); setQuery({ q: busqueda.trim() || null }); }}>
          <FiSearch aria-hidden />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onBlur={() => setQuery({ q: busqueda.trim() || null })} placeholder="Nombre, DNI o correo" aria-label="Buscar postulante" />
        </form>
        {!vacanteFija && (
          <select value={fVacante} onChange={(e) => setQuery({ vacante: e.target.value || null, ver: null })} aria-label="Filtrar por vacante">
            <option value="">Todas las vacantes</option>
            {vacantes.map((v) => <option key={v.id} value={v.id}>{v.titulo_puesto}</option>)}
          </select>
        )}
        <select value={fEstado} onChange={(e) => setQuery({ estado: e.target.value || null })} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="en_espera">En espera</option>
          <option value="Apto">Apto</option>
          <option value="No Apto">No apto</option>
        </select>
        <div className="toolbar-der">
          {!soloLectura && saldo !== null && <Link to="/empresa/creditos" className="creditos-chip" title="Créditos IA disponibles"><FiCpu /> {saldo} {saldo === 1 ? "crédito" : "créditos"}</Link>}
          <button className="btn btn-ghost btn-sm" onClick={exportar} disabled={!visibles.length}><FiDownload /> Exportar</button>
        </div>
      </div>

      {!soloLectura && (
        <div className="acciones-masivas">
          <button className="btn btn-ia" onClick={analizarTodos} disabled={!pendientes.length || Boolean(progreso)}>
            <FiZap /> {pendientes.length ? `Analizar ${pendientes.length} pendientes` : "Sin CVs pendientes"}
          </button>
          {aptos.length > 0 && <button className="btn btn-ghost" onClick={() => setCorreo({ ids: aptos.map((p) => p.id), titulo: `Notificar a ${aptos.length} ${aptos.length === 1 ? "apto" : "aptos"}`, tipo: "Apto" })}><FiMail /> Notificar a {aptos.length} {aptos.length === 1 ? "apto" : "aptos"}</button>}
          {noAptos.length > 0 && <button className="btn btn-ghost" onClick={() => setCorreo({ ids: noAptos.map((p) => p.id), titulo: `Comunicar resultado a ${noAptos.length} ${noAptos.length === 1 ? "no apto" : "no aptos"}`, tipo: "No Apto" })}><FiMail /> Comunicar resultado a {noAptos.length} {noAptos.length === 1 ? "no apto" : "no aptos"}</button>}
        </div>
      )}

      {progreso && (
        <div className="progreso" role="status">
          <div className="progreso-txt"><Spinner /> Analizando CVs: {progreso.hechos} de {progreso.total}</div>
          <div className="progreso-barra"><span style={{ width: `${(progreso.hechos / progreso.total) * 100}%` }} /></div>
        </div>
      )}

      {!filas ? <Cargando /> : visibles.length === 0 ? (
        <Vacio titulo={filas.length ? "Nadie coincide con estos filtros" : "Aún no hay postulantes"} texto={filas.length ? "Cambia el estado o la búsqueda." : "Cuando un estudiante postule a tus vacantes aparecerá aquí."} />
      ) : (
        <div className="tabla-wrap">
          <table className="tabla tabla-post">
            <thead><tr><th>Candidato</th><th>Vacante</th><th>Fecha</th><th>Match IA</th><th>Estado</th><th className="acciones-col">Acciones</th></tr></thead>
            <tbody>
              {visibles.map((p) => {
                const pendiente = p.estado_postulacion === "en_espera" && !p.analizado_en;
                const enCurso = analizando.has(p.id);
                return (
                  <tr key={p.id} className={enCurso ? "fila-analizando" : ""}>
                    <td><button className="btn-link-inline fuerte" onClick={() => setDetalle(p)}>{p.nombre_completo}</button><small className="muted block">{p.correo_estudiante}</small></td>
                    <td>{p.vacantes?.titulo_puesto}<small className="muted block">{p.vacantes?.modalidad}</small></td>
                    <td>{fecha(p.fecha_postulacion)}</td>
                    <td>
                      {pendiente ? (
                        soloLectura ? <span className="muted">Sin analizar</span> : (
                          <button className="btn btn-ia btn-sm" disabled={enCurso} onClick={() => void analizarUno(p)}>{enCurso ? <><Spinner /> Analizando</> : <><FiZap /> Analizar</>}</button>
                        )
                      ) : <MatchDial valor={Number(p.match_porcentaje)} size={46} />}
                    </td>
                    <td><EstadoBadge estado={p.estado_postulacion} />{p.notificado_en && <small className="muted block">Notificado</small>}</td>
                    <td className="acciones-col">
                      <div className="acciones">
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetalle(p)}>Ver perfil</button>
                        <button className="icon-btn" title="Ver CV" aria-label="Ver CV" onClick={() => void abrirCv(p.cv_path)}><FiFileText /></button>
                        {!soloLectura && p.estado_postulacion !== "en_espera" && (
                          <button className="icon-btn" title="Enviar correo" aria-label="Enviar correo" onClick={() => setCorreo({ ids: [p.id], titulo: `Escribir a ${p.nombre_completo}`, tipo: p.estado_postulacion === "Apto" ? "Apto" : "No Apto" })}><FiMail /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <Modal titulo="Perfil del postulante" ancho="lg" onClose={() => { setDetalle(null); if (verId) setQuery({ ver: null }); }}>
          <div className="perfil-post">
            <div className="perfil-post-top">
              <MatchDial valor={detalle.estado_postulacion === "en_espera" && !detalle.analizado_en ? null : Number(detalle.match_porcentaje)} size={110} />
              <div>
                <h2>{detalle.nombre_completo}</h2>
                <p className="muted">{detalle.vacantes?.titulo_puesto}</p>
                <EstadoBadge estado={detalle.estado_postulacion} />
                {detalle.analizado_en && <small className="muted block">Analizado el {fechaHora(detalle.analizado_en)}{detalle.ia_modelo ? ` con ${detalle.ia_modelo}` : ""}</small>}
              </div>
            </div>
            <dl className="datos">
              <div><dt>DNI</dt><dd>{detalle.dni}</dd></div>
              <div><dt>Correo</dt><dd><a href={`mailto:${detalle.correo_estudiante}`}>{detalle.correo_estudiante}</a></dd></div>
              <div><dt>Celular</dt><dd>{detalle.celular ? <a href={`https://wa.me/51${detalle.celular}`} target="_blank" rel="noreferrer">{detalle.celular}</a> : "—"}</dd></div>
              <div><dt>Postuló</dt><dd>{fechaHora(detalle.fecha_postulacion)}</dd></div>
            </dl>
            {detalle.ia_analisis_descripcion && (
              <section className="opinion-ia">
                <h3>Evaluación de la IA</h3>
                <p className="texto-largo">{detalle.ia_analisis_descripcion}</p>
              </section>
            )}
            {detalle.voz_transcripcion && (
              <section className="opinion-ia">
                <h3>Presentación por voz <span className="muted small">(aprobada por el postulante)</span></h3>
                <div className="grid-3 small">
                  <div><strong>Estudios</strong><ul>{(detalle.voz_estudios ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div><strong>Experiencia</strong><ul>{(detalle.voz_experiencia ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div><strong>Habilidades</strong><ul>{(detalle.voz_habilidades ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
                <details><summary>Transcripción</summary><p className="texto-largo small">{detalle.voz_transcripcion}</p></details>
              </section>
            )}
            <div className="perfil-post-acciones">
              <button className="btn btn-ghost" onClick={() => void abrirCv(detalle.cv_path)}><FiFileText /> Ver CV</button>
              {!soloLectura && (
                <>
                  {detalle.estado_postulacion === "en_espera" && !detalle.analizado_en ? (
                    <button className="btn btn-ia" disabled={analizando.has(detalle.id)} onClick={() => void analizarUno(detalle)}>{analizando.has(detalle.id) ? <Spinner /> : <FiZap />} Analizar con IA</button>
                  ) : (
                    <button className="btn btn-primary" onClick={() => setCorreo({ ids: [detalle.id], titulo: `Escribir a ${detalle.nombre_completo}`, tipo: detalle.estado_postulacion === "Apto" ? "Apto" : "No Apto" })}><FiMail /> Enviar correo</button>
                  )}
                  <span className="separador" />
                  <span className="muted small">Cambiar estado:</span>
                  {(["Apto", "No Apto"] as EstadoPostulacion[]).filter((e) => e !== detalle.estado_postulacion).map((e) => (
                    <button key={e} className={`btn btn-sm ${e === "Apto" ? "btn-ok" : "btn-danger-ghost"}`} onClick={() => void cambiarEstado(detalle, e)}>Marcar {estadoLabel[e].toLowerCase()}</button>
                  ))}
                </>
              )}
            </div>
            {!soloLectura && detalle.analizado_en && <p className="muted small">Con tu configuración, un puntaje de {umbral}% o más se marca como apto automáticamente.</p>}
          </div>
        </Modal>
      )}

      {correo && (
        <ModalCorreo
          {...correo}
          onClose={() => setCorreo(null)}
          onEnviado={(ids) => setFilas((fs) => fs?.map((p) => (ids.includes(p.id) ? { ...p, notificado_en: new Date().toISOString() } : p)) ?? null)}
        />
      )}
    </>
  );
}

function ModalCorreo({ ids, titulo, tipo, onClose, onEnviado }: { ids: number[]; titulo: string; tipo: "Apto" | "No Apto"; onClose: () => void; onEnviado: (ids: number[]) => void }) {
  const avisos = useAvisos();
  const { empresa } = useAuth();
  const [asunto, setAsunto] = useState(PLANTILLAS[tipo].asunto);
  const [mensaje, setMensaje] = useState(`${PLANTILLAS[tipo].mensaje}\n${empresa?.nombre_comercial ?? ""}`);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!asunto.trim() || !mensaje.trim()) return avisos.aviso("Completa el asunto y el mensaje");
    if (tipo === "No Apto" && /Motivo principal:\s*\n/.test(mensaje)) {
      const seguir = await avisos.confirmar({ titulo: "¿Enviar sin el motivo?", texto: "Explicar el motivo de no selección es uno de los criterios del sello de transparencia.", confirmar: "Enviar igual" });
      if (!seguir) return;
    }
    setEnviando(true);
    try {
      const r = await callFn<{ enviados: number; fallidos: number; errores: string[] }>("enviar-correo", { tipo: "postulante", postulacion_ids: ids, asunto, mensaje });
      onEnviado(ids);
      avisos[r.fallidos ? "aviso" : "ok"](r.enviados === 1 ? "Correo enviado" : `${r.enviados} correos enviados`, r.fallidos ? r.errores.slice(0, 2).join(" ") : undefined);
      onClose();
    } catch (e) {
      avisos.error("No se pudo enviar", errorMsg(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={titulo} onClose={onClose} pie={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={enviar} disabled={enviando}>{enviando ? <Spinner /> : <FiMail />} {ids.length > 1 ? `Enviar ${ids.length} correos` : "Enviar correo"}</button>
    </>}>
      <div className="stack">
        <label className="campo"><span className="campo-label-txt">Asunto</span><input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={200} /></label>
        <label className="campo"><span className="campo-label-txt">Mensaje</span><textarea rows={10} value={mensaje} onChange={(e) => setMensaje(e.target.value)} /></label>
        <p className="muted small">{"{nombre}"} y {"{puesto}"} se reemplazan por los datos de cada postulante.</p>
      </div>
    </Modal>
  );
}

export default function PostulantesEmpresa() {
  return (
    <AppLayout titulo="Postulantes">
      <TablaPostulantes />
    </AppLayout>
  );
}
