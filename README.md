# Noche de Patas

Juego web de supervivencia y terror 2D (vista cenital). Estás atrapado de noche en un laboratorio
abandonado: encuentra 3 fusibles, reactiva el generador y escapa por Recepción. Te acechan un
**milpiés gigante** (olfato), una **araña camello** (oído) y un **ciempiés gigante** (luz).

Todo se genera por código: gráficos en Canvas/Phaser y audio sintetizado con Web Audio API.
No hay ni un solo archivo de imagen o sonido en el repositorio.

## Controles

| Acción | Tecla |
|---|---|
| Mover | WASD / flechas |
| Linterna on/off | Click izquierdo o `F` |
| Apuntar | Ratón |
| Correr (hace ruido) | `Shift` |
| Sigilo (casi silencioso, más lento) | `C` (o `Ctrl`) |
| Interactuar / esconderse | `E` |
| Lanzar botella | `Q` |
| Pausa (volumen) | `Esc` |
| Modo debug (ruido, rutas, estados, FPS) | `F3` |

> En algunos navegadores `Ctrl+W` cierra la pestaña: usa `C` para el sigilo.

**Cómo sobrevivir a cada criatura**

- **Milpiés** — lento pero siempre te encuentra. Mantén la linterna sobre él 1,5 s y se enrosca 5 s
  (bloqueando el pasillo). Luego tiene 20 s de recarga.
- **Araña camello** — ciega, solo oye. Quieto o en sigilo no te detecta. Lanza botellas para
  alejarla. Si corriste justo antes de esconderte, te olerá en el escondite.
- **Ciempiés** — vive en las rejillas y busca la luz. Si oyes golpes metálicos y la rejilla
  vibra, **apaga la linterna**. Si falla una embestida queda 2 s aturdido.

Noche 1: solo el milpiés · Noche 2: + araña · Noche 3: las tres + alarma del generador.
El progreso (noches desbloqueadas, volumen, mejores tiempos) se guarda en `localStorage`.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # comprueba tipos y genera dist/
npm run preview  # sirve dist/ para probar el build
```

Stack: Phaser 4.2 (Arcade Physics) + TypeScript + Vite. Todo el balance está en
[`src/data/tuning.ts`](src/data/tuning.ts). El mapa (40×28 casillas) está en
[`src/data/map.ts`](src/data/map.ts) y se regenera con `python3 tools/genmap.py`.

```
src/
  main.ts
  scenes/    Boot (aviso), Menu, Game, Pause, GameOver, Win
  entities/  Player, Creature (FSM + rutas + cadena de segmentos), Millipede, CamelSpider, Centipede
  systems/   MapBuilder, Pathfinding (A*), Lighting, NoiseSystem, AudioEngine, Hud, Textures, Save, Ui
  data/      map.ts, tuning.ts
```

## Publicar en itch.io

1. Crea el proyecto en `itch.io/game/new` con **Kind of project = HTML** (sin esto se ofrece como
   descarga). Tamaño del visor recomendado: 960×540, con botón de pantalla completa.
2. `npm run build`. El build usa rutas relativas (`base: './'`), así que `dist/` funciona tal cual.
3. Sube la carpeta con [butler](https://itchio.itch.io/butler):

   ```bash
   butler login
   butler push dist TU_USUARIO/noche-de-patas:html --userversion 1.0.0
   ```

   (o sube un `.zip` del **contenido** de `dist/` desde la web).
4. En *Edit game*, marca el archivo como **This file will be played in the browser** y guarda.
5. Para actualizar, vuelve a hacer `butler push` al **mismo** canal `html`.

En GitHub Pages basta con publicar el contenido de `dist/`.

## Decisiones

Decisiones no cubiertas por el brief, tomadas por la opción más simple que respeta los pilares:

- **Alarma solo en la Noche 3.** El escalado del brief la lista como novedad de la Noche 3; en las
  noches 1 y 2 el generador arranca en silencio y abre la salida.
- **El milpiés no te espera para siempre.** Frente a un escondite espera 9 s y luego se aleja 10 s;
  si no, un jugador escondido quedaría bloqueado sin salida posible.
- **El milpiés duerme 20 s al empezar** (o hasta que te acercas o suena la alarma), para que la
  Noche 1 sea un tutorial suave. Tras golpearte se queda quieto 4 s para que puedas huir cojeando.
- **Las criaturas abren las puertas cerradas** al pasar; el chirrido sirve de aviso sonoro.
- **Contacto con la araña:** muerde si te alcanza mientras caza un ruido. Si está quieta
  escuchando y tú estás quieto o en sigilo, rozarla no te delata (solo oye).
- **Escondido, la linterna se apaga** automáticamente y vuelve a su estado al salir.
- **Pistas visuales mínimas en la oscuridad:** fusibles y pilas emiten un destello tenue que solo
  se ve a menos de ~230 px, y la señal de salida brilla (roja = sin energía, verde = abierta).
- **Reparto de fusibles:** 3 salas distintas al azar, nunca en las salas pegadas a Recepción
  (≥ 420 px del inicio) y separados ≥ 300 px entre sí, para obligar a recorrer el laboratorio.
- **Luz y muebles:** todo lo que no puedes atravesar (muros, puertas cerradas, mesas, estanterías,
  casilleros, generador) también bloquea la luz y la línea de visión.
- **Sigilo:** 40 % de la velocidad al caminar; el personaje se agacha y el HUD indica el modo
  (SIGILO / CORRIENDO / AGOTADO / ESCONDIDO).
- **Los fusibles se pueden colocar de uno en uno** en el generador.
- **Se gana al llegar a la salida** una vez reactivado el generador (sin pulsar nada).
- **Pausa automática** si la ventana pierde el foco.
- **Rendimiento:** la oscuridad se calcula a media resolución en un canvas 2D (estética pixel y
  barata); las criaturas se dibujan con sprites generados por código y líneas para las patas, porque
  las curvas de `Graphics` se re-teselan cada frame en WebGL.
- **Fuente:** VT323 (licencia OFL), instalada con `@fontsource/vt323` y empaquetada por Vite en
  `dist/`. No hay peticiones externas ni binarios en el repositorio (la fuente vive en
  `node_modules`). Los tamaños de texto siguen una escala fija (16/20/24/32…) para que se vea nítida.
- **Cámara fija sobre el jugador**, sin retardo ni anticipación: si la cámara se queda atrás, el
  jugador se desplaza en pantalla y la linterna gira sola al caminar aunque no muevas el ratón.
- **Audio:** el audio interno de Phaser está desactivado (`noAudio`); el único `AudioContext` lo
  crea `AudioEngine` en el primer clic del aviso de contenido.
