import { useEffect, useState, type FormEvent } from "react";
import { AppLayout } from "../../components/AppLayout";
import { Avatar, Campo, Spinner } from "../../components/ui";
import { errorMsg, subirImagenPublica, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useAvisos } from "../../lib/avisos";

export default function PerfilAdmin() {
  const { perfil, session, recargar } = useAuth();
  const avisos = useAvisos();
  const [nombre, setNombre] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [pass, setPass] = useState({ a: "", b: "" });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setNombre(perfil?.nombre ?? ""), [perfil]);
  if (!perfil) return null;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (pass.a && (pass.a.length < 8 || pass.a !== pass.b)) return avisos.error("Revisa la nueva contraseña", "Debe tener 8 caracteres o más y coincidir.");
    setGuardando(true);
    try {
      let url = perfil.foto_perfil;
      if (foto) url = await subirImagenPublica(session!.user.id, "admin", foto);
      const { error } = await supabase.from("perfiles").update({ nombre: nombre.trim(), foto_perfil: url }).eq("id", perfil.id);
      if (error) throw error;
      if (pass.a) {
        const { error: pe } = await supabase.auth.updateUser({ password: pass.a });
        if (pe) throw pe;
      }
      await recargar();
      setFoto(null);
      setPass({ a: "", b: "" });
      avisos.ok("Perfil actualizado");
    } catch (err) {
      avisos.error("No se pudo guardar", errorMsg(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AppLayout titulo="Mi perfil">
      <form className="form-card form-panel" onSubmit={guardar}>
        <div className="perfil-cab">
          <Avatar src={foto ? URL.createObjectURL(foto) : perfil.foto_perfil} nombre={nombre || "Admin"} size={84} cuadrado={false} />
          <div>
            <p className="muted">{session?.user.email}</p>
            <label className="btn btn-ghost btn-sm">Cambiar foto<input type="file" accept="image/*" className="sr-only" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} /></label>
          </div>
        </div>
        <Campo label="Nombre" htmlFor="n"><input id="n" value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
        <div className="grid-2">
          <Campo label="Nueva contraseña" htmlFor="p1" ayuda="Déjala vacía para mantener la actual."><input id="p1" type="password" value={pass.a} onChange={(e) => setPass({ ...pass, a: e.target.value })} autoComplete="new-password" /></Campo>
          <Campo label="Repite la contraseña" htmlFor="p2"><input id="p2" type="password" value={pass.b} onChange={(e) => setPass({ ...pass, b: e.target.value })} autoComplete="new-password" /></Campo>
        </div>
        <div className="form-acciones"><button className="btn btn-primary" disabled={guardando}>{guardando ? <Spinner /> : "Guardar cambios"}</button></div>
      </form>
    </AppLayout>
  );
}
