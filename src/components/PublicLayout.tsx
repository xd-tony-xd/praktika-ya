import { useState, type ReactNode } from "react";
import { FiFacebook, FiInstagram, FiLinkedin, FiMenu, FiTwitter, FiX } from "react-icons/fi";
import { Link } from "../lib/router";
import { useConfig } from "../lib/config";
import { useAuth } from "../lib/auth";
import { ChatBot } from "./ChatBot";
import { Logo } from "./ui";

export function PublicLayout({ children, chat = true }: { children: ReactNode; chat?: boolean }) {
  const { config } = useConfig();
  const { session } = useAuth();
  const [menu, setMenu] = useState(false);
  const redes = [
    { url: config.facebook_url, icon: FiFacebook, nombre: "Facebook" },
    { url: config.instagram_url, icon: FiInstagram, nombre: "Instagram" },
    { url: config.linkedin_url, icon: FiLinkedin, nombre: "LinkedIn" },
    { url: config.twitter_url, icon: FiTwitter, nombre: "X" },
  ].filter((r) => r.url);

  return (
    <div className="pub">
      <header className="pub-nav">
        <div className="wrap pub-nav-in">
          <Logo />
          <nav className={`pub-links ${menu ? "abierto" : ""}`} aria-label="Principal">
            <Link to="/" onClick={() => setMenu(false)}>Vacantes</Link>
            <Link to="/#como-funciona" onClick={() => setMenu(false)}>Cómo funciona</Link>
            {session ? (
              <Link to="/panel" className="btn btn-primary btn-sm" onClick={() => setMenu(false)}>Ir a mi panel</Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenu(false)}>Iniciar sesión</Link>
                <Link to="/registro-empresa" className="btn btn-primary btn-sm" onClick={() => setMenu(false)}>Publicar convocatoria</Link>
              </>
            )}
          </nav>
          <button className="icon-btn pub-burger" onClick={() => setMenu((v) => !v)} aria-label={menu ? "Cerrar menú" : "Abrir menú"} aria-expanded={menu}>
            {menu ? <FiX /> : <FiMenu />}
          </button>
        </div>
      </header>
      <main id="contenido">{children}</main>
      <footer className="pub-foot">
        <div className="wrap pub-foot-in">
          <div className="pub-foot-marca">
            <Logo claro />
            <p>{config.footer_descripcion || "Conectamos a estudiantes con empresas que apuestan por el talento joven."}</p>
            {config.mision_sitio && <p className="pub-foot-mision">{config.mision_sitio}</p>}
          </div>
          <div>
            <h4>Estudiantes</h4>
            <Link to="/">Ver vacantes</Link>
            <Link to="/#como-funciona">Cómo se evalúa tu CV</Link>
          </div>
          <div>
            <h4>Empresas</h4>
            <Link to="/registro-empresa">Registrar empresa</Link>
            <Link to="/login">Iniciar sesión</Link>
          </div>
          <div>
            <h4>Contacto</h4>
            {config.email_contacto && <a href={`mailto:${config.email_contacto}`}>{config.email_contacto}</a>}
            {config.telefono_contacto && <a href={`tel:${config.telefono_contacto}`}>{config.telefono_contacto}</a>}
            {redes.length > 0 && (
              <div className="redes">
                {redes.map((r) => (
                  <a key={r.nombre} href={r.url} target="_blank" rel="noreferrer" aria-label={r.nombre}><r.icon /></a>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="wrap pub-foot-legal">© {new Date().getFullYear()} {config.nombre_sitio || "Práctika ya"}</div>
      </footer>
      {chat && <ChatBot />}
    </div>
  );
}
