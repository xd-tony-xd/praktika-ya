import { useEffect, useState, type FormEvent } from "react";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import { PublicLayout } from "../../components/PublicLayout";
import { ArchivoDrop, Campo, Cargando, Spinner, Vacio } from "../../components/ui";
import { CvVoz } from "../../components/CvVoz";
import { Link, navigate } from "../../lib/router";
import { callFn, errorMsg, supabase } from "../../lib/supabase";
import { useConfig } from "../../lib/config";
import { soloDigitos } from "../../lib/format";
import type { VacantePublica, VozDatos } from "../../lib/types";

export default function Postular({ id }: { id: string }) {
  const { config } = useConfig();
  const [v, setV] = useState<VacantePublica | null | undefined>(undefined);
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [correo, setCorreo] = useState("");
  const [cv, setCv] = useState<File | null>(null);
  const [voz, setVoz] = useState<VozDatos | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [website, setWebsite] = useState("");
  const [dniEstado, setDniEstado] = useState<{ tipo: "ok" | "error" | "info" | "cargando"; texto: string } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState("");

  const dominios = (config.dominios_correo_estudiante || ".edu.pe").split(",").map((d) => d.trim()).filter(Boolean);

  useEffect(() => {
    void supabase.from("vacantes_publicas").select("*").eq("id", Number(id)).maybeSingle().then(({ data }) => setV((data as VacantePublica) ?? null));
  }, [id]);

  const validarDni = async (valor = dni) => {
    if (valor.length !== 8) return setDniEstado({ tipo: "error", texto: "El DNI debe tener 8 dígitos." });
    setDniEstado({ tipo: "cargando", texto: "Consultando RENIEC…" });
    try {
      const r = await callFn<{ success: boolean; data?: { nombre_completo: string }; error?: string; no_configurado?: boolean }>("consultar-documento", { tipo: "dni", numero: valor });
      if (r.success && r.data?.nombre_completo) {
        setNombre(r.data.nombre_completo);
        setDniEstado({ tipo: "ok", texto: "Identidad verificada" });
      } else if (r.no_configurado) {
        setDniEstado({ tipo: "info", texto: "Escribe tu nombre tal como aparece en tu DNI." });
      } else {
        setDniEstado({ tipo: "error", texto: "No encontramos ese DNI. Revisa el número o escribe tu nombre." });
      }
    } catch (e) {
      setDniEstado({ tipo: "info", texto: `${errorMsg(e)} Puedes escribir tu nombre manualmente.` });
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral("");
    const err: Record<string, string> = {};
    if (!/^\d{8}$/.test(dni)) err.dni = "El DNI debe tener 8 dígitos.";
    if (nombre.trim().length < 3) err.nombre = "Escribe tu nombre completo.";
    if (!/^\d{9}$/.test(celular)) err.celular = "El celular debe tener 9 dígitos.";
    const c = correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) err.correo = "Escribe un correo válido.";
    else if (dominios.length && !dominios.some((d) => c.endsWith(d.toLowerCase()))) err.correo = `Usa tu correo institucional (${dominios.join(", ")}).`;
    if (!cv) err.cv = "Adjunta tu CV en PDF.";
    else if (cv.type && cv.type !== "application/pdf") err.cv = "El CV debe ser un archivo PDF.";
    else if (cv.size > 5 * 1024 * 1024) err.cv = "El CV pesa más de 5 MB. Comprímelo e inténtalo otra vez.";
    if (!acepta) err.acepta = "Necesitamos tu autorización para procesar tu postulación.";
    setErrores(err);
    if (Object.keys(err).length) return;

    const fd = new FormData();
    fd.append("vacante_id", id);
    fd.append("dni", dni);
    fd.append("nombre_completo", nombre.trim());
    fd.append("celular", celular);
    fd.append("correo_estudiante", c);
    fd.append("acepta_terminos", "1");
    fd.append("website", website);
    fd.append("cv", cv!);
    if (voz) fd.append("voz", JSON.stringify(voz));
    setEnviando(true);
    try {
      await callFn("postular", fd);
      navigate(`/vacante/${id}?postulado=1`);
    } catch (e2) {
      setErrorGeneral(errorMsg(e2));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setEnviando(false);
    }
  };

  if (v === undefined) return <PublicLayout><Cargando /></PublicLayout>;
  if (!v || !v.vigente) {
    return (
      <PublicLayout>
        <div className="wrap pagina-simple">
          <Vacio titulo="Esta convocatoria ya no recibe postulaciones" accion={<Link to="/" className="btn btn-primary">Ver vacantes abiertas</Link>} />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout chat={false}>
      <div className="wrap form-pagina">
        <Link to={`/vacante/${id}`} className="volver"><FiArrowLeft /> Volver a la vacante</Link>
        <header className="form-head">
          <p className="muted">{v.nombre_comercial}</p>
          <h1>Postular a {v.titulo_puesto}</h1>
          <p className="muted">Tu CV se compara con los requisitos del puesto. La empresa ve tu puntaje y tú también puedes consultarlo.</p>
        </header>
        {errorGeneral && <div className="alerta alerta-error" role="alert">{errorGeneral}</div>}

        <form className="form-card" onSubmit={enviar} noValidate>
          <fieldset>
            <legend>Tus datos</legend>
            <Campo label="DNI" htmlFor="dni" error={errores.dni} ayuda={dniEstado && dniEstado.tipo !== "error" ? (
              <span className={dniEstado.tipo === "ok" ? "txt-ok" : ""}>{dniEstado.tipo === "cargando" ? <Spinner /> : dniEstado.tipo === "ok" ? <FiCheck /> : null} {dniEstado.texto}</span>
            ) : undefined}>
              <div className="fila">
                <input
                  id="dni" inputMode="numeric" autoComplete="off" value={dni} placeholder="8 dígitos"
                  onChange={(e) => {
                    const val = soloDigitos(e.target.value, 8);
                    setDni(val);
                    setDniEstado(null);
                    if (val.length === 8) void validarDni(val);
                  }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => void validarDni()}>Validar DNI</button>
              </div>
              {dniEstado?.tipo === "error" && <small className="campo-msg">{dniEstado.texto}</small>}
            </Campo>
            <div className="grid-2">
              <Campo label="Nombre completo" htmlFor="nombre" error={errores.nombre}>
                <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
              </Campo>
              <Campo label="Celular" htmlFor="celular" error={errores.celular}>
                <input id="celular" inputMode="tel" value={celular} onChange={(e) => setCelular(soloDigitos(e.target.value, 9))} placeholder="987654321" autoComplete="tel" />
              </Campo>
            </div>
            <Campo label="Correo institucional" htmlFor="correo" error={errores.correo} ayuda={`Debe terminar en ${dominios.join(" o ")}`}>
              <input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder={`usuario@universidad${dominios[0] ?? ".edu.pe"}`} autoComplete="email" />
            </Campo>
            <input className="hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden name="website" />
          </fieldset>

          <fieldset>
            <legend>Tu CV</legend>
            <ArchivoDrop id="cv" accept="application/pdf,.pdf" archivo={cv} onChange={setCv} titulo="Arrastra tu CV aquí" ayuda="Solo PDF, hasta 5 MB" />
            {errores.cv && <small className="campo-msg">{errores.cv}</small>}
          </fieldset>

          <fieldset>
            <legend>Presentación por voz <span className="muted">(opcional)</span></legend>
            <CvVoz valor={voz} onChange={setVoz} />
          </fieldset>

          <label className={`check ${errores.acepta ? "check-error" : ""}`}>
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
            <span>{config.terminos_postulante || "Autorizo el tratamiento de mis datos personales y el análisis automatizado de mi CV para este proceso de selección."}</span>
          </label>
          {errores.acepta && <small className="campo-msg">{errores.acepta}</small>}

          <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
            {enviando ? <><Spinner /> Enviando postulación…</> : "Enviar postulación"}
          </button>
        </form>
      </div>
    </PublicLayout>
  );
}
