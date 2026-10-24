import { useEffect, useRef, useState } from "react";
import { FiMic, FiSquare, FiTrash2, FiUpload } from "react-icons/fi";
import { GrabadoraWav } from "../lib/grabadora";
import { callFn, errorMsg } from "../lib/supabase";
import type { VozDatos } from "../lib/types";
import { Spinner } from "./ui";

const MIN_SEG = 20;
const MAX_SEG = 90;

/**
 * "CV por voz": el estudiante graba (o sube) una presentación de 60-90 s.
 * La IA la transcribe y extrae estudios, experiencia y habilidades.
 * El postulante revisa, edita y aprueba antes de enviarlo. El audio no se guarda.
 */
export function CvVoz({ valor, onChange }: { valor: VozDatos | null; onChange: (v: VozDatos | null) => void }) {
  const [fase, setFase] = useState<"inicio" | "grabando" | "procesando" | "revision">(valor ? "revision" : "inicio");
  const [seg, setSeg] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [error, setError] = useState("");
  const [borrador, setBorrador] = useState<VozDatos | null>(valor);
  const [aprobado, setAprobado] = useState(Boolean(valor));
  const grab = useRef<GrabadoraWav | null>(null);
  const timer = useRef<number | null>(null);
  const segRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    grab.current?.cancelar();
    if (timer.current) window.clearInterval(timer.current);
  }, []);

  const procesar = async (blob: Blob, nombre: string) => {
    setFase("procesando");
    setError("");
    try {
      const fd = new FormData();
      fd.append("audio", new File([blob], nombre, { type: blob.type || "audio/wav" }));
      const r = await callFn<VozDatos>("cv-voz", fd);
      setBorrador({ transcripcion: r.transcripcion, estudios: r.estudios, experiencia: r.experiencia, habilidades: r.habilidades });
      setAprobado(false);
      onChange(null);
      setFase("revision");
    } catch (e) {
      setError(errorMsg(e));
      setFase("inicio");
    }
  };

  const iniciar = async () => {
    setError("");
    try {
      grab.current = new GrabadoraWav();
      grab.current.onNivel = setNivel;
      await grab.current.iniciar();
      segRef.current = 0;
      setSeg(0);
      setFase("grabando");
      timer.current = window.setInterval(() => {
        segRef.current += 1;
        setSeg(segRef.current);
        if (segRef.current >= MAX_SEG) void detenerRef.current();
      }, 1000);
    } catch {
      setError("No pudimos usar el micrófono. Permite el acceso o sube un archivo de audio.");
    }
  };

  const detener = async () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    const g = grab.current;
    grab.current = null;
    if (!g) return;
    const blob = await g.detener();
    if (segRef.current < MIN_SEG - 1) {
      setError(`La grabación es muy corta. Habla al menos ${MIN_SEG} segundos (ideal 60 a 90).`);
      setFase("inicio");
      return;
    }
    await procesar(blob, "presentacion.wav");
  };

  const detenerRef = useRef(detener);
  detenerRef.current = detener;

  const editarLista = (campo: "estudios" | "experiencia" | "habilidades", texto: string) => {
    if (!borrador) return;
    setBorrador({ ...borrador, [campo]: texto.split("\n").map((x) => x.trim()).filter(Boolean) });
    setAprobado(false);
    onChange(null);
  };

  const descartar = () => {
    setBorrador(null);
    setAprobado(false);
    onChange(null);
    setFase("inicio");
  };

  if (fase === "grabando") {
    return (
      <div className="voz voz-grabando">
        <div className="voz-onda" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} style={{ height: `${12 + nivel * 60 * (0.4 + Math.abs(Math.sin(i * 1.7 + seg)))}%` }} />
          ))}
        </div>
        <p className="voz-tiempo">{String(Math.floor(seg / 60)).padStart(1, "0")}:{String(seg % 60).padStart(2, "0")} <span className="muted">/ 1:30</span></p>
        <p className="muted">Cuenta qué estudias, en qué proyectos o trabajos participaste y qué herramientas dominas.</p>
        <button type="button" className="btn btn-danger" onClick={detener}><FiSquare /> Terminar grabación</button>
      </div>
    );
  }

  if (fase === "procesando") {
    return (
      <div className="voz">
        <Spinner /> <span>Transcribiendo tu presentación…</span>
      </div>
    );
  }

  if (fase === "revision" && borrador) {
    return (
      <div className="voz voz-revision">
        <p className="muted">Revisa lo que entendimos. Puedes corregir cada lista (una línea por elemento). El audio ya fue eliminado.</p>
        <details>
          <summary>Ver transcripción</summary>
          <p className="voz-transcripcion">{borrador.transcripcion || "Sin transcripción."}</p>
        </details>
        <div className="grid-3">
          {(["estudios", "experiencia", "habilidades"] as const).map((k) => (
            <label key={k} className="campo">
              <span className="campo-label-txt">{k[0].toUpperCase() + k.slice(1)}</span>
              <textarea rows={4} value={borrador[k].join("\n")} onChange={(e) => editarLista(k, e.target.value)} />
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={aprobado}
            onChange={(e) => {
              setAprobado(e.target.checked);
              onChange(e.target.checked ? borrador : null);
            }}
          />
          <span>Apruebo que esta información se comparta con la empresa junto a mi CV.</span>
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={descartar}><FiTrash2 /> Descartar y grabar de nuevo</button>
      </div>
    );
  }

  return (
    <div className="voz">
      <div className="fila">
        <button type="button" className="btn btn-ghost" onClick={iniciar}><FiMic /> Grabar presentación</button>
        <button type="button" className="btn btn-link" onClick={() => fileRef.current?.click()}><FiUpload /> Subir audio</button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void procesar(f, f.name);
            e.target.value = "";
          }}
        />
      </div>
      <p className="muted">Opcional. Entre 60 y 90 segundos. Es útil si tu CV aún es corto.</p>
      {error && <p className="txt-bad">{error}</p>}
    </div>
  );
}
