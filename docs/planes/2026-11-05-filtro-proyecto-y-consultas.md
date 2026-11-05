---
titulo: Filtro por proyecto y consulta exacta de cada grupo
fecha: 2026-11-05
proyecto: gnb-linear-chrome
estado: en-revision
tipo: feature
tags: [linear, delegacion, INT-1882]
---

# Filtro por proyecto y consulta exacta de cada grupo (INT-1882)

## Objetivo

Que Gabriel vea el día por proyecto y pueda delegar un grupo entero a Claude
con la búsqueda exacta, sin reconstruirla a mano.

## Lo que se hizo

- Selector de proyecto en el popup (Todos / proyecto / Sin proyecto), guardado en `config.proyecto`.
- `lib/consultas.js`: la regla de cada grupo como `IssueFilter` de GraphQL.
- Botón **Copiar para Claude** por grupo: curl exacto + lista con riesgo y "Listo cuando".
- Botón **Linear ↗** por grupo: vista personal de Linear con el mismo filtro (una por grupo, se reutiliza).
- El tope de issues pasó de 500 a 2000 (páginas de 250). Con 500, Gabriel (592 abiertos) veía 14 de 24 en "Para agente".
- Arreglo de paso: el popup pintaba "null" cuando un grupo plegado venía vacío.
- El endpoint HTTP para agentes va aparte en gnb-crm (INT-1883).

## Archivos

`lib/consultas.js` (nuevo), `lib/estado.js`, `lib/linear.js`, `lib/store.js`, `popup.js`, `popup.css`,
`test/consultas.test.js` (nuevo), `scripts/verificar-consultas.mjs` (nuevo), `README.md`.

## MAA

- **Medir:** issues por grupo que ve el popup contra los que regresa Linear con la consulta (`scripts/verificar-consultas.mjs`).
- **Analizar:** el 2026-11-05 la base daba diferencias en 5 de 6 grupos por el tope de 500; después del cambio, 6 de 6 iguales.
- **Actuar:** si sale `FALLA`, `clasificar` y `consultas.js` se desalinearon; la prueba de `test/consultas.test.js` lo frena antes.

## Verificación pendiente

- Abrir una vista con **Linear ↗** en el Chrome de Gabriel y confirmar que la URL `linear.app/gnb-labs/view/<slugId>` carga la vista.
