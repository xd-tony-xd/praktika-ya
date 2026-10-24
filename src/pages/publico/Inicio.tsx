import { useEffect, useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { PublicLayout } from "../../components/PublicLayout";
import { VacanteTicket } from "../../components/VacanteTicket";
import { Cargando, SelloStamp, Vacio } from "../../components/ui";
import { setQuery, useLocation, Link } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { diasRestantes } from "../../lib/format";
import type { Carrera, VacantePublica } from "../../lib/types";

const MODALIDADES = ["Remoto", "Híbrido", "Presencial"] as const;

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Inicio() {
  const { query } = useLocation();
  const q = query.get("q") ?? "";
  const modalidad = query.get("modalidad") ?? "";
  const carrera = query.get("carrera") ?? "";
  const [busqueda, setBusqueda] = useState(q);
  const [vacantes, setVacantes] = useState<VacantePublica[] | null>(null);
  const [carreras, setCarreras] = useState<Carrera[]>([]);

  useEffect(() => {
    document.title = "Práctika ya · Prácticas preprofesionales en Perú";
    void (async () => {
      const [v, c] = await Promise.all([
        supabase.from("vacantes_publicas").select("*").eq("vigente", true).order("fecha_publicacion", { ascending: false }).limit(500),
        supabase.from("carreras").select("id,nombre").order("nombre"),
      ]);
      setVacantes((v.data as VacantePublica[]) ?? []);
      setCarreras((c.data as Carrera[]) ?? []);
    })();
  }, []);

  useEffect(() => setBusqueda(q), [q]);

  const filtradas = useMemo(() => {
    if (!vacantes) return [];
    const nq = normalizar(q);
    return vacantes.filter((v) =>
      (!nq || normalizar(`${v.titulo_puesto} ${v.nombre_comercial} ${v.descripcion_puesto}`).includes(nq)) &&
      (!modalidad || v.modalidad === modalidad) &&
      (!carrera || v.carrera_ids.includes(Number(carrera))));
  }, [vacantes, q, modalidad, carrera]);

  const conteo = useMemo(() => {
    const c: Record<string, number> = { Remoto: 0, Híbrido: 0, Presencial: 0 };
    for (const v of vacantes ?? []) c[v.modalidad] = (c[v.modalidad] ?? 0) + 1;
    return c;
  }, [vacantes]);

  const cierranPronto = useMemo(
    () => (vacantes ?? [])
      .filter((v) => (diasRestantes(v.fecha_limite) ?? 999) <= 14)
      .sort((a, b) => (diasRestantes(a.fecha_limite) ?? 0) - (diasRestantes(b.fecha_limite) ?? 0))
      .slice(0, 3),
    [vacantes],
  );

  return (
    <PublicLayout>
      <section className="hero">
        <div className="wrap hero-in">
          <div className="hero-txt">
            <h1>Tu primera práctica empieza aquí.</h1>
            <p className="hero-sub">Postula gratis a empresas de todo el Perú. Una IA compara tu CV con lo que pide el puesto y te muestra tu puntaje.</p>
            <form
              className="buscador"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery({ q: busqueda.trim() || null });
                document.getElementById("vacantes")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <FiSearch aria-hidden />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Puesto, empresa o tema" aria-label="Buscar vacantes" />
              <button className="btn btn-primary">Buscar</button>
            </form>
            <p className="hero-total">
              {vacantes === null ? "Cargando vacantes…" : `${vacantes.length} ${vacantes.length === 1 ? "vacante abierta" : "vacantes abiertas"} ahora`}
            </p>
          </div>
          <aside className="hero-board" aria-label="Cierran pronto">
            <h2>Cierran pronto</h2>
            {cierranPronto.length ? (
              <ul>
                {cierranPronto.map((v) => {
                  const d = diasRestantes(v.fecha_limite) ?? 0;
                  return (
                    <li key={v.id}>
                      <Link to={`/vacante/${v.id}`}>
                        <span className="board-dias">{d === 0 ? "Hoy" : `${d} d`}</span>
                        <span className="board-txt">
                          <strong>{v.titulo_puesto}</strong>
                          <small>{v.nombre_comercial}</small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <img src="/img/hero.svg" alt="" className="hero-ilus" />
            )}
          </aside>
        </div>
      </section>

      <section className="wrap vacantes" id="vacantes">
        <div className="filtros">
          <div className="segmentos" role="group" aria-label="Modalidad">
            <button className={!modalidad ? "activo" : ""} onClick={() => setQuery({ modalidad: null })}>Todas</button>
            {MODALIDADES.map((m) => (
              <button key={m} className={modalidad === m ? "activo" : ""} onClick={() => setQuery({ modalidad: m })}>
                {m} <span>{conteo[m] ?? 0}</span>
              </button>
            ))}
          </div>
          <select value={carrera} onChange={(e) => setQuery({ carrera: e.target.value || null })} aria-label="Filtrar por carrera">
            <option value="">Todas las carreras</option>
            {carreras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        {vacantes === null ? (
          <Cargando texto="Buscando vacantes…" />
        ) : filtradas.length === 0 ? (
          <Vacio
            titulo="No hay vacantes con esos filtros"
            texto="Prueba otra palabra o quita algún filtro. Se publican convocatorias nuevas cada semana."
            accion={(q || modalidad || carrera) && <button className="btn btn-ghost" onClick={() => setQuery({ q: null, modalidad: null, carrera: null })}>Quitar filtros</button>}
          />
        ) : (
          <div className="tickets">{filtradas.map((v) => <VacanteTicket key={v.id} v={v} />)}</div>
        )}
      </section>

      <section className="como" id="como-funciona">
        <div className="wrap">
          <h2>Cómo funciona para estudiantes</h2>
          <ol className="pasos">
            <li><strong>Elige una vacante</strong><p>Filtra por carrera o modalidad. No necesitas crear cuenta.</p></li>
            <li><strong>Envía tu CV</strong><p>Valida tu DNI, usa tu correo institucional y sube tu CV en PDF. Si quieres, agrega una presentación por voz.</p></li>
            <li><strong>La IA te evalúa</strong><p>Compara tu perfil con los requisitos del puesto y calcula tu compatibilidad.</p></li>
            <li><strong>Consulta tu resultado</strong><p>Ingresa tu DNI en la página de la vacante para ver tu puntaje y la retroalimentación.</p></li>
          </ol>
          <div className="como-sello">
            <SelloStamp size={112} />
            <div>
              <h3>Empresas con selección transparente</h3>
              <p>Las vacantes con este sello son de empresas que publican requisitos verificables, evalúan sin ver tu nombre, edad ni foto, y responden a la mayoría de sus postulantes. Cada sello queda registrado con una huella digital que cualquiera puede verificar.</p>
              <Link to="/registro-empresa" className="btn btn-ghost">Soy empresa, quiero publicar</Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
