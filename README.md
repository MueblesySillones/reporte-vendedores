# Reporte de Vendedores

Plataforma interna para registrar situaciones de vendedores por sucursal
(vendedor + situación + detalle + captura) y construir el legajo de cada uno.

- **Cargar:** formulario con vendedor, situación, cuerpo e imagen.
- **Reporte:** legajo por vendedor, conteo por situación, filtro por sucursal y exportar a Excel/PDF.

## Stack
- Frontend estático (HTML + CSS + JS, sin build).
- **Supabase** (proyecto `emma-agency`): tablas `rv_vendedores`, `rv_reportes` y bucket `rv-reportes`.
- Deploy en **Vercel**.

## Editar la lista de vendedores
Se edita en la base (tabla `rv_vendedores`). Campos: `nombre`, `sucursal`, `activo`, `orden`.
