import { useEffect, useRef, useState, type ReactNode } from "react";
import { FiUploadCloud, FiX } from "react-icons/fi";
import { Link } from "../lib/router";
import { useConfig } from "../lib/config";
import { colorMatch, estadoLabel, iniciales } from "../lib/format";
import type { EstadoPostulacion } from "../lib/types";

export function Logo({ claro = false, to = "/" }: { claro?: boolean; to?: string }) {
  const { config } = useConfig();
  const nombre = config.nombre_sitio || "Práctika ya";
  const logo = config.logo_sitio;
  const partes = nombre.match(/^(.*?)(\s+ya)$/i);
  return (
    <Link to={to} className={`logo ${claro ? "logo-claro" : ""}`} aria-label={`${nombre}, inicio`}>
      <img src={logo || "/img/logo-icon.svg"} alt="" width={36} height={36} />
      <span>
        {partes ? (
          <>
            {partes[1]} <em>{partes[2].trim()}</em>
          </>
        ) : (
          nombre
        )}
      </span>
    </Link>
  );
}

export function Spinner({ grande = false }: { grande?: boolean }) {
  return <span className={`spinner ${grande ? "spinner-lg" : ""}`} aria-label="Cargando" />;
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="cargando">
      <Spinner grande />
      <p className="muted">{texto}</p>
    </div>
  );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="vacio">
      <h3>{titulo}</h3>
      {texto && <p className="muted">{texto}</p>}
      {accion}
    </div>
  );
}

export function Modal({ titulo, onClose, children, ancho = "md", pie }: {
  titulo: ReactNode;
  onClose: () => void;
  children: ReactNode;
  ancho?: "sm" | "md" | "lg";
  pie?: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.classList.add("no-scroll");
    return () => {
      window.removeEventListener("keydown", k);
      document.body.classList.remove("no-scroll");
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`dialog dialog-${ancho}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dialog-head">
          <h3>{titulo}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <FiX />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {pie && <footer className="dialog-actions">{pie}</footer>}
      </div>
    </div>
  );
}

export function Campo({ label, ayuda, error, children, htmlFor }: { label: string; ayuda?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={`campo ${error ? "campo-error" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <small className="campo-msg">{error}</small> : ayuda ? <small className="muted">{ayuda}</small> : null}
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: EstadoPostulacion }) {
  const cls = estado === "Apto" ? "badge-ok" : estado === "No Apto" ? "badge-bad" : "badge-wait";
  return <span className={`badge ${cls}`}>{estadoLabel[estado]}</span>;
}

/** Medidor circular del puntaje IA — el elemento distintivo del sistema. */
export function MatchDial({ valor, size = 64, etiqueta }: { valor: number | null; size?: number; etiqueta?: string }) {
  const pct = valor === null ? 0 : Math.max(0, Math.min(100, Math.round(valor)));
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = valor === null ? "var(--line)" : colorMatch(pct);
  return (
    <div className="dial" style={{ width: size, height: size }} role="img" aria-label={valor === null ? "Sin analizar" : `Compatibilidad ${pct}%`}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <span className="dial-num" style={{ fontSize: size * 0.27 }}>
        {valor === null ? "—" : pct}
        {valor !== null && <small>%</small>}
      </span>
      {etiqueta && <span className="dial-label">{etiqueta}</span>}
    </div>
  );
}

/** Sello de transparencia (estampa dorada). */
export function SelloStamp({ size = 88, vigente = true }: { size?: number; vigente?: boolean }) {
  return (
    <svg className={`stamp ${vigente ? "" : "stamp-off"}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={vigente ? "Sello de transparencia vigente" : "Sin sello de transparencia"}>
      <defs>
        <path id="stamp-arc" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="var(--seal-bg)" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--seal)" strokeWidth="2" strokeDasharray="3 4" />
      <text fontSize="10.5" fontWeight="700" letterSpacing="2.2" fill="var(--seal-ink)">
        <textPath href="#stamp-arc">SELECCIÓN TRANSPARENTE · PRÁCTIKA YA ·</textPath>
      </text>
      <circle cx="60" cy="60" r="30" fill="var(--seal)" />
      <path d="M46 61l9 9 19-21" fill="none" stroke="var(--seal-ink)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SelloChip() {
  return (
    <span className="sello-chip" title="Sello de transparencia vigente">
      <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden><circle cx="10" cy="10" r="10" fill="var(--seal)" /><path d="M5.5 10.5l3 3 6-7" fill="none" stroke="var(--seal-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Selección transparente
    </span>
  );
}

export function Avatar({ src, nombre, size = 44, cuadrado = true }: { src?: string | null; nombre: string; size?: number; cuadrado?: boolean }) {
  const [err, setErr] = useState(false);
  const style = { width: size, height: size, borderRadius: cuadrado ? size * 0.28 : "50%", fontSize: size * 0.36 };
  if (src && !err) return <img className="avatar" src={src} alt="" style={style} onError={() => setErr(true)} />;
  return <span className="avatar avatar-txt" style={style} aria-hidden>{iniciales(nombre) || "?"}</span>;
}

export function ArchivoDrop({ accept, archivo, onChange, titulo, ayuda, id }: {
  accept: string;
  archivo: File | null;
  onChange: (f: File | null) => void;
  titulo: string;
  ayuda?: string;
  id: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  return (
    <div
      className={`drop ${sobre ? "drop-over" : ""} ${archivo ? "drop-ok" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
    >
      <input ref={ref} id={id} type="file" accept={accept} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <FiUploadCloud aria-hidden className="drop-icon" />
      <div>
        <strong>{archivo ? archivo.name : titulo}</strong>
        <small className="muted">{archivo ? `${(archivo.size / 1024 / 1024).toFixed(2)} MB` : ayuda}</small>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => ref.current?.click()}>
        {archivo ? "Cambiar" : "Elegir archivo"}
      </button>
    </div>
  );
}

export function Stat({ valor, label, nota }: { valor: ReactNode; label: string; nota?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-valor">{valor}</span>
      <span className="stat-label">{label}</span>
      {nota && <span className="stat-nota">{nota}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label className="switch" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden><span /></span>
      <span>{label}</span>
    </label>
  );
}
