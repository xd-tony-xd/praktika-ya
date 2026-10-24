import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Empresa, Perfil } from "./types";

interface AuthState {
  cargando: boolean;
  session: Session | null;
  perfil: Perfil | null;
  empresa: Empresa | null;
  rol: "admin" | "empresa" | null;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarDatos = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null);
      setEmpresa(null);
      return;
    }
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from("perfiles").select("id,rol,nombre,foto_perfil").eq("id", s.user.id).maybeSingle(),
      supabase.from("empresas").select("*").eq("user_id", s.user.id).maybeSingle(),
    ]);
    setPerfil((p as Perfil) ?? null);
    setEmpresa((e as Empresa) ?? null);
  }, []);

  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return;
      setSession(data.session);
      await cargarDatos(data.session);
      if (activo) setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "TOKEN_REFRESHED") {
        setSession(s);
        return;
      }
      setSession(s);
      // Se difiere para no bloquear el callback de auth (recomendación de supabase-js)
      setTimeout(() => void cargarDatos(s), 0);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [cargarDatos]);

  const recargar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await cargarDatos(data.session);
  }, [cargarDatos]);

  const salir = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPerfil(null);
    setEmpresa(null);
  }, []);

  const rol = perfil?.rol ?? (empresa ? "empresa" : null);

  return (
    <Ctx.Provider value={{ cargando, session, perfil, empresa, rol, recargar, salir }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
