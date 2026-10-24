import { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiDownload, FiExternalLink, FiMail, FiSearch } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Avatar, Cargando, Modal, Spinner, Vacio } from "../../components/ui";
import { Link, setQuery, useLocation } from "../../lib/router";
import { callFn, errorMsg, supabase, urlFirmada } from "../../lib/supabase";
import { useAvisos } from "../../lib/avisos";
import { fecha } from "../../lib/format";
import { descargarExcel } from "../../lib/exportar";
import type { Empresa, EstadoEmpresa } from "../../lib/types";
import { esVigente, type VacanteFila } from "../empresa/Vacantes";

type EmpresaFila = Empresa & { vacantes: { count: number }[] };

const ESTADO_TXT: Record<EstadoEmpresa, string> = { pendiente: "Por revisar", aprobado: "Aprobada", bloqueado: "Bloqueada" };
const ESTADO_CLS: Record<EstadoEmpresa, string> = { pendiente: "badge-wait", aprobado: "badge-ok", bloqueado: "badge-bad" };

/** Aprueba / bloquea (con correo de bienvenida al aprobar). */
function useCambiarEstado(onDone: () => void) {
  const avisos = useAvisos();
  return async (e: Empresa, estado: EstadoEmpresa) => {
    if (estado === "bloqueado") {
      const ok = await avisos.confirmar({ titulo: `¿Bloquear a ${e.nombre_comercial}?`, texto: "No podrá iniciar sesión y sus vacantes dejarán de mostrarse.", confirmar: "Bloquear", peligro: true });
      if (!ok) return;
    }
    try {
      const r = await callFn<{ mail_sent: boolean; mail_error: string | null; creditos_bienvenida: number }>("admin-empresas", { empresa_id: e.id, estado });
      if (estado === "aprobado" && e.estado !== "aprobado") {
        if (r.mail_sent) avisos.ok("Empresa aprobada", `Le enviamos un correo de bienvenida${r.creditos_bienvenida ? ` y ${r.creditos_bienvenida} créditos de regalo` : ""}.`);
        else avisos.aviso("Empresa aprobada, pero el correo no salió", r.mail_error ?? undefined);
      } else avisos.ok(estado === "bloqueado" ? "Empresa bloqueada" : "Estado actualizado");
      onDone();
    } catch (err) {
      avisos.error("No se pudo cambiar el estado", errorMsg(err));
    }
  };
}

function ModalCorreoEmpresa({ e, onClose }: { e: Empresa; onClose: () => void }) {
  const avisos = useAvisos();
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState(`Hola ${e.nombre_comercial}:\n\n`);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    try {
      await callFn("enviar-correo", { tipo: "empresa", empresa_id: e.id, asunto, mensaje });
      avisos.ok("Correo enviado");
      onClose();
    } catch (err) {
      avisos.error("No se pudo enviar", errorMsg(err));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal titulo={`Escribir a ${e.nombre_comercial}`} onClose={onClose} pie={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={enviar} disabled={enviando || !asunto.trim() || !mensaje.trim()}>{enviando ? <Spinner /> : <FiMail />} Enviar correo</button>
    </>}>
      <div className="stack">
        <p className="muted small">Para: {e.correo_contacto}</p>
        <label className="campo"><span className="campo-label-txt">Asunto</span><input value={asunto} onChange={(x) => setAsunto(x.target.value)} /></label>
        <label className="campo"><span className="campo-label-txt">Mensaje</span><textarea rows={8} value={mensaje} onChange={(x) => setMensaje(x.target.value)} /></label>
      </div>
    </Modal>
  );
}

export function EmpresasAdmin() {
  const { query } = useLocation();
  const [lista, setLista] = useState<EmpresaFila[] | null>(null);
  const [correo, setCorreo] = useState<Empresa | null>(null);
  const [q, setQ] = useState(query.get("q") ?? "");
  const fEstado = query.get("estado") ?? "";

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("empresas").select("*, vacantes(count)").order("creado_en", { ascending: false });
    setLista((data as EmpresaFila[]) ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const cambiar = useCambiarEstado(cargar);

  const visibles = useMemo(() => {
    const t = (query.get("q") ?? "").toLowerCase();
    return (lista ?? []).filter((e) => (!fEstado || e.estado === fEstado) && (!t || `${e.nombre_comercial} ${e.ruc} ${e.correo_contacto}`.toLowerCase().includes(t)));
  }, [lista, fEstado, query]);

  const conteo = (est: string) => (lista ?? []).filter((e) => e.estado === est).length;

  const exportar = () => descargarExcel("reporte_empresas", ["RUC", "Empresa", "Sector", "Correo", "Teléfono", "Estado", "Vacantes", "Registro"],
    (lista ?? []).map((e) => [e.ruc, e.nombre_comercial, e.sector, e.correo_contacto, e.telefono, ESTADO_TXT[e.estado], e.vacantes?.[0]?.count ?? 0, fecha(e.creado_en)]));

  return (
    <AppLayout titulo="Empresas" acciones={<button className="btn btn-ghost btn-sm" onClick={exportar} disabled={!lista?.length}><FiDownload /> Exportar</button>}>
      <div className="toolbar">
        <form className="buscador buscador-sm" onSubmit={(e) => { e.preventDefault(); setQuery({ q: q.trim() || null }); }}>
          <FiSearch aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setQuery({ q: q.trim() || null })} placeholder="Nombre, RUC o correo" aria-label="Buscar empresa" />
        </form>
        <div className="segmentos" role="group" aria-label="Estado">
          <button className={!fEstado ? "activo" : ""} onClick={() => setQuery({ estado: null })}>Todas</button>
          {(["pendiente", "aprobado", "bloqueado"] as EstadoEmpresa[]).map((s) => (
            <button key={s} className={fEstado === s ? "activo" : ""} onClick={() => setQuery({ estado: s })}>{ESTADO_TXT[s]} <span>{conteo(s)}</span></button>
          ))}
        </div>
      </div>
      {!lista ? <Cargando /> : visibles.length === 0 ? <Vacio titulo="No hay empresas con esos filtros" /> : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead><tr><th>Empresa</th><th>Contacto</th><th>Registro</th><th className="num">Vacantes</th><th>Estado</th><th className="acciones-col">Acciones</th></tr></thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/admin/empresas/${e.id}`} className="celda-emp"><Avatar src={e.foto_perfil} nombre={e.nombre_comercial} size={38} /><span><strong>{e.nombre_comercial}</strong><small className="muted block">RUC {e.ruc}{e.ruc_verificado ? " ✓ SUNAT" : ""}</small></span></Link></td>
                  <td>{e.correo_contacto}<small className="muted block">{e.telefono}</small></td>
                  <td>{fecha(e.creado_en)}</td>
                  <td className="num">{e.vacantes?.[0]?.count ?? 0}</td>
                  <td><span className={`badge ${ESTADO_CLS[e.estado]}`}>{ESTADO_TXT[e.estado]}</span></td>
                  <td className="acciones-col">
                    <div className="acciones">
                      <Link to={`/admin/empresas/${e.id}`} className="btn btn-ghost btn-sm">Revisar</Link>
                      {e.estado !== "aprobado" && <button className="btn btn-ok btn-sm" onClick={() => void cambiar(e, "aprobado")}>Aprobar</button>}
                      {e.estado === "aprobado" && <button className="btn btn-danger-ghost btn-sm" onClick={() => void cambiar(e, "bloqueado")}>Bloquear</button>}
                      <button className="icon-btn" title="Enviar correo" aria-label="Enviar correo" onClick={() => setCorreo(e)}><FiMail /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {correo && <ModalCorreoEmpresa e={correo} onClose={() => setCorreo(null)} />}
    </AppLayout>
  );
}

function Documento({ titulo, path }: { titulo: string; path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void urlFirmada("documentos", path).then(setUrl); }, [path]);
  const esPdf = path?.toLowerCase().endsWith(".pdf");
  return (
    <figure className="doc">
      <figcaption>{titulo}</figcaption>
      {!path ? <div className="doc-vacio">No adjuntado</div> : !url ? <div className="doc-vacio"><Spinner /></div> : esPdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="doc-vacio"><FiExternalLink /> Abrir PDF</a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={titulo} /></a>
      )}
    </figure>
  );
}

export function EmpresaDetalle({ id }: { id: string }) {
  const [e, setE] = useState<Empresa | null | undefined>(undefined);
  const [vacs, setVacs] = useState<VacanteFila[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [correo, setCorreo] = useState(false);

  const cargar = useCallback(async () => {
    const [emp, v, s] = await Promise.all([
      supabase.from("empresas").select("*").eq("id", Number(id)).maybeSingle(),
      supabase.from("vacantes").select("*, postulaciones(count), vacante_carreras(carreras(nombre))").eq("empresa_id", Number(id)).order("fecha_publicacion", { ascending: false }),
      supabase.from("creditos_empresa").select("saldo").eq("empresa_id", Number(id)).maybeSingle(),
    ]);
    setE((emp.data as Empresa) ?? null);
    setVacs((v.data as VacanteFila[]) ?? []);
    setSaldo(s.data?.saldo ?? 0);
  }, [id]);
  useEffect(() => { void cargar(); }, [cargar]);
  const cambiar = useCambiarEstado(cargar);

  if (e === undefined) return <AppLayout titulo="Empresa"><Cargando /></AppLayout>;
  if (!e) return <AppLayout titulo="Empresa"><Vacio titulo="Empresa no encontrada" accion={<Link to="/admin/empresas" className="btn btn-primary">Volver</Link>} /></AppLayout>;
  const totalPost = vacs.reduce((n, v) => n + (v.postulaciones?.[0]?.count ?? 0), 0);

  return (
    <AppLayout titulo="Expediente de empresa">
      <Link to="/admin/empresas" className="volver"><FiArrowLeft /> Empresas</Link>
      <section className="expediente">
        <div className="perfil-cab">
          <Avatar src={e.foto_perfil} nombre={e.nombre_comercial} size={84} />
          <div>
            <h2>{e.nombre_comercial}</h2>
            <p className="muted">RUC {e.ruc} — {e.ruc_verificado ? "verificado en SUNAT" : "sin verificación automática, revisa la ficha RUC"}</p>
            <span className={`badge ${ESTADO_CLS[e.estado]}`}>{ESTADO_TXT[e.estado]}</span>
          </div>
          <div className="fila expediente-acc">
            {e.estado !== "aprobado" && <button className="btn btn-ok" onClick={() => void cambiar(e, "aprobado")}>Aprobar empresa</button>}
            {e.estado !== "bloqueado" && <button className="btn btn-danger-ghost" onClick={() => void cambiar(e, "bloqueado")}>Bloquear</button>}
            <button className="btn btn-ghost" onClick={() => setCorreo(true)}><FiMail /> Escribir</button>
          </div>
        </div>
        <dl className="datos">
          <div><dt>Correo</dt><dd>{e.correo_contacto}</dd></div>
          <div><dt>Teléfono</dt><dd>{e.telefono ?? "—"}</dd></div>
          <div><dt>Sector</dt><dd>{e.sector}</dd></div>
          <div><dt>Dirección</dt><dd>{e.direccion ?? "—"}</dd></div>
          <div><dt>Registro</dt><dd>{fecha(e.creado_en)}</dd></div>
          <div><dt>Actividad</dt><dd>{vacs.length} vacantes, {totalPost} postulantes, {saldo} créditos</dd></div>
        </dl>
      </section>
      <h2 className="h-seccion">Documentos de verificación</h2>
      <div className="docs">
        <Documento titulo="Ficha RUC" path={e.ficha_ruc} />
        <Documento titulo="DNI frente" path={e.dni_frente} />
        <Documento titulo="DNI reverso" path={e.dni_reverso} />
        <Documento titulo="Selfie" path={e.foto_selfie} />
      </div>
      <h2 className="h-seccion">Vacantes</h2>
      {vacs.length === 0 ? <p className="muted">Esta empresa aún no publicó vacantes.</p> : (
        <div className="tabla-wrap">
          <table className="tabla tabla-compacta">
            <thead><tr><th>Vacante</th><th>Estado</th><th>Límite</th><th className="num">Postulantes</th><th></th></tr></thead>
            <tbody>{vacs.map((v) => (
              <tr key={v.id}>
                <td>{v.titulo_puesto}</td><td>{esVigente(v) ? "Abierta" : "Cerrada"}</td><td>{fecha(v.fecha_limite)}</td>
                <td className="num">{v.postulaciones?.[0]?.count ?? 0}</td>
                <td><Link to={`/admin/vacantes/${v.id}/postulantes`} className="btn btn-link btn-sm">Ver postulantes</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {correo && <ModalCorreoEmpresa e={e} onClose={() => setCorreo(false)} />}
    </AppLayout>
  );
}
