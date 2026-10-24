import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type SiteConfig = Record<string, string>;

const DEFAULTS: SiteConfig = {
  nombre_sitio: "Práctika ya",
  modo_mantenimiento: "off",
  dominios_correo_estudiante: ".edu.pe",
  umbral_apto: "60",
  ai_credit_sales_enabled: "1",
};

const Ctx = createContext<{ config: SiteConfig; cargado: boolean; recargar: () => Promise<void> } | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(DEFAULTS);
  const [cargado, setCargado] = useState(false);

  const recargar = useCallback(async () => {
    const { data } = await supabase.from("configuracion").select("clave,valor");
    const next: SiteConfig = { ...DEFAULTS };
    for (const row of (data as { clave: string; valor: string | null }[]) ?? []) next[row.clave] = row.valor ?? "";
    setConfig(next);
    setCargado(true);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return <Ctx.Provider value={{ config, cargado, recargar }}>{children}</Ctx.Provider>;
}

export function useConfig() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfig fuera de ConfigProvider");
  return v;
}
