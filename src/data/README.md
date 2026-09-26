# Datos del juego

Todo lo que hay aquí sale de los ficheros del cliente de Albion Online (© Sandbox Interactive) que la comunidad publica en [`ao-data/ao-bin-dumps`](https://github.com/ao-data/ao-bin-dumps). Ese repo no tiene licencia: son datos del juego y la comunidad los usa como referencia común.

| fichero | qué es | de dónde sale |
|---|---|---|
| `avalon-zones.json` | las 400 zonas de los Caminos de Avalon: tier, clase, recursos, cofres, mazmorras, nodos por tier y marcadores del minimapa | `scripts/extract-avalon-zones.ts` sobre el dump vivo; commit exacto en `avalon-zones.source.json` |
| `world-meta.json` | tipo de PvP y adyacencias del mundo (salidas, royal/portal más cercano) | dump archivado `broderickhyman/ao-bin-dumps` (ene-2023) **+ correcciones a mano** |
| `world-meta.manual-edges.json` | las 136 conexiones corregidas a mano en `world-meta.json` | recuperadas por diferencia con el dump de origen (26-sep-2026) |
| `world-graph.json` | grafo con ciudad segura más cercana (vista de mapa) | dump, mar-2026 |
| `world-zones.json` | nombres de zonas del mundo para el autocompletado | dump, mar-2026 |

## Regenerar las zonas de Avalon tras un parche

```bash
npx tsx scripts/extract-avalon-zones.ts          # último commit del dump
```

El script cruza cada marcador calculado con los que trae `world.json` y se detiene si alguno no cuadra. Al desplegar, `scripts/seed-zones.ts` sincroniza la tabla `Zone` (crea, renombra erratas conservando ids, actualiza).

## Por qué `world-meta.json` NO se regenera del dump vivo

Comparado el 26-sep-2026: el dump vivo trae solo 14 de las 136 conexiones corregidas a mano. Sin una fuente independiente que diga quién acierta, se conservan las correcciones. Si se regenera algún día, hay que volver a aplicar `world-meta.manual-edges.json`.

Las zonas de Avalon no tienen salidas fijas (sus portales son aleatorios y caducan): en `world-meta.json` tienen 0 vecinos, y la «royal más cercana» solo se puede calcular desde la zona del mundo donde sale el portal.
