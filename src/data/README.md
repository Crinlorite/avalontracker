# Datos del juego

Todo lo que hay aquí sale de los ficheros del cliente de Albion Online (© Sandbox Interactive) que la comunidad publica en [`ao-data/ao-bin-dumps`](https://github.com/ao-data/ao-bin-dumps). Ese repo no tiene licencia: son datos del juego y la comunidad los usa como referencia común.

| fichero | qué es | de dónde sale |
|---|---|---|
| `avalon-zones.json` | las 400 zonas de los Caminos de Avalon: tier, clase, recursos, cofres (con el **tier real del cofre**: T4/T6/T8 del punto de aparición, no el de la zona), mazmorras, nodos por tier, bichos (`mobcounts`) y marcadores del minimapa | `scripts/extract-avalon-zones.ts` sobre el dump vivo; commit exacto en `avalon-zones.source.json` |
| `chest-loot.json` | qué puede salir de cada cofre (tipo × tamaño × tier): categorías ordenadas por peso, sin porcentajes. `FRAGMENT_LOOT*` = runas/almas/reliquias; `LOOT_AVALON_FRAGMENTS` = esquirlas avalonianas | `scripts/extract-chest-loot.ts` (lootchests.json + loot.json del mismo commit) |
| `world-meta.json` | tipo de PvP y adyacencias del mundo (salidas, royal/portal más cercano) | dump archivado `broderickhyman/ao-bin-dumps` (ene-2023) **+ correcciones a mano** |
| `world-meta.manual-edges.json` | las 136 conexiones corregidas a mano en `world-meta.json` | recuperadas por diferencia con el dump de origen (26-sep-2026) |
| `world-graph.json` | grafo con ciudad segura más cercana; solo lo lee `scripts/import-world-graph.ts`, que hoy no importa nada (espera una clave `connections` que el fichero no tiene) | dump, mar-2026 |
| `world-zones.json` | nombres de zonas del mundo para el autocompletado | dump, mar-2026 |

## Regenerar las zonas de Avalon tras un parche

```bash
npx tsx scripts/extract-avalon-zones.ts          # último commit del dump
npx tsx scripts/extract-chest-loot.ts --sha <el mismo commit>   # botín por cofre
```

El script cruza cada marcador calculado con los que trae `world.json` y se detiene si alguno no cuadra. Al desplegar, `scripts/seed-zones.ts` sincroniza la tabla `Zone` (crea, renombra erratas conservando ids, actualiza).

## Por qué `world-meta.json` NO se regenera del dump vivo

Comparado el 26-sep-2026: el dump vivo trae solo 14 de las 136 conexiones corregidas a mano. Sin una fuente independiente que diga quién acierta, se conservan las correcciones. Si se regenera algún día, hay que volver a aplicar `world-meta.manual-edges.json`.

Las zonas de Avalon no tienen salidas fijas (sus portales son aleatorios y caducan): en `world-meta.json` tienen 0 vecinos, y la «royal más cercana» solo se puede calcular desde la zona del mundo donde sale el portal.
