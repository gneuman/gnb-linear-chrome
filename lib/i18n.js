// Idioma de la extensión: español o inglés. La llave de cada texto es el texto en
// español (si falta la traducción, sale en español). Sin dependencias de Chrome al
// importarse: se prueba con node --test.
//
// Cuál se usa: el de Ajustes (`config.idioma`: 'es' | 'en'); vacío = el idioma de
// Chrome (español si empieza con "es", inglés si no). Lo del manifiesto (nombre y
// descripción en la tienda) va en _locales/.

import { EN } from './i18n-en.js';

let actual = 'es';

/** Elige el idioma: el de Ajustes o, si está vacío, el de Chrome. */
export function elegirIdioma(preferido = '', deChrome = '') {
  if (preferido === 'es' || preferido === 'en') return preferido;
  return /^es\b/i.test(deChrome || '') ? 'es' : 'en';
}

export function fijarIdioma(lang) {
  actual = lang === 'en' ? 'en' : 'es';
  return actual;
}

export const idioma = () => actual;

/** Locale para fechas y horas. */
export const locale = () => (actual === 'en' ? 'en-US' : 'es-MX');

/** Lee Ajustes y fija el idioma. Para popup, ajustes y background. */
export async function usarIdioma() {
  const { config = {} } = await chrome.storage.local.get('config');
  return fijarIdioma(elegirIdioma(config.idioma, chrome.i18n?.getUILanguage?.()));
}

/** Traduce y rellena `{nombre}` con `vars`. */
export function t(es, vars = {}) {
  const base = actual === 'en' && EN[es] != null ? EN[es] : es;
  return base.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Espacios y saltos de línea del HTML no cuentan para la llave. */
export const llaveHtml = (html) => html.replace(/\s+/g, ' ').trim();

/**
 * Traduce el HTML. Lo marcado con `data-i18n` usa su propio contenido en español
 * como llave (innerHTML, para conservar ligas y negritas: son textos nuestros, no
 * de Linear). `placeholder` y `title` se traducen en todo lo que los tenga.
 */
export function traducirDom(raiz = document) {
  document.documentElement.lang = actual;
  if (actual === 'es') return;
  for (const n of raiz.querySelectorAll('[data-i18n]')) {
    const llave = llaveHtml(n.innerHTML);
    if (EN[llave] != null) n.innerHTML = EN[llave];
  }
  for (const n of raiz.querySelectorAll('[placeholder]')) n.placeholder = t(n.getAttribute('placeholder'));
  for (const n of raiz.querySelectorAll('[title]')) n.title = t(n.getAttribute('title'));
}
