import { useEffect, useState, type FormEvent } from "react";
import { AppLayout } from "../../components/AppLayout";
import { Avatar, Campo, Spinner } from "../../components/ui";
import { errorMsg, subirImagenPublica, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useAvisos } from "../../lib/avisos";
import { soloDigitos } from "../../lib/format";

export default function PerfilEmpresa() {
  const { empresa, session, recargar } = useAuth();
  const avisos = useAvisos();
  const [f, setF] = useState({ correo_contacto: "", telefono: "", sector: "", direccion: "" });
  const [logo, setLogo] = useState<File | null>(null);
  const [pass, setPass] = useState({ a: "", b: "" });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (empresa) setF({ correo_contacto: empresa.correo_contacto, telefono: empresa.telefono ?? "", sector: empresa.sector, direccion: empresa.direccion ?? "" });
  }, [empresa]);

  if (!empresa) return null;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(f.telefono)) return avisos.error("El teléfono debe tener 9 dígitos");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo_contacto)) return avisos.error("Correo de contacto inválido");
    if (pass.a && (pass.a.length < 8 || pass.a !== pass.b)) return avisos.error("Revisa la nueva contraseña", "Debe tener 8 caracteres o más y coincidir.");
    setGuardando(true);
    try {
      let foto = empresa.foto_perfil;
      if (logo) foto = await subirImagenPublica(session!.user.id, "logo", logo);
      const { error } = await supabase.from("empresas").update({ ...f, correo_contacto: f.correo_contacto.trim().toLowerCase(), foto_perfil: foto }).eq("id", empresa.id);
      if (error) throw error;
      if (pass.a) {
        const { error: pe } = await supabase.auth.updateUser({ password: pass.a });
        if (pe) throw pe;
      }
      await recargar();
      setLogo(null);
      setPass({ a: "", b: "" });
      avisos.ok("Perfil actualizado");
    } catch (err) {
      avisos.error("No se pudo guardar", errorMsg(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AppLayout titulo="Perfil de empresa">
      <form className="form-card form-panel" onSubmit={guardar}>
        <div className="perfil-cab">
          <Avatar src={logo ? URL.createObjectURL(logo) : empresa.foto_perfil} nombre={empresa.nombre_comercial} size={84} />
          <div>
            <h2>{empresa.nombre_comercial}</h2>
            <p className="muted">RUC {empresa.ruc}{empresa.ruc_verificado ? " — verificado en SUNAT" : ""}</p>
            <label className="btn btn-ghost btn-sm">Cambiar logo<input type="file" accept="image/*" className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></label>
          </div>
        </div>
        <div className="grid-2">
          <Campo label="Correo de contacto" htmlFor="c" ayuda={`Para iniciar sesión sigues usando ${session?.user.email}.`}><input id="c" type="email" value={f.correo_contacto} onChange={(e) => setF({ ...f, correo_contacto: e.target.value })} /></Campo>
          <Campo label="Teléfono" htmlFor="t"><input id="t" value={f.telefono} onChange={(e) => setF({ ...f, telefono: soloDigitos(e.target.value, 9) })} /></Campo>
          <Campo label="Sector" htmlFor="s"><input id="s" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} /></Campo>
          <Campo label="Dirección" htmlFor="d"><input id="d" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></Campo>
        </div>
        <fieldset>
          <legend>Cambiar contraseña <span className="muted">(opcional)</span></legend>
          <div className="grid-2">
            <Campo label="Nueva contraseña" htmlFor="p1"><input id="p1" type="password" value={pass.a} onChange={(e) => setPass({ ...pass, a: e.target.value })} autoComplete="new-password" /></Campo>
            <Campo label="Repite la contraseña" htmlFor="p2"><input id="p2" type="password" value={pass.b} onChange={(e) => setPass({ ...pass, b: e.target.value })} autoComplete="new-password" /></Campo>
          </div>
        </fieldset>
        <div className="form-acciones"><button className="btn btn-primary" disabled={guardando}>{guardando ? <Spinner /> : "Guardar cambios"}</button></div>
      </form>
    </AppLayout>
  );
}
