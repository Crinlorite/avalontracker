// Correcciones de nombre respecto al JSON anterior (erratas de transcripción:
// «AI» con i mayúscula en vez de «Al», mayúsculas perdidas, letras
// cambiadas). El seed las usa para renombrar la fila existente y no perder
// las rutas que ya apuntan a ella.
//
// «Files-Izizaum» también venía en el JSON anterior y no existe en el
// juego (ni parecido): no se renombra ni se borra; su fila queda en la BD
// por si alguna ruta la usa, pero no sale en la parte pública.
export const RENAMED_ZONES: Record<string, string> = {
  "Fouitos-Aiattum": "Fouitos-Aiuttum",
  "Secent-AI-Odetis": "Secent-Al-Odetis",
  "Secent-al-tersum": "Secent-Al-Tersum",
  "Sectun-in-Vyntis": "Sectun-In-Vyntis",
  "Settun-AL-Nusis": "Settun-Al-Nusis",
};
