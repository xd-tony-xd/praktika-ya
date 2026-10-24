import { useCallback, useEffect, useRef, useState } from "react";
import { AppLayout } from "../../components/AppLayout";
import { Cargando, Spinner, Vacio } from "../../components/ui";
import { setQuery, useLocation } from "../../lib/router";
import { callFn, errorMsg, supabase } from "../../lib/supabase";
import { useAvisos } from "../../lib/avisos";
import { useConfig } from "../../lib/config";
import { fechaHora, soles } from "../../lib/format";
import type { Movimiento, Paquete } from "../../lib/types";

const TIPO: Record<Movimiento["tipo"], string> = { compra: "Compra", reserva: "Análisis en curso", consumo: "Análisis de CV", reembolso: "Devolución", bonificacion: "Regalo" };

export default function Creditos() {
  const { query } = useLocation();
  const { config } = useConfig();
  const avisos = useAvisos();
  const [saldo, setSaldo] = useState<number | null>(null);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [comprando, setComprando] = useState<number | null>(null);
  const [pago, setPago] = useState<{ estado: string; texto: string } | null>(null);
  const intentos = useRef(0);
  const ventas = (config.ai_credit_sales_enabled ?? "1") === "1";

  const cargar = useCallback(async () => {
    const [s, p, m] = await Promise.all([
      supabase.from("creditos_empresa").select("saldo").maybeSingle(),
      supabase.from("paquetes_creditos").select("*").eq("activo", true).order("orden").order("creditos"),
      supabase.from("movimientos_creditos").select("*").order("creado_en", { ascending: false }).limit(100),
    ]);
    setSaldo(s.data?.saldo ?? 0);
    setPaquetes((p.data as Paquete[]) ?? []);
    setMovs((m.data as Movimiento[]) ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  // Regreso desde Stripe
  useEffect(() => {
    const estado = query.get("checkout");
    const sid = query.get("session_id");
    if (estado === "cancelled") {
      setPago({ estado: "info", texto: "Compra cancelada. No se realizó ningún cargo." });
      setQuery({ checkout: null });
      return;
    }
    if (estado !== "success" || !sid) return;
    setPago({ estado: "pendiente", texto: "Verificando tu pago con Stripe…" });
    let vivo = true;
    const revisar = async () => {
      try {
        const r = await callFn<{ estado: string; paquete: string; creditos: number; saldo: number }>("checkout-status", { session_id: sid });
        if (!vivo) return;
        if (r.estado === "pagado") {
          setPago({ estado: "ok", texto: `¡Pago confirmado! Se añadieron ${r.creditos} créditos del paquete ${r.paquete}.` });
          setSaldo(r.saldo);
          void cargar();
          setQuery({ checkout: null, session_id: null });
          return;
        }
        if (r.estado === "fallido") {
          setPago({ estado: "error", texto: "El pago no se completó. No se añadieron créditos; puedes intentarlo otra vez." });
          return;
        }
      } catch { /* reintento */ }
      intentos.current++;
      if (intentos.current < 30 && vivo) setTimeout(revisar, 3000);
      else if (vivo) setPago({ estado: "pendiente", texto: "Seguimos esperando la confirmación de Stripe. Tu saldo se actualizará solo cuando llegue." });
    };
    void revisar();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comprar = async (p: Paquete) => {
    setComprando(p.id);
    try {
      const r = await callFn<{ url: string }>("stripe-checkout", { paquete_id: p.id });
      window.location.assign(r.url);
    } catch (e) {
      avisos.error("No se pudo iniciar el pago", errorMsg(e));
      setComprando(null);
    }
  };

  const masElegido = paquetes.length >= 3 ? paquetes[1].id : null;

  return (
    <AppLayout titulo="Créditos IA">
      {saldo === null ? <Cargando /> : (
        <>
          {pago && <div className={`alerta alerta-${pago.estado === "ok" ? "ok" : pago.estado === "error" ? "error" : "info"}`} role="status">{pago.estado === "pendiente" && <Spinner />} {pago.texto}</div>}
          <section className="saldo">
            <div>
              <span className="saldo-num">{saldo.toLocaleString("es-PE")}</span>
              <span className="saldo-txt">{saldo === 1 ? "análisis disponible" : "análisis disponibles"}</span>
            </div>
            <p>Cada CV analizado usa 1 crédito. Si un análisis falla, el crédito vuelve a tu saldo. Los créditos no vencen.</p>
          </section>

          <h2 className="h-seccion">Paquetes</h2>
          {!ventas ? (
            <div className="alerta alerta-info">La compra de créditos está pausada por el momento. Escríbenos si necesitas más análisis.</div>
          ) : paquetes.length === 0 ? (
            <Vacio titulo="Todavía no hay paquetes a la venta" />
          ) : (
            <div className="paquetes">
              {paquetes.map((p) => (
                <article key={p.id} className={`paquete ${p.id === masElegido ? "paquete-dest" : ""}`}>
                  {p.id === masElegido && <span className="paquete-tag">Más elegido</span>}
                  <h3>{p.nombre}</h3>
                  <p className="paquete-cred"><strong>{p.creditos}</strong> análisis de CV</p>
                  <p className="paquete-precio">{soles(p.precio_total)}</p>
                  <p className="muted small">{soles(p.precio_unitario)} por análisis</p>
                  <button className={`btn btn-block ${p.id === masElegido ? "btn-primary" : "btn-ghost"}`} onClick={() => void comprar(p)} disabled={comprando !== null}>
                    {comprando === p.id ? <><Spinner /> Abriendo Stripe…</> : "Comprar"}
                  </button>
                </article>
              ))}
            </div>
          )}
          <p className="muted small">Pago seguro con tarjeta a través de Stripe. Precios en soles.</p>

          <h2 className="h-seccion">Movimientos</h2>
          {movs.length === 0 ? <p className="muted">Aún no tienes movimientos.</p> : (
            <div className="tabla-wrap">
              <table className="tabla tabla-compacta">
                <thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th className="num">Créditos</th></tr></thead>
                <tbody>
                  {movs.map((m) => {
                    const suma = m.tipo === "compra" || m.tipo === "bonificacion";
                    const neutro = m.tipo === "reembolso";
                    return (
                      <tr key={m.id}>
                        <td>{fechaHora(m.creado_en)}</td>
                        <td>{TIPO[m.tipo]}</td>
                        <td className="muted">{m.descripcion}</td>
                        <td className={`num ${suma ? "txt-ok" : neutro ? "muted" : ""}`}>{neutro ? "±0" : `${suma ? "+" : "−"}${m.creditos}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
