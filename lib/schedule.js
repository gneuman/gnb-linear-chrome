// Cálculo de horas para recordatorios. Sin dependencias de Chrome: se prueba con node --test.

const MINUTO = 60 * 1000;

/** Próxima vez que toca "HH:MM" con la repetición dada ('no' | 'diario' | 'laborables'). */
export function siguienteHora(hhmm, repetir = 'no', ahora = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(ahora);
  d.setHours(h, m, 0, 0);
  if (d <= ahora) d.setDate(d.getDate() + 1);
  if (repetir === 'laborables') {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

/**
 * Entiende frases cortas:
 *   "10am revisar propuesta", "a las 16:30 llamar", "recuérdame a las 9 pagar",
 *   "en 30 min mandar correo", "en 2 h revisar PR".
 * Y en inglés: "10am review proposal", "at 4:30pm call", "remind me to pay at 9",
 *   "in 30 min send email", "in 2 h review PR".
 * Devuelve { texto, hhmm } o { texto, at } o null si no encuentra hora.
 */
export function parseRapido(entrada, ahora = new Date()) {
  let s = (entrada || '').trim().replace(/^(recu[eé]rdame|recordar|recordatorio|remind me(?: to)?|reminder)\s*:?\s*/i, '');

  const rel = s.match(/^(?:en|in)\s+(\d+)\s*(min(?:utos?|utes?|s)?|m|h|hrs?|horas?|hours?)\s+(.+)$/i);
  if (rel) {
    const n = Number(rel[1]);
    const mins = /^h/i.test(rel[2]) ? n * 60 : n;
    return { texto: rel[3].trim(), at: ahora.getTime() + mins * MINUTO };
  }

  const abs = s.match(/^(?:(?:a\s+las?|at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.\s?m\.|p\.\s?m\.)?\s+(.+)$/i);
  if (abs) {
    let h = Number(abs[1]);
    const m = Number(abs[2] || 0);
    const sufijo = (abs[3] || '').toLowerCase().replace(/[.\s]/g, '');
    if (sufijo === 'pm' && h < 12) h += 12;
    if (sufijo === 'am' && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    // "10 cosas que hacer" no es una hora: sin am/pm ni ":" exige "a las" (o "at").
    if (!abs[2] && !sufijo && !/^(a\s+las?|at)\s+/i.test(s)) return null;
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return { texto: abs[4].trim(), hhmm };
  }
  return null;
}
