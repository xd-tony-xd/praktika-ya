import { useEffect, useState } from "react";
import { FiCheckCircle, FiCircle } from "react-icons/fi";
import { PublicLayout } from "../../components/PublicLayout";
import { Avatar, Cargando, Logo, SelloStamp, Vacio } from "../../components/ui";
import { Link } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { useConfig } from "../../lib/config";
import { CRITERIOS_SELLO, fechaHora } from "../../lib/format";
import type { SelloPublico } from "../../lib/types";

/** Página pública de verificación del sello (equivale a GET /sello/{company_id}). */
export function SelloVerificacion({ id }: { id: string }) {
  const [s, setS] = useState<SelloPublico | null | undefined>(undefined);
  useEffect(() => {
    void supabase.rpc("consultar_sello", { p_empresa_id: Number(id) }).then(({ data }) => setS((data as SelloPublico) ?? null));
  }, [id]);

  if (s === undefined) return <PublicLayout><Cargando /></PublicLayout>;
  if (!s) return <PublicLayout><div className="wrap pagina-simple"><Vacio titulo="No encontramos esa empresa" accion={<Link to="/" className="btn btn-primary">Ir al inicio</Link>} /></div></PublicLayout>;

  const todos = Object.keys(CRITERIOS_SELLO);
  return (
    <PublicLayout>
      <div className="wrap sello-pub">
        <header className="sello-pub-head">
          <SelloStamp size={150} vigente={s.sello_vigente} />
          <div>
            <div className="fila">
              <Avatar src={s.foto_perfil} nombre={s.empresa} size={40} />
              <p className="detalle-empresa">{s.empresa} <span className="muted">RUC {s.ruc}</span></p>
            </div>
            <h1>{s.sello_vigente ? "Sello de selección transparente vigente" : s.emitido_en ? "Sello no vigente" : "Aún sin evaluación"}</h1>
            <p className="muted">
              {s.emitido_en
                ? `Última evaluación: ${fechaHora(s.emitido_en)}. El sello dura 90 días y se recalcula con datos reales del proceso de selección.`
                : "Esta empresa todavía no solicitó la evaluación del sello."}
            </p>
          </div>
        </header>
        {s.emitido_en && (
          <>
            <ul className="criterios">
              {todos.map((k) => {
                const ok = s.criterios_cumplidos.includes(k);
                return (
                  <li key={k} className={ok ? "ok" : ""}>
                    {ok ? <FiCheckCircle aria-label="Cumple" /> : <FiCircle aria-label="Pendiente" />}
                    <div><strong>{CRITERIOS_SELLO[k].titulo}</strong><p>{CRITERIOS_SELLO[k].detalle}</p></div>
                  </li>
                );
              })}
            </ul>
            <section className="huella">
              <h2>Huella de verificación</h2>
              <p className="muted small">Cada evaluación se guarda con un hash SHA-256 que incluye el hash anterior, así nadie puede alterar el historial sin que se note.</p>
              <code>{s.huella}</code>
              {s.historial.length > 1 && (
                <table className="tabla tabla-compacta">
                  <thead><tr><th>Fecha</th><th>Resultado</th><th>Huella</th></tr></thead>
                  <tbody>
                    {s.historial.map((h) => (
                      <tr key={h.huella}><td>{fechaHora(h.emitido_en)}</td><td>{h.sello_otorgado ? "Otorgado" : "No otorgado"}</td><td><code>{h.huella.slice(0, 16)}…</code></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </PublicLayout>
  );
}

export function Mantenimiento() {
  const { config } = useConfig();
  return (
    <div className="acceso acceso-solo">
      <div className="acceso-form centro">
        <Logo />
        <h1>Volvemos pronto</h1>
        <p className="muted">{config.mantenimiento_msg || "Estamos realizando mejoras en la plataforma."}</p>
        <Link to="/login" className="btn btn-ghost">Acceso de administradores</Link>
      </div>
    </div>
  );
}

export function NoEncontrado() {
  return (
    <PublicLayout>
      <div className="wrap pagina-simple">
        <Vacio titulo="Esta página no existe" texto="Puede que el enlace esté mal escrito o que la página se haya movido." accion={<Link to="/" className="btn btn-primary">Ver vacantes</Link>} />
      </div>
    </PublicLayout>
  );
}

export function FaltaConfiguracion() {
  return (
    <div className="acceso acceso-solo">
      <div className="acceso-form">
        <Logo />
        <h1>Falta conectar Supabase</h1>
        <p className="muted">Crea el archivo <code>.env</code> (o las variables en Vercel/Netlify) con:</p>
        <pre className="codigo">VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=tu_anon_key</pre>
        <p className="muted small">Luego vuelve a compilar el sitio. Las instrucciones completas están en el README.</p>
      </div>
    </div>
  );
}
