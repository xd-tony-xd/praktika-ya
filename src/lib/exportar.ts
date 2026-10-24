// Exporta tablas a Excel (.xls en HTML, igual que el sistema anterior: abre directo en Excel).
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function descargarExcel(
  nombreArchivo: string,
  columnas: string[],
  filas: (string | number | null | undefined)[][],
  colorEncabezado = "#13213F",
) {
  const head = columnas.map((c) => `<th style="background:${colorEncabezado};color:#fff;font-weight:bold">${esc(c)}</th>`).join("");
  const body = filas.map((f) => `<tr>${f.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${head}</tr>${body}</table></body></html>`;
  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
