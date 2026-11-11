# Meridiano · servicio de actualización diaria

Cada día (dos veces) este proyecto busca las noticias de cada país, las **traduce al español y las clasifica en los 48 temas** de Meridiano con Claude, y las guarda en archivos JSON que lee la web. No necesita servidor propio.

```
GDELT (noticias de medios de cada país)  ─┐
RSS opcionales por país                   ─┼─►  scripts/update.mjs ──► Claude Haiku 5.5 (traduce + clasifica)
                                           │              │
                                           │              ▼
                                           │     site/data/news/ES.json, FR.json, …  (rama «data»)
                                           │              │
                                           └──────────────┴──► web estática (GitHub Pages / Cloudflare Pages)
```

* **Fuente principal:** [GDELT DOC 2.0](https://api.gdeltproject.org/api/v2/doc/doc), gratuita, sin clave, con medios de casi todos los países. Aporta titular, enlace, fecha, medio, idioma e imagen de la noticia. **No** aporta descripción: por eso solo se genera un resumen cuando una fuente RSS la trae (nunca se inventa).
* **Clasificación:** Claude recibe lotes de 40 titulares, los traduce, les asigna de 1 a 3 temas y descarta lo que no es noticia (publicidad, apuestas, horóscopos…). Cada respuesta se **valida**: solo se aceptan claves de tema que existen y los textos se acotan.
* **Sin gastar dos veces:** lo ya clasificado se reutiliza en las siguientes ejecuciones y los descartados se recuerdan.
* **Identificador estable por noticia (`id`):** sale de la URL limpia. Los debates de cada noticia se enlazarán a este `id`.
* **Caducidad:** las noticias se conservan 72 horas (configurable en `scripts/lib/pipeline.mjs`).

## Puesta en marcha

1. **Crea un repositorio** en GitHub y sube esta carpeta (rama `main`).
2. **Clave de Claude:** en *Settings → Secrets and variables → Actions → New repository secret* crea `ANTHROPIC_API_KEY` con tu clave de la [consola de Anthropic](https://platform.claude.com).
3. **Publicación de la web:** *Settings → Pages → Source: GitHub Actions*. (Alternativa recomendada: **Cloudflare Pages**, conectando el repositorio con «build output directory» = `site`. Despliega solo cada vez que cambia la rama `data` y admite repositorios privados gratis.)
4. **Descubre los nombres de país de GDELT (una sola vez):** *Actions → «Descubrir nombres de país en GDELT» → Run workflow*. Tarda ~30–40 min. Guarda `config/gdelt-names.json`; los países sin resultados quedan en `null` y se saltan.
5. **Primera actualización:** *Actions → «Actualizar noticias» → Run workflow*. Para probar barato, escribe `ES,FR,MX` en el campo de países.
6. A partir de ahí se ejecuta solo a las 05:00 y 17:00 UTC (edita el `cron` en `.github/workflows/update-news.yml`).

### En tu ordenador

```bash
npm install
npm test                                              # pruebas sin red
node scripts/update.mjs --dry-run --countries ES      # simulación: no llama a Claude
ANTHROPIC_API_KEY=sk-ant-… node scripts/update.mjs --countries ES,FR
npm run serve                                         # abre la web en local (usa site/data)
```

## Qué cuesta

* **GDELT:** gratis (pide citar la fuente; la web ya lo hace).
* **Claude Haiku 5.5:** 0,10 $ por millón de tokens de entrada y 0,50 $ por millón de salida (prompts de hasta 100.000 tokens; [tabla oficial](https://platform.claude.com/docs/en/about-claude/pricing)). Cada país con 120 titulares nuevos consume ~9.000 tokens de entrada y ~7.000 de salida: **~0,004 $ por país**. Una ejecución completa de ~236 países queda **por debajo de ~1 $** en el peor caso (los países pequeños traen pocas noticias y las ejecuciones siguientes solo clasifican lo nuevo). Con dos al día, el techo ronda **30–60 $/mes**. La API Batch tiene un 50 % de descuento si algún día no importa la inmediatez. El resumen de cada ejecución (llamadas, tokens y coste estimado) aparece en la pestaña *Summary* del flujo.
* **GitHub Actions:** una ejecución completa dura ~25–30 min (GDELT limita a una petición cada ~5 s). Dos al día son ~1.800 min/mes: gratis en repositorios públicos; en privados el plan gratuito da 2.000 min/mes, así que ajusta a una al día o usa Cloudflare/otro ejecutor.

## Por qué la rama `data`

Cada ejecución reescribe cientos de archivos. Si se guardaran en `main`, el historial crecería sin parar. Por eso los datos se publican en una rama `data` de **un solo commit** (se sobrescribe cada vez) y la web se construye con `main` + `data`. El estado ya clasificado se recupera de esa rama al empezar.

## Limitaciones que conviene conocer

* **Solo titulares:** la traducción y la clasificación parten del titular. Puede haber errores; la web lo avisa en pie de página.
* **Cobertura desigual:** GDELT tiene mucho material de unos países y casi nada de otros. Los temas sin noticias muestran «Hoy no hay noticias de este tema». Para mejorar un país concreto, añade feeds RSS en `config/feeds.json` (suelen traer descripción e imagen).
* **Imágenes:** se muestra la imagen de vista previa que publica cada medio, enlazada desde su servidor (no se copia ni se aloja). Si no carga, la web usa la ilustración del tema. Antes de lanzar la web al público, valora si necesitas permiso o un proveedor con imágenes licenciadas.
* **Datos personales y derechos:** define una vía para que un medio pida retirar sus contenidos y revisa las normas de los países donde operes.

## Lo que está probado y lo que no

* Probado (26 pruebas automáticas + ejecución completa con fuente simulada + prueba de la web con datos reales de España): lectura y normalización de GDELT y RSS, reintentos y límite de peticiones, identificadores estables, duplicados, clasificación con respuestas correctas y defectuosas, caducidad, reutilización, escritura de archivos y carga en la web.
* **No probado con servicios reales** (no tenía acceso a ellos): las llamadas reales a GDELT y a la API de Claude, y los flujos de GitHub (la sintaxis está validada, pero no se han ejecutado). Haz primero una ejecución con 2–3 países y revisa los resultados.
* **Nombres de país de GDELT:** GDELT acepta nombres sin espacios (`unitedkingdom`) o códigos FIPS (que **no** coinciden con ISO). El paso 4 comprueba y guarda automáticamente el que funciona para cada país.

## Siguiente fase (aún no incluida)

* **Debates públicos:** en claude.ai solo pueden escribir personas con sesión y permisos. Para abrirlo al público hace falta una base de datos propia (por ejemplo Supabase o Firebase) con registro o inicio de sesión, límites contra spam y un panel de moderación. La web ya usa el `id` de cada noticia como clave del debate; ahora el debate está oculto en la web independiente.
* **Más fuentes y mejores resúmenes** (RSS por país, o leer el texto de las noticias con permiso).
* **Ejecución más frecuente** para los países con más tráfico.

## Estructura

```
config/topics.json         los 48 temas (clave «grupo.tema»)
config/countries.json      países del mapa, nombre en español y candidatos de nombre para GDELT
config/gdelt-names.json    resultado del «probe» (nombre que funciona para cada país)
config/feeds.json          feeds RSS opcionales por país
scripts/update.mjs         orquesta la actualización
scripts/probe.mjs          descubre los nombres de país de GDELT
scripts/lib/               fuentes (GDELT, RSS), clasificador con Claude, lógica por país
scripts/test/              pruebas (node --test)
site/                      la web estática y los datos (site/data)
.github/workflows/         actualizar (2 veces al día), publicar, descubrir nombres
```
