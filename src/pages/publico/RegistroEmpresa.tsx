import { useEffect, useState, type FormEvent } from "react";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import { PublicLayout } from "../../components/PublicLayout";
import { ArchivoDrop, Campo, Modal, Spinner } from "../../components/ui";
import { CapturaSelfie } from "../../components/Camara";
import { Link, navigate } from "../../lib/router";
import { callFn, errorMsg } from "../../lib/supabase";
import { useConfig } from "../../lib/config";
import { soloDigitos } from "../../lib/format";

interface RucData { razon_social: string; nombre_comercial: string; direccion: string; sector: string; estado: string; condicion: string }

export default function RegistroEmpresa() {
  const { config } = useConfig();
  const [ruc, setRuc] = useState("");
  const [rucInfo, setRucInfo] = useState<{ tipo: "ok" | "error" | "manual"; texto: string } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [f, setF] = useState({ nombre_comercial: "", sector: "", correo_contacto: "", telefono: "", direccion: "", password: "", password_confirm: "" });
  const [logo, setLogo] = useState<File | null>(null);
  const [ficha, setFicha] = useState<File | null>(null);
  const [dniF, setDniF] = useState<File | null>(null);
  const [dniR, setDniR] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [verTerminos, setVerTerminos] = useState(false);
  const [hp, setHp] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { document.title = "Registrar empresa · Práctika ya"; }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const datosVisibles = rucInfo !== null && rucInfo.tipo !== "error";

  const consultarRuc = async () => {
    if (ruc.length !== 11) return setRucInfo({ tipo: "error", texto: "El RUC debe tener 11 dígitos." });
    setConsultando(true);
    try {
      const r = await callFn<{ success: boolean; data?: RucData; error?: string; no_configurado?: boolean }>("consultar-documento", { tipo: "ruc", numero: ruc });
      if (r.success && r.data) {
        const activo = r.data.estado.toUpperCase() === "ACTIVO" && r.data.condicion.toUpperCase() === "HABIDO";
        if (!activo) {
          setRucInfo({ tipo: "error", texto: `El RUC figura como ${r.data.estado || "—"} / ${r.data.condicion || "—"} en SUNAT. Debe estar ACTIVO y HABIDO.` });
        } else {
          setF((x) => ({ ...x, nombre_comercial: r.data!.nombre_comercial || r.data!.razon_social, sector: r.data!.sector === "GENERAL" ? x.sector : r.data!.sector, direccion: r.data!.direccion }));
          setRucInfo({ tipo: "ok", texto: `${r.data.razon_social} — ACTIVO y HABIDO en SUNAT` });
        }
      } else if (r.no_configurado) {
        setRucInfo({ tipo: "manual", texto: "Completa los datos de tu empresa. El administrador verificará tu RUC." });
      } else {
        setRucInfo({ tipo: "error", texto: r.error || "No encontramos ese RUC en SUNAT." });
      }
    } catch (e) {
      setRucInfo({ tipo: "error", texto: errorMsg(e) });
    } finally {
      setConsultando(false);
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const falta = (cond: boolean, msg: string) => { if (cond) throw new Error(msg); };
    try {
      falta(!datosVisibles, "Primero consulta tu RUC.");
      falta(f.nombre_comercial.trim().length < 2, "Escribe el nombre comercial.");
      falta(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo_contacto.trim()), "Escribe un correo de contacto válido.");
      falta(!/^\d{9}$/.test(f.telefono), "El teléfono debe tener 9 dígitos.");
      falta(f.password.length < 8, "La contraseña debe tener al menos 8 caracteres.");
      falta(f.password !== f.password_confirm, "Las contraseñas no coinciden.");
      falta(!logo, "Sube el logo de tu empresa.");
      falta(!ficha, "Sube la ficha RUC en PDF.");
      falta(!dniF || !dniR, "Sube el DNI del representante (frente y reverso).");
      falta(!selfie, "Toma la selfie de verificación.");
      falta(!acepta, "Lee y acepta los términos y condiciones.");
    } catch (err) {
      setError(errorMsg(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const fd = new FormData();
    fd.append("ruc", ruc);
    Object.entries(f).forEach(([k, v]) => fd.append(k, k.startsWith("password") ? v : v.trim()));
    fd.append("accept_terms", "1");
    fd.append("website_url", hp);
    fd.append("foto_perfil", logo!);
    fd.append("ficha_ruc", ficha!);
    fd.append("dni_frente", dniF!);
    fd.append("dni_reverso", dniR!);
    fd.append("foto_selfie", selfie!);
    setEnviando(true);
    try {
      await callFn("registrar-empresa", fd);
      navigate("/login?registro=ok");
    } catch (err) {
      setError(errorMsg(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PublicLayout chat={false}>
      <div className="wrap form-pagina">
        <Link to="/" className="volver"><FiArrowLeft /> Inicio</Link>
        <header className="form-head">
          <h1>Registra tu empresa</h1>
          <p className="muted">Revisamos cada solicitud a mano para proteger a los estudiantes. Te escribiremos al correo de contacto cuando tu cuenta esté activa.</p>
        </header>
        {error && <div className="alerta alerta-error" role="alert">{error}</div>}

        <form className="form-card" onSubmit={enviar} noValidate>
          <fieldset>
            <legend><span className="paso">1</span> RUC de la empresa</legend>
            <div className="fila">
              <input aria-label="RUC" inputMode="numeric" value={ruc} placeholder="11 dígitos" onChange={(e) => { setRuc(soloDigitos(e.target.value, 11)); setRucInfo(null); }} />
              <button type="button" className="btn btn-dark" onClick={consultarRuc} disabled={consultando}>{consultando ? <Spinner /> : "Consultar en SUNAT"}</button>
            </div>
            {rucInfo && <p className={rucInfo.tipo === "error" ? "txt-bad small" : rucInfo.tipo === "ok" ? "txt-ok small" : "muted small"}>{rucInfo.tipo === "ok" && <FiCheck />} {rucInfo.texto}</p>}
          </fieldset>

          {datosVisibles && (
            <>
              <fieldset>
                <legend><span className="paso">2</span> Datos y acceso</legend>
                <div className="grid-2">
                  <Campo label="Nombre comercial" htmlFor="nc"><input id="nc" value={f.nombre_comercial} onChange={set("nombre_comercial")} /></Campo>
                  <Campo label="Sector o actividad" htmlFor="sec"><input id="sec" value={f.sector} onChange={set("sector")} placeholder="Tecnología, minería, retail…" /></Campo>
                  <Campo label="Correo de contacto" htmlFor="mail" ayuda="Con este correo iniciarás sesión."><input id="mail" type="email" value={f.correo_contacto} onChange={set("correo_contacto")} autoComplete="email" /></Campo>
                  <Campo label="Teléfono" htmlFor="tel"><input id="tel" inputMode="tel" value={f.telefono} onChange={(e) => setF((x) => ({ ...x, telefono: soloDigitos(e.target.value, 9) }))} placeholder="987654321" /></Campo>
                </div>
                <Campo label="Dirección fiscal u oficina" htmlFor="dir"><input id="dir" value={f.direccion} onChange={set("direccion")} /></Campo>
                <div className="grid-2">
                  <Campo label="Contraseña" htmlFor="pw" ayuda="Mínimo 8 caracteres."><input id="pw" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></Campo>
                  <Campo label="Repite la contraseña" htmlFor="pw2"><input id="pw2" type="password" value={f.password_confirm} onChange={set("password_confirm")} autoComplete="new-password" /></Campo>
                </div>
                <input className="hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} aria-hidden name="website_url" />
              </fieldset>

              <fieldset>
                <legend><span className="paso">3</span> Documentos</legend>
                <div className="grid-2">
                  <div><p className="campo-label-txt">Logo</p><ArchivoDrop id="logo" accept="image/*" archivo={logo} onChange={setLogo} titulo="Logo de la empresa" ayuda="PNG o JPG, hasta 3 MB" /></div>
                  <div><p className="campo-label-txt">Ficha RUC</p><ArchivoDrop id="ficha" accept="application/pdf" archivo={ficha} onChange={setFicha} titulo="Ficha RUC" ayuda="PDF, hasta 8 MB" /></div>
                  <div><p className="campo-label-txt">DNI del representante (frente)</p><ArchivoDrop id="dnif" accept="image/*,application/pdf" archivo={dniF} onChange={setDniF} titulo="Frente del DNI" ayuda="Imagen o PDF" /></div>
                  <div><p className="campo-label-txt">DNI del representante (reverso)</p><ArchivoDrop id="dnir" accept="image/*,application/pdf" archivo={dniR} onChange={setDniR} titulo="Reverso del DNI" ayuda="Imagen o PDF" /></div>
                </div>
              </fieldset>

              <fieldset>
                <legend><span className="paso">4</span> Selfie de verificación</legend>
                <p className="muted small">Mira a la cámara con buena luz. La usamos solo para comparar con el DNI.</p>
                <CapturaSelfie onCaptura={setSelfie} />
              </fieldset>

              <label className="check">
                <input type="checkbox" checked={acepta} onChange={(e) => (e.target.checked ? setVerTerminos(true) : setAcepta(false))} />
                <span>He leído y acepto los <button type="button" className="btn-link-inline" onClick={() => setVerTerminos(true)}>términos y condiciones</button>.</span>
              </label>

              <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
                {enviando ? <><Spinner /> Enviando solicitud…</> : "Enviar solicitud de registro"}
              </button>
            </>
          )}
        </form>
      </div>

      {verTerminos && (
        <Modal
          titulo="Términos y condiciones"
          onClose={() => setVerTerminos(false)}
          pie={<>
            <button className="btn btn-ghost" onClick={() => setVerTerminos(false)}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { setAcepta(true); setVerTerminos(false); }}>Acepto</button>
          </>}
        >
          <p className="texto-largo">{config.terminos_condiciones || "Acepto el tratamiento de mis datos para la verificación de la empresa."}</p>
        </Modal>
      )}
    </PublicLayout>
  );
}
