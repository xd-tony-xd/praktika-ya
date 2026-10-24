import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FiDownload, FiEdit2, FiTrash2 } from "react-icons/fi";
import { AppLayout } from "../../components/AppLayout";
import { Cargando, Modal, Spinner, Stat, Switch } from "../../components/ui";
import { errorMsg, supabase } from "../../lib/supabase";
import { useAvisos } from "../../lib/avisos";
import { useConfig } from "../../lib/config";
import { fechaHora, soles, solesCentimos } from "../../lib/format";
import { descargarExcel } from "../../lib/exportar";
import type { Pago, Paquete } from "../../lib/types";

// ---------------------------------------------------------------- CARRERAS
export function CarrerasAdmin() {
  const avisos = useAvisos();
  const [lista, setLista] = useState<{ id: number; nombre: string; total_vacantes: number }[] | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc("reporte_carreras");
    setLista((data as { id: number; nombre: string; total_vacantes: number }[]) ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (nuevo.trim().length < 2) return;
    const { error } = await supabase.from("carreras").insert({ nombre: nuevo.trim() });
    if (error) return avisos.error("No se pudo agregar", error.code === "23505" ? "Esa carrera ya existe." : error.message);
    setNuevo("");
    avisos.ok("Carrera agregada");
    void cargar();
  };
  const guardar = async () => {
    if (!editando) return;
    const { error } = await supabase.from("carreras").update({ nombre: editando.nombre.trim() }).eq("id", editando.id);
    if (error) return avisos.error("No se pudo guardar", error.code === "23505" ? "Esa carrera ya existe." : error.message);
    setEditando(null);
    void cargar();
  };
  const borrar = async (c: { id: number; nombre: string; total_vacantes: number }) => {
    if (c.total_vacantes > 0) return avisos.aviso("No se puede eliminar", `«${c.nombre}» está en ${c.total_vacantes} vacantes.`);
    if (!(await avisos.confirmar({ titulo: `¿Eliminar «${c.nombre}»?`, confirmar: "Eliminar", peligro: true }))) return;
    const { error } = await supabase.from("carreras").delete().eq("id", c.id);
    if (error) return avisos.error("No se pudo eliminar", error.message);
    void cargar();
  };

  return (
    <AppLayout titulo="Carreras" acciones={<button className="btn btn-ghost btn-sm" disabled={!lista?.length} onClick={() => descargarExcel("reporte_carreras", ["ID", "Carrera", "Vacantes"], (lista ?? []).map((c) => [c.id, c.nombre, c.total_vacantes]), "#065f46")}><FiDownload /> Exportar</button>}>
      <form className="fila caja" onSubmit={crear}>
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre de la carrera" aria-label="Nueva carrera" maxLength={180} />
        <button className="btn btn-primary" disabled={nuevo.trim().length < 2}>Agregar carrera</button>
      </form>
      {!lista ? <Cargando /> : (
        <div className="tabla-wrap">
          <table className="tabla tabla-compacta">
            <thead><tr><th>Carrera</th><th className="num">Vacantes</th><th className="acciones-col"></th></tr></thead>
            <tbody>{lista.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td><td className="num">{c.total_vacantes}</td>
                <td className="acciones-col"><div className="acciones">
                  <button className="icon-btn" aria-label="Editar" onClick={() => setEditando({ id: c.id, nombre: c.nombre })}><FiEdit2 /></button>
                  <button className="icon-btn icon-danger" aria-label="Eliminar" onClick={() => void borrar(c)}><FiTrash2 /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {editando && (
        <Modal titulo="Editar carrera" ancho="sm" onClose={() => setEditando(null)} pie={<><button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar}>Guardar</button></>}>
          <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} aria-label="Nombre" autoFocus />
        </Modal>
      )}
    </AppLayout>
  );
}

// ---------------------------------------------------------------- PAQUETES IA Y VENTAS
const PAQ_VACIO = { id: 0, nombre: "", creditos: 50, costo_base: 0.5, margen_utilidad: 100, activo: true, orden: 0 };

export function PaquetesAdmin() {
  const avisos = useAvisos();
  const { config, recargar } = useConfig();
  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const [ventas, setVentas] = useState<Pago[]>([]);
  const [form, setForm] = useState<typeof PAQ_VACIO | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [p, v] = await Promise.all([
      supabase.from("paquetes_creditos").select("*").order("orden").order("creditos"),
      supabase.from("pagos_stripe").select("*, empresas(nombre_comercial,ruc)").order("creado_en", { ascending: false }).limit(200),
    ]);
    setPaquetes((p.data as Paquete[]) ?? []);
    setVentas((v.data as Pago[]) ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const pagados = ventas.filter((v) => v.estado === "pagado");
  const tot = (k: "monto_centimos" | "costo_estimado_centimos" | "utilidad_estimada_centimos") => pagados.reduce((n, v) => n + v[k], 0);
  const precioUnit = form ? Math.round(form.costo_base * (1 + form.margen_utilidad / 100) * 100) / 100 : 0;

  const guardar = async () => {
    if (!form) return;
    if (!form.nombre.trim() || form.creditos < 1 || form.costo_base < 0.01 || form.margen_utilidad < 0) return avisos.error("Revisa los valores del paquete");
    if (precioUnit * form.creditos < 1) return avisos.error("El paquete debe costar al menos S/ 1.00");
    setGuardando(true);
    const datos = { nombre: form.nombre.trim(), creditos: form.creditos, costo_base: form.costo_base, margen_utilidad: form.margen_utilidad, activo: form.activo, orden: form.orden };
    const { error } = form.id ? await supabase.from("paquetes_creditos").update(datos).eq("id", form.id) : await supabase.from("paquetes_creditos").insert(datos);
    setGuardando(false);
    if (error) return avisos.error("No se pudo guardar", error.code === "23505" ? "Ya existe un paquete con ese nombre." : error.message);
    setForm(null);
    avisos.ok("Paquete guardado");
    void cargar();
  };
  const borrar = async (p: Paquete) => {
    if (!(await avisos.confirmar({ titulo: `¿Eliminar el paquete ${p.nombre}?`, texto: "Las compras ya hechas no se ven afectadas.", confirmar: "Eliminar", peligro: true }))) return;
    const { error } = await supabase.from("paquetes_creditos").delete().eq("id", p.id);
    if (error) return avisos.error("No se pudo eliminar", error.message);
    void cargar();
  };
  const ventasOn = async (on: boolean) => {
    const { error } = await supabase.from("configuracion").upsert({ clave: "ai_credit_sales_enabled", valor: on ? "1" : "0" });
    if (error) return avisos.error("No se pudo cambiar", error.message);
    await recargar();
    avisos.ok(on ? "Venta de créditos activada" : "Venta de créditos pausada");
  };

  return (
    <AppLayout titulo="Paquetes IA y ventas" acciones={<button className="btn btn-primary btn-sm" onClick={() => setForm({ ...PAQ_VACIO, orden: (paquetes?.length ?? 0) + 1 })}>Nuevo paquete</button>}>
      <div className="stats">
        <Stat valor={solesCentimos(tot("monto_centimos"))} label="Ingresos" nota={`${pagados.length} ventas pagadas`} />
        <Stat valor={solesCentimos(tot("costo_estimado_centimos"))} label="Costo IA estimado" />
        <Stat valor={solesCentimos(tot("utilidad_estimada_centimos"))} label="Utilidad estimada" />
      </div>
      <div className="caja"><Switch id="ventas" checked={(config.ai_credit_sales_enabled ?? "1") === "1"} onChange={(v) => void ventasOn(v)} label="Permitir que las empresas compren créditos" /></div>
      <h2 className="h-seccion">Paquetes</h2>
      {!paquetes ? <Cargando /> : (
        <div className="tabla-wrap">
          <table className="tabla tabla-compacta">
            <thead><tr><th>Paquete</th><th className="num">Créditos</th><th className="num">Costo base</th><th className="num">Margen</th><th className="num">Precio / análisis</th><th className="num">Precio total</th><th>Estado</th><th></th></tr></thead>
            <tbody>{paquetes.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.nombre}</strong></td><td className="num">{p.creditos}</td><td className="num">{soles(p.costo_base)}</td><td className="num">{Number(p.margen_utilidad)} %</td>
                <td className="num">{soles(p.precio_unitario)}</td><td className="num"><strong>{soles(p.precio_total)}</strong></td>
                <td>{p.activo ? <span className="badge badge-ok">A la venta</span> : <span className="badge badge-wait">Oculto</span>}</td>
                <td className="acciones-col"><div className="acciones">
                  <button className="icon-btn" aria-label="Editar" onClick={() => setForm({ id: p.id, nombre: p.nombre, creditos: p.creditos, costo_base: Number(p.costo_base), margen_utilidad: Number(p.margen_utilidad), activo: p.activo, orden: p.orden })}><FiEdit2 /></button>
                  <button className="icon-btn icon-danger" aria-label="Eliminar" onClick={() => void borrar(p)}><FiTrash2 /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h2 className="h-seccion">Últimas ventas</h2>
      {ventas.length === 0 ? <p className="muted">Aún no hay ventas.</p> : (
        <div className="tabla-wrap">
          <table className="tabla tabla-compacta">
            <thead><tr><th>Fecha</th><th>Empresa</th><th>Paquete</th><th className="num">Monto</th><th className="num">Utilidad</th><th>Estado</th></tr></thead>
            <tbody>{ventas.map((v) => (
              <tr key={v.id}>
                <td>{fechaHora(v.creado_en)}</td><td>{v.empresas?.nombre_comercial}<small className="muted block">{v.empresas?.ruc}</small></td>
                <td>{v.paquete_nombre} ({v.creditos})</td><td className="num">{solesCentimos(v.monto_centimos)}</td><td className="num">{solesCentimos(v.utilidad_estimada_centimos)}</td>
                <td><span className={`badge ${v.estado === "pagado" ? "badge-ok" : v.estado === "fallido" ? "badge-bad" : "badge-wait"}`}>{v.estado === "pagado" ? "Pagado" : v.estado === "fallido" ? "Fallido" : "Pendiente"}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {form && (
        <Modal titulo={form.id ? "Editar paquete" : "Nuevo paquete"} onClose={() => setForm(null)} pie={<><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Spinner /> : "Guardar paquete"}</button></>}>
          <div className="stack">
            <label className="campo"><span className="campo-label-txt">Nombre</span><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} maxLength={100} /></label>
            <div className="grid-3">
              <label className="campo"><span className="campo-label-txt">Créditos</span><input type="number" min={1} value={form.creditos} onChange={(e) => setForm({ ...form, creditos: Number(e.target.value) })} /></label>
              <label className="campo"><span className="campo-label-txt">Costo base por análisis (S/)</span><input type="number" min={0.01} step={0.01} value={form.costo_base} onChange={(e) => setForm({ ...form, costo_base: Number(e.target.value) })} /></label>
              <label className="campo"><span className="campo-label-txt">Margen (%)</span><input type="number" min={0} step={1} value={form.margen_utilidad} onChange={(e) => setForm({ ...form, margen_utilidad: Number(e.target.value) })} /></label>
            </div>
            <p className="alerta alerta-info">Precio por análisis: <strong>{soles(precioUnit)}</strong> — Precio total: <strong>{soles(precioUnit * form.creditos)}</strong></p>
            <div className="grid-2">
              <label className="campo"><span className="campo-label-txt">Orden</span><input type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })} /></label>
              <Switch id="activo" checked={form.activo} onChange={(v) => setForm({ ...form, activo: v })} label="A la venta" />
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

// ---------------------------------------------------------------- CONFIGURACIÓN
const CAMPOS: { clave: string; label: string; tipo?: "textarea"; ayuda?: string }[] = [
  { clave: "nombre_sitio", label: "Nombre del sitio" },
  { clave: "footer_descripcion", label: "Descripción en el pie de página" },
  { clave: "mision_sitio", label: "Misión", tipo: "textarea" },
  { clave: "email_contacto", label: "Correo público" },
  { clave: "telefono_contacto", label: "Teléfono de contacto" },
  { clave: "facebook_url", label: "Facebook (URL)" },
  { clave: "instagram_url", label: "Instagram (URL)" },
  { clave: "linkedin_url", label: "LinkedIn (URL)" },
  { clave: "twitter_url", label: "X / Twitter (URL)" },
];

export function ConfigAdmin() {
  const { config, recargar } = useConfig();
  const avisos = useAvisos();
  const [v, setV] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setV({ ...config }), [config]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const filas = Object.entries(v).filter(([k]) => k in config || CAMPOS.some((c) => c.clave === k)).map(([clave, valor]) => ({ clave, valor: valor ?? "" }));
      if (logo) {
        const path = `branding/logo_${Date.now()}.${logo.name.split(".").pop()}`;
        const { error } = await supabase.storage.from("publico").upload(path, logo, { upsert: true, contentType: logo.type });
        if (error) throw error;
        filas.push({ clave: "logo_sitio", valor: supabase.storage.from("publico").getPublicUrl(path).data.publicUrl });
      }
      const { error } = await supabase.from("configuracion").upsert(filas);
      if (error) throw error;
      await recargar();
      setLogo(null);
      avisos.ok("Configuración guardada");
    } catch (err) {
      avisos.error("No se pudo guardar", errorMsg(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AppLayout titulo="Configuración">
      <form className="form-card form-panel" onSubmit={guardar}>
        <fieldset>
          <legend>Marca y contacto</legend>
          <div className="perfil-cab">
            <img src={logo ? URL.createObjectURL(logo) : v.logo_sitio || "/img/logo-icon.svg"} alt="Logo actual" className="logo-preview" />
            <div>
              <label className="btn btn-ghost btn-sm">Subir logo<input type="file" accept="image/*" className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></label>
              {v.logo_sitio && <button type="button" className="btn btn-link btn-sm" onClick={() => setV((x) => ({ ...x, logo_sitio: "" }))}>Usar logo por defecto</button>}
              <p className="muted small">PNG transparente o SVG, cuadrado.</p>
            </div>
          </div>
          <div className="grid-2">
            {CAMPOS.map((c) => (
              <label key={c.clave} className={`campo ${c.tipo === "textarea" ? "span-2" : ""}`}>
                <span className="campo-label-txt">{c.label}</span>
                {c.tipo === "textarea" ? <textarea rows={3} value={v[c.clave] ?? ""} onChange={set(c.clave)} /> : <input value={v[c.clave] ?? ""} onChange={set(c.clave)} />}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Postulaciones e IA</legend>
          <div className="grid-3">
            <label className="campo"><span className="campo-label-txt">Dominios de correo permitidos</span><input value={v.dominios_correo_estudiante ?? ""} onChange={set("dominios_correo_estudiante")} placeholder=".edu.pe" /><small className="muted">Separa con comas. Vacío permite cualquier correo.</small></label>
            <label className="campo"><span className="campo-label-txt">Puntaje mínimo para «apto»</span><input type="number" min={1} max={100} value={v.umbral_apto ?? "60"} onChange={set("umbral_apto")} /></label>
            <label className="campo"><span className="campo-label-txt">Créditos de regalo al aprobar una empresa</span><input type="number" min={0} value={v.creditos_bienvenida ?? "0"} onChange={set("creditos_bienvenida")} /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Mantenimiento</legend>
          <Switch id="mant" checked={v.modo_mantenimiento === "on"} onChange={(on) => setV((x) => ({ ...x, modo_mantenimiento: on ? "on" : "off" }))} label="Modo mantenimiento (solo los administradores pueden entrar)" />
          <label className="campo"><span className="campo-label-txt">Mensaje para los visitantes</span><input value={v.mantenimiento_msg ?? ""} onChange={set("mantenimiento_msg")} /></label>
        </fieldset>
        <fieldset>
          <legend>Textos legales</legend>
          <label className="campo"><span className="campo-label-txt">Términos y condiciones del registro de empresas</span><textarea rows={6} value={v.terminos_condiciones ?? ""} onChange={set("terminos_condiciones")} /></label>
          <label className="campo"><span className="campo-label-txt">Autorización que acepta el estudiante al postular</span><textarea rows={3} value={v.terminos_postulante ?? ""} onChange={set("terminos_postulante")} /></label>
        </fieldset>
        <div className="form-acciones">
          <button type="button" className="btn btn-ghost" onClick={() => { setV({ ...config }); setLogo(null); }}>Descartar cambios</button>
          <button className="btn btn-primary" disabled={guardando}>{guardando ? <Spinner /> : "Guardar configuración"}</button>
        </div>
      </form>
    </AppLayout>
  );
}
