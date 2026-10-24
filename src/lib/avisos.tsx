// Avisos (toasts) y diálogos de confirmación basados en promesas.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiX, FiXCircle } from "react-icons/fi";

type Tipo = "ok" | "error" | "info" | "aviso";
interface Toast { id: number; tipo: Tipo; titulo: string; texto?: string }
interface ConfirmOpts { titulo: string; texto?: string; confirmar?: string; peligro?: boolean }

interface Api {
  ok: (titulo: string, texto?: string) => void;
  error: (titulo: string, texto?: string) => void;
  info: (titulo: string, texto?: string) => void;
  aviso: (titulo: string, texto?: string) => void;
  confirmar: (o: ConfirmOpts) => Promise<boolean>;
}

const Ctx = createContext<Api | null>(null);
const ICON = { ok: FiCheckCircle, error: FiXCircle, info: FiInfo, aviso: FiAlertTriangle };

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialogo, setDialogo] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const seq = useRef(0);

  const push = useCallback((tipo: Tipo, titulo: string, texto?: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, tipo, titulo, texto }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === "error" ? 8000 : 5000);
  }, []);

  const confirmar = useCallback((o: ConfirmOpts) => {
    setDialogo(o);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const cerrar = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setDialogo(null);
  };

  const api: Api = {
    ok: (a, b) => push("ok", a, b),
    error: (a, b) => push("error", a, b),
    info: (a, b) => push("info", a, b),
    aviso: (a, b) => push("aviso", a, b),
    confirmar,
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const I = ICON[t.tipo];
          return (
            <div key={t.id} className={`toast toast-${t.tipo}`}>
              <I aria-hidden />
              <div>
                <strong>{t.titulo}</strong>
                {t.texto && <p>{t.texto}</p>}
              </div>
              <button className="icon-btn" aria-label="Cerrar aviso" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
                <FiX />
              </button>
            </div>
          );
        })}
      </div>
      {dialogo && (
        <div className="overlay" onClick={() => cerrar(false)}>
          <div className="dialog dialog-sm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{dialogo.titulo}</h3>
            {dialogo.texto && <p className="muted">{dialogo.texto}</p>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => cerrar(false)}>Cancelar</button>
              <button autoFocus className={`btn ${dialogo.peligro ? "btn-danger" : "btn-primary"}`} onClick={() => cerrar(true)}>
                {dialogo.confirmar ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useAvisos(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAvisos fuera de AvisosProvider");
  return v;
}
