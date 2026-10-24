import { useEffect, useRef, useState } from "react";
import { FiSend, FiX } from "react-icons/fi";
import { callFn, errorMsg } from "../lib/supabase";
import { useConfig } from "../lib/config";

interface Msg { rol: "user" | "bot"; texto: string }

const SUGERENCIAS = ["¿Cómo postulo?", "¿Hay prácticas remotas?", "Soy empresa, ¿cómo me registro?"];

/** Asistente virtual flotante (Gemini). Reemplaza el chatbot Python. */
export function ChatBot() {
  const { config } = useConfig();
  const [abierto, setAbierto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { rol: "bot", texto: `¡Hola! Soy el asistente de ${config.nombre_sitio || "Práctika ya"}. Pregúntame por vacantes, cómo postular o cómo publicar una convocatoria.` },
  ]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.scrollTo({ top: caja.current.scrollHeight, behavior: "smooth" });
  }, [msgs, enviando]);

  const enviar = async (t: string) => {
    const limpio = t.trim();
    if (!limpio || enviando) return;
    const historial: Msg[] = [...msgs, { rol: "user", texto: limpio }];
    setMsgs(historial);
    setTexto("");
    setEnviando(true);
    try {
      const r = await callFn<{ respuesta: string }>("chatbot", { mensajes: historial.slice(-12) });
      setMsgs((m) => [...m, { rol: "bot", texto: r.respuesta }]);
    } catch (e) {
      setMsgs((m) => [...m, { rol: "bot", texto: `No pude responder ahora. ${errorMsg(e)}` }]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {abierto && (
        <section className="chat" aria-label="Asistente virtual">
          <header className="chat-head">
            <img src="/img/chat.webp" alt="" width={34} height={34} />
            <div>
              <strong>Asistente</strong>
              <small>Responde al instante</small>
            </div>
            <button className="icon-btn" onClick={() => setAbierto(false)} aria-label="Cerrar asistente"><FiX /></button>
          </header>
          <div className="chat-box" ref={caja}>
            {msgs.map((m, i) => (
              <p key={i} className={`chat-msg chat-${m.rol}`}>{m.texto}</p>
            ))}
            {enviando && <p className="chat-msg chat-bot chat-typing"><span /><span /><span /></p>}
          </div>
          {msgs.length < 3 && (
            <div className="chat-sug">
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => void enviar(s)}>{s}</button>
              ))}
            </div>
          )}
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta" aria-label="Mensaje" maxLength={1500} />
            <button className="btn btn-primary btn-icon" disabled={enviando || !texto.trim()} aria-label="Enviar"><FiSend /></button>
          </form>
        </section>
      )}
      <button className={`chat-fab ${abierto ? "chat-fab-on" : ""}`} onClick={() => setAbierto((v) => !v)} aria-label={abierto ? "Cerrar asistente" : "Abrir asistente"} aria-expanded={abierto}>
        <img src="/img/chat.webp" alt="" width={58} height={58} />
      </button>
    </>
  );
}
