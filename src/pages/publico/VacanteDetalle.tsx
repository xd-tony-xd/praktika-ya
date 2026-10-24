import { useEffect, useState, type FormEvent } from "react";
import { FiArrowLeft, FiCalendar, FiMapPin } from "react-icons/fi";
import { PublicLayout } from "../../components/PublicLayout";
import { Avatar, Cargando, EstadoBadge, MatchDial, SelloStamp, Spinner, Vacio } from "../../components/ui";
import { Link, useLocation } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { fecha, soloDigitos, textoCierre } from "../../lib/format";
import type { EstadoPostulacion, VacantePublica } from "../../lib/types";

interface Resultado { nombre: string; match: number; estado: EstadoPostulacion; analisis: string | null }

export default function VacanteDetalle({ id }: { id: string }) {
  const { query } = useLocation();
  const [v, setV] = useState<VacantePublica | null | undefined>(undefined);
  const [dni, setDni] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [errorRes, setErrorRes] = useState("");
  const recienPostulo = query.get("postulado") === "1";

  useEffect(() => {
    void supabase.from("vacantes_publicas").select("*").eq("id", Number(id)).maybeSingle().then(({ data }) => {
      setV((data as VacantePublica) ?? null);
      if (data) document.title = `${(data as VacantePublica).titulo_puesto} · ${(data as VacantePublica).nombre_comercial}`;
    });
  }, [id]);

  const consultar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorRes("");
    setResultado(null);
    if (dni.length !== 8) return setErrorRes("Ingresa los 8 dígitos de tu DNI.");
    setConsultando(true);
    const { data, error } = await supabase.rpc("consultar_resultado", { p_dni: dni, p_vacante_id: Number(id) });
    setConsultando(false);
    if (error) return setErrorRes("No pudimos consultar ahora. Intenta en unos minutos.");
    if (!data) return setErrorRes("No hay una postulación con ese DNI para esta vacante.");
    setResultado(data as Resultado);
  };

  if (v === undefined) return <PublicLayout><Cargando /></PublicLayout>;
  if (v === null) {
    return (
      <PublicLayout>
        <div className="wrap pagina-simple">
          <Vacio titulo="Esta vacante no existe o ya no está publicada" accion={<Link to="/" className="btn btn-primary">Ver vacantes abiertas</Link>} />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="wrap detalle">
        <Link to="/" className="volver"><FiArrowLeft /> Todas las vacantes</Link>
        {recienPostulo && (
          <div className="alerta alerta-ok" role="status">
            <strong>¡Postulación enviada!</strong> La empresa analizará tu CV. Vuelve a esta página y consulta tu resultado con tu DNI.
          </div>
        )}
        <div className="detalle-grid">
          <article className="detalle-main">
            <header className="detalle-head">
              <Avatar src={v.foto_perfil} nombre={v.nombre_comercial} size={64} />
              <div>
                <p className="detalle-empresa">{v.nombre_comercial}{v.sector && v.sector !== "GENERAL" ? <span className="muted"> — {v.sector}</span> : null}</p>
                <h1>{v.titulo_puesto}</h1>
                <div className="ticket-meta">
                  <span className="chip">{v.modalidad}</span>
                  {v.ubicacion && <span className="ticket-lugar"><FiMapPin /> {v.ubicacion}</span>}
                  <span className="ticket-lugar"><FiCalendar /> Publicada el {fecha(v.fecha_publicacion)}</span>
                </div>
              </div>
            </header>
            {v.carreras.length > 0 && (
              <div className="detalle-carreras">
                {v.carreras.map((c) => <span key={c.id} className="chip chip-suave">{c.nombre}</span>)}
              </div>
            )}
            <section>
              <h2>Sobre el puesto</h2>
              <p className="texto-largo">{v.descripcion_puesto}</p>
            </section>
            <section>
              <h2>Requisitos</h2>
              <p className="texto-largo">{v.requisitos_raw}</p>
            </section>
          </article>

          <aside className="detalle-side">
            <div className="caja caja-cta">
              {v.vigente ? (
                <>
                  <p className="cta-cierre">{textoCierre(v.fecha_limite)}{v.fecha_limite ? ` (${fecha(v.fecha_limite)})` : ""}</p>
                  <Link to={`/vacante/${v.id}/postular`} className="btn btn-primary btn-block btn-lg">Postular a esta vacante</Link>
                  <p className="muted small">Gratis y sin crear cuenta. Necesitas tu DNI, correo institucional y CV en PDF.</p>
                </>
              ) : (
                <>
                  <p className="cta-cierre">Esta convocatoria está cerrada</p>
                  <Link to="/" className="btn btn-ghost btn-block">Ver vacantes abiertas</Link>
                </>
              )}
            </div>

            <form className="caja" onSubmit={consultar}>
              <h3>Consulta tu resultado</h3>
              <p className="muted small">Si ya postulaste, ingresa tu DNI para ver tu compatibilidad con esta vacante.</p>
              <div className="fila">
                <input inputMode="numeric" value={dni} onChange={(e) => setDni(soloDigitos(e.target.value, 8))} placeholder="DNI (8 dígitos)" aria-label="DNI" />
                <button className="btn btn-dark" disabled={consultando}>{consultando ? <Spinner /> : "Consultar"}</button>
              </div>
              {errorRes && <p className="txt-bad small">{errorRes}</p>}
              {resultado && (
                <div className="resultado">
                  {resultado.estado === "en_espera" ? (
                    <p><strong>{resultado.nombre}</strong>, tu CV fue recibido y está en espera de análisis por la empresa.</p>
                  ) : (
                    <>
                      <div className="resultado-top">
                        <MatchDial valor={Number(resultado.match)} size={84} />
                        <div>
                          <strong>{resultado.nombre}</strong>
                          <EstadoBadge estado={resultado.estado} />
                        </div>
                      </div>
                      {resultado.analisis && <p className="texto-largo small">{resultado.analisis}</p>}
                    </>
                  )}
                </div>
              )}
            </form>

            {v.sello_vigente && (
              <Link to={`/sello/${v.empresa_id}`} className="caja caja-sello">
                <SelloStamp size={72} />
                <div>
                  <strong>Selección transparente</strong>
                  <p className="small">Esta empresa evalúa sin sesgos y responde a sus postulantes. Ver verificación.</p>
                </div>
              </Link>
            )}
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
