import { useEffect, useRef, useState } from "react";
import { FiCamera, FiRefreshCw } from "react-icons/fi";

/** Captura de selfie en vivo para la verificación biométrica de la empresa. */
export function CapturaSelfie({ onCaptura }: { onCaptura: (f: File | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<"inactiva" | "activa" | "lista" | "error">("inactiva");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  const detener = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => detener(), []);

  const iniciar = async () => {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setEstado("activa");
    } catch {
      setEstado("error");
      setError("No pudimos acceder a la cámara. Permite el acceso en tu navegador o usa un equipo con cámara.");
    }
  };

  const capturar = () => {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPreview(URL.createObjectURL(blob));
      onCaptura(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
      setEstado("lista");
      detener();
    }, "image/jpeg", 0.88);
  };

  const repetir = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onCaptura(null);
    void iniciar();
  };

  return (
    <div className="camara">
      <div className="camara-visor">
        <video ref={video} playsInline muted style={{ display: estado === "activa" ? "block" : "none" }} />
        {preview && <img src={preview} alt="Selfie capturada" />}
        {estado === "inactiva" && <p>La cámara se activa solo cuando lo indiques.</p>}
        {estado === "error" && <p className="txt-bad">{error}</p>}
      </div>
      <div className="fila">
        {(estado === "inactiva" || estado === "error") && (
          <button type="button" className="btn btn-primary" onClick={iniciar}><FiCamera /> Activar cámara</button>
        )}
        {estado === "activa" && (
          <button type="button" className="btn btn-primary" onClick={capturar}><FiCamera /> Tomar foto</button>
        )}
        {estado === "lista" && (
          <button type="button" className="btn btn-ghost" onClick={repetir}><FiRefreshCw /> Tomar otra</button>
        )}
      </div>
    </div>
  );
}
