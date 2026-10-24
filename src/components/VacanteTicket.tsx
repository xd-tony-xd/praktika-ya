import { FiMapPin } from "react-icons/fi";
import { Link } from "../lib/router";
import { diasRestantes, textoCierre } from "../lib/format";
import type { VacantePublica } from "../lib/types";
import { Avatar, SelloChip } from "./ui";

/** Vacante como "ticket" horizontal: empresa | puesto | cierre. */
export function VacanteTicket({ v }: { v: VacantePublica }) {
  const d = diasRestantes(v.fecha_limite);
  const urgente = d !== null && d >= 0 && d <= 3;
  return (
    <Link to={`/vacante/${v.id}`} className="ticket">
      <div className="ticket-emp">
        <Avatar src={v.foto_perfil} nombre={v.nombre_comercial} size={48} />
      </div>
      <div className="ticket-cuerpo">
        <span className="ticket-empresa">{v.nombre_comercial}</span>
        <h3>{v.titulo_puesto}</h3>
        <div className="ticket-meta">
          <span className={`chip chip-${v.modalidad === "Remoto" ? "remoto" : v.modalidad === "Híbrido" ? "hibrido" : "presencial"}`}>{v.modalidad}</span>
          {v.ubicacion && <span className="ticket-lugar"><FiMapPin aria-hidden /> {v.ubicacion}</span>}
          {v.carreras.slice(0, 2).map((c) => (
            <span key={c.id} className="chip chip-suave">{c.nombre}</span>
          ))}
          {v.carreras.length > 2 && <span className="chip chip-suave">+{v.carreras.length - 2}</span>}
          {v.sello_vigente && <SelloChip />}
        </div>
      </div>
      <div className={`ticket-cierre ${urgente ? "urgente" : ""}`}>
        {d !== null && d >= 0 ? (
          <>
            <strong>{d === 0 ? "Hoy" : d}</strong>
            <span>{d === 0 ? "último día" : d === 1 ? "día" : "días"}</span>
          </>
        ) : (
          <span className="ticket-sinfecha">{textoCierre(v.fecha_limite)}</span>
        )}
      </div>
    </Link>
  );
}
