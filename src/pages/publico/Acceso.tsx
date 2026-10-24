import { useEffect, useState, type FormEvent } from "react";
import { Campo, Logo, Spinner } from "../../components/ui";
import { Link, navigate, useLocation } from "../../lib/router";
import { errorMsg, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

export function Login() {
  const { query } = useLocation();
  const { recargar } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [aviso, setAviso] = useState(query.get("registro") === "ok"
    ? "Recibimos tu registro. Un administrador revisará tus documentos y te avisaremos por correo cuando tu cuenta esté activa."
    : "");

  useEffect(() => { document.title = "Iniciar sesión · Práctika ya"; }, []);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (err || !data.session) {
      setCargando(false);
      return setError(err?.message?.toLowerCase().includes("invalid") ? "Correo o contraseña incorrectos." : errorMsg(err));
    }
    const uid = data.session.user.id;
    const [{ data: perfil }, { data: emp }] = await Promise.all([
      supabase.from("perfiles").select("rol").eq("id", uid).maybeSingle(),
      supabase.from("empresas").select("estado").eq("user_id", uid).maybeSingle(),
    ]);
    if (perfil?.rol !== "admin") {
      const estado = emp?.estado;
      if (estado !== "aprobado") {
        await supabase.auth.signOut();
        setCargando(false);
        return setError(
          estado === "pendiente" ? "Tu cuenta aún está en revisión. Te avisaremos por correo cuando sea aprobada."
            : estado === "bloqueado" ? "Tu cuenta está bloqueada. Escríbenos si crees que es un error."
              : "Esta cuenta no tiene una empresa asociada.",
        );
      }
    }
    await recargar();
    setCargando(false);
    navigate(query.get("volver") || "/panel", { replace: true });
  };

  const recuperar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Escribe el correo de tu cuenta.");
    setCargando(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/restablecer` });
    setCargando(false);
    if (err) return setError(errorMsg(err));
    setAviso("Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.");
    setModoRecuperar(false);
  };

  return (
    <div className="acceso">
      <div className="acceso-arte" aria-hidden>
        <div>
          <p className="acceso-cita">Publica tu vacante, recibe CVs y ordénalos por compatibilidad en minutos.</p>
          <p className="acceso-firma">Con postulación ciega y sello de transparencia para tu empresa.</p>
        </div>
      </div>
      <div className="acceso-form">
        <Logo />
        <h1>{modoRecuperar ? "Recupera tu contraseña" : "Inicia sesión"}</h1>
        <p className="muted">{modoRecuperar ? "Te enviaremos un enlace a tu correo." : "Para empresas y administradores. Los estudiantes postulan sin cuenta."}</p>
        {aviso && <div className="alerta alerta-info">{aviso}</div>}
        {error && <div className="alerta alerta-error" role="alert">{error}</div>}
        <form onSubmit={modoRecuperar ? recuperar : entrar} className="stack">
          <Campo label="Correo" htmlFor="email">
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Campo>
          {!modoRecuperar && (
            <Campo label="Contraseña" htmlFor="pass">
              <input id="pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
            </Campo>
          )}
          <button className="btn btn-primary btn-block btn-lg" disabled={cargando}>
            {cargando ? <Spinner /> : modoRecuperar ? "Enviar enlace" : "Entrar"}
          </button>
        </form>
        <button className="btn btn-link" onClick={() => { setModoRecuperar((v) => !v); setError(""); }}>
          {modoRecuperar ? "Volver a iniciar sesión" : "Olvidé mi contraseña"}
        </button>
        <p className="acceso-pie">¿Tu empresa aún no tiene cuenta? <Link to="/registro-empresa">Regístrala aquí</Link></p>
      </div>
    </div>
  );
}

export function Restablecer() {
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (pass.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (pass !== pass2) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    const { error: err } = await supabase.auth.updateUser({ password: pass });
    setCargando(false);
    if (err) return setError("El enlace venció o no es válido. Solicita uno nuevo desde «Olvidé mi contraseña».");
    setOk(true);
    await supabase.auth.signOut();
  };

  return (
    <div className="acceso acceso-solo">
      <div className="acceso-form">
        <Logo />
        <h1>Crea una nueva contraseña</h1>
        {ok ? (
          <>
            <div className="alerta alerta-ok">Contraseña actualizada. Ya puedes iniciar sesión.</div>
            <Link to="/login" className="btn btn-primary btn-block">Iniciar sesión</Link>
          </>
        ) : (
          <form onSubmit={guardar} className="stack">
            {error && <div className="alerta alerta-error">{error}</div>}
            <Campo label="Nueva contraseña" htmlFor="p1"><input id="p1" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" /></Campo>
            <Campo label="Repite la contraseña" htmlFor="p2"><input id="p2" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" /></Campo>
            <button className="btn btn-primary btn-block" disabled={cargando}>{cargando ? <Spinner /> : "Guardar contraseña"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
