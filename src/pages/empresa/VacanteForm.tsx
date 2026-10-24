import { useEffect, useState, type FormEvent } from "react";
import { FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Campo, Cargando, Spinner } from "../../components/ui";
import { Link, navigate } from "../../lib/router";
import { callFn, errorMsg, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useAvisos } from "../../lib/avisos";
import { hoyISO } from "../../lib/format";
import type { Carrera, Modalidad } from "../../lib/types";

interface Revision { discriminatorio: boolean; verificable: boolean; observaciones: string[]; sugerencia?: string }

export default function VacanteForm({ id }: { id?: string }) {
  const { empresa } = useAuth();
  const avisos = useAvisos();
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [cargando, setCargando] = useState(Boolean(id));
  const [f, setF] = useState({ titulo_puesto: "", descripcion_puesto: "", requisitos_raw: "", modalidad: "Presencial" as Modalidad, ubicacion: "", fecha_limite: hoyISO(30) });
  const [sel, setSel] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.from("carreras").select("id,nombre").order("nombre").then(({ data }) => setCarreras((data as Carrera[]) ?? []));
    if (!id) return;
    void (async () => {
      const { data } = await supabase.from("vacantes").select("*, vacante_carreras(carrera_id)").eq("id", Number(id)).maybeSingle();
      if (!data) {
        avisos.error("Vacante no encontrada");
        navigate("/empresa/vacantes");
        return;
      }
      setF({
        titulo_puesto: data.titulo_puesto, descripcion_puesto: data.descripcion_puesto, requisitos_raw: data.requisitos_raw,
        modalidad: data.modalidad, ubicacion: data.ubicacion ?? "", fecha_limite: data.fecha_limite ?? "",
      });
      setSel((data.vacante_carreras as { carrera_id: number }[]).map((c) => c.carrera_id));
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (cid: number) => setSel((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid]));

  const revisar = async () => {
    if (f.requisitos_raw.trim().length < 10) return avisos.aviso("Escribe primero los requisitos");
    setRevisando(true);
    setRevision(null);
    try {
      setRevision(await callFn<Revision>("sello", { accion: "revisar", texto: f.requisitos_raw, titulo: f.titulo_puesto }));
    } catch (e) {
      avisos.error("No se pudo revisar", errorMsg(e));
    } finally {
      setRevisando(false);
    }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (f.titulo_puesto.trim().length < 3) return setError("Escribe el título del puesto.");
    if (f.descripcion_puesto.trim().length < 20) return setError("Describe el puesto con al menos 20 caracteres.");
    if (f.requisitos_raw.trim().length < 10) return setError("Escribe los requisitos: la IA los usa para evaluar los CV.");
    if (f.fecha_limite && f.fecha_limite < hoyISO() && !id) return setError("La fecha límite no puede estar en el pasado.");
    if (!empresa) return;
    setGuardando(true);
    const datos = {
      titulo_puesto: f.titulo_puesto.trim(), descripcion_puesto: f.descripcion_puesto.trim(), requisitos_raw: f.requisitos_raw.trim(),
      modalidad: f.modalidad, ubicacion: f.ubicacion.trim() || null, fecha_limite: f.fecha_limite || null,
    };
    let vid = id ? Number(id) : 0;
    if (id) {
      const { error: err } = await supabase.from("vacantes").update(datos).eq("id", vid);
      if (err) { setGuardando(false); return setError(err.message); }
      await supabase.from("vacante_carreras").delete().eq("vacante_id", vid);
    } else {
      const { data, error: err } = await supabase.from("vacantes").insert({ ...datos, empresa_id: empresa.id }).select("id").single();
      if (err || !data) { setGuardando(false); return setError(err?.message ?? "No se pudo publicar."); }
      vid = data.id;
    }
    if (sel.length) {
      const { error: err } = await supabase.from("vacante_carreras").insert(sel.map((carrera_id) => ({ vacante_id: vid, carrera_id })));
      if (err) avisos.aviso("Se guardó la vacante, pero no las carreras", err.message);
    }
    setGuardando(false);
    avisos.ok(id ? "Cambios guardados" : "Vacante publicada", id ? undefined : "Ya está visible para los estudiantes.");
    navigate("/empresa/vacantes");
  };

  return (
    <AppLayout titulo={id ? "Editar vacante" : "Nueva vacante"}>
      {cargando ? <Cargando /> : (
        <form className="form-card form-panel" onSubmit={guardar}>
          {error && <div className="alerta alerta-error" role="alert">{error}</div>}
          <Campo label="Título del puesto" htmlFor="t"><input id="t" value={f.titulo_puesto} onChange={set("titulo_puesto")} placeholder="Practicante de desarrollo web" maxLength={190} /></Campo>
          <div className="grid-3">
            <Campo label="Modalidad" htmlFor="m">
              <select id="m" value={f.modalidad} onChange={set("modalidad")}>
                <option>Presencial</option><option>Híbrido</option><option>Remoto</option>
              </select>
            </Campo>
            <Campo label="Ubicación" htmlFor="u"><input id="u" value={f.ubicacion} onChange={set("ubicacion")} placeholder="Miraflores, Lima" /></Campo>
            <Campo label="Fecha límite" htmlFor="fl" ayuda="Déjala vacía si no tiene fecha de cierre."><input id="fl" type="date" value={f.fecha_limite} onChange={set("fecha_limite")} /></Campo>
          </div>
          <Campo label="Descripción del puesto" htmlFor="d"><textarea id="d" rows={6} value={f.descripcion_puesto} onChange={set("descripcion_puesto")} placeholder="Qué hará el practicante, horario, beneficios, subvención…" /></Campo>
          <Campo label="Requisitos" htmlFor="r" ayuda="Sé concreto: carrera y ciclo, herramientas, conocimientos. La IA compara cada CV con este texto.">
            <textarea id="r" rows={6} value={f.requisitos_raw} onChange={(e) => { set("requisitos_raw")(e); setRevision(null); }} placeholder={"Estudiante de Ing. de Sistemas desde 7.° ciclo\nConocimientos de JavaScript y SQL\nManejo de Git"} />
          </Campo>
          <div className="revision">
            <button type="button" className="btn btn-ghost btn-sm" onClick={revisar} disabled={revisando}>{revisando ? <Spinner /> : null} Revisar requisitos con IA</button>
            <span className="muted small">Detecta pedidos discriminatorios o vagos antes de publicar.</span>
            {revision && (
              <div className={`alerta ${revision.discriminatorio || !revision.verificable ? "alerta-aviso" : "alerta-ok"}`}>
                {revision.discriminatorio || !revision.verificable ? <FiAlertTriangle /> : <FiCheckCircle />}
                <div>
                  <strong>{revision.discriminatorio ? "Hay requisitos que podrían ser discriminatorios" : !revision.verificable ? "Los requisitos son poco verificables" : "Los requisitos se ven claros y justos"}</strong>
                  {revision.observaciones.length > 0 && <ul>{revision.observaciones.map((o, i) => <li key={i}>{o}</li>)}</ul>}
                  {revision.sugerencia && (
                    <>
                      <p className="small">Sugerencia:</p>
                      <p className="texto-largo small">{revision.sugerencia}</p>
                      <button type="button" className="btn btn-link btn-sm" onClick={() => { setF((x) => ({ ...x, requisitos_raw: revision.sugerencia! })); setRevision(null); }}>Usar esta versión</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="campo">
            <span className="campo-label-txt">Carreras afines <span className="muted">({sel.length ? `${sel.length} elegidas` : "si no eliges, aplica a todas"})</span></span>
            <div className="chips-sel">
              {carreras.map((c) => (
                <button type="button" key={c.id} className={sel.includes(c.id) ? "activo" : ""} aria-pressed={sel.includes(c.id)} onClick={() => toggle(c.id)}>{c.nombre}</button>
              ))}
            </div>
          </div>
          <div className="form-acciones">
            <Link to="/empresa/vacantes" className="btn btn-ghost">Cancelar</Link>
            <button className="btn btn-primary" disabled={guardando}>{guardando ? <Spinner /> : id ? "Guardar cambios" : "Publicar vacante"}</button>
          </div>
        </form>
      )}
    </AppLayout>
  );
}
