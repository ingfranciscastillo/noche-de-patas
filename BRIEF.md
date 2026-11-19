# BRIEF — "NOCHE DE PATAS" (juego web de terror 2D)

> Brief para Claude Code. Léelo completo antes de escribir código. Construye por hitos (sección 10) y verifica cada uno corriendo el juego antes de pasar al siguiente.

## 1. Concepto

Juego de **supervivencia y terror 2D, vista cenital (top-down)**, que corre en el navegador. El jugador está atrapado de noche en un laboratorio abandonado lleno de criaturas reales que dan asco y miedo: **milpiés gigante africano, araña camello y ciempiés gigante**. Debe encontrar 3 fusibles, reactivar el generador y escapar.

**Pilares de diseño**
1. **El miedo viene del comportamiento, no del tamaño.** Cada criatura tiene un sentido distinto y el jugador debe aprender su regla.
2. **Ver poco, oír mucho.** Oscuridad casi total, linterna con cono limitado, audio espacial como herramienta principal.
3. **Partida corta y rejugable:** 8–12 minutos.
4. **Cero assets externos.** Todo se dibuja por código (Canvas/vector) y todo el audio se sintetiza con Web Audio API. Así el proyecto es autocontenido.

## 2. Stack técnico

- **Phaser 4** (Arcade Physics) + **TypeScript** + **Vite**.
- Sin backend. Build estático (`npm run build` → `dist/`) listo para itch.io o GitHub Pages.
- Audio: **Web Audio API** directo (osciladores, ruido filtrado, paneo estéreo). Sin archivos de sonido.
- Gráficos: `Phaser.GameObjects.Graphics` / RenderTexture. Sin imágenes externas.
- Resolución lógica 960×540, escalado `FIT`, centrado. Debe funcionar en desktop (teclado + ratón). Móvil queda fuera de alcance.

Estructura sugerida:
```
src/
  main.ts
  scenes/ Boot, Menu, Game, GameOver, Win
  entities/ Player, Creature(base), Millipede, CamelSpider, Centipede
  systems/ Lighting, NoiseSystem, AudioEngine, MapBuilder, Hud
  data/ map.ts, tuning.ts   // todos los números de balance aquí
```

## 3. Controles

| Acción | Tecla |
|---|---|
| Mover | WASD / flechas |
| Linterna on/off | Click izq. o `F` |
| Apuntar | Ratón (la linterna sigue al cursor) |
| Correr | `Shift` (hace ruido) |
| Agacharse / caminar sigiloso | `Ctrl` o `C` (casi silencioso, más lento) |
| Interactuar / esconderse | `E` |
| Pausa | `Esc` |

## 4. Mecánicas centrales

**Visión y linterna**
- Pantalla casi negra. Solo se ve un círculo muy pequeño alrededor del jugador (radio ~40 px) más el **cono de la linterna** (ángulo ~55°, alcance ~260 px).
- Implementar con una capa de oscuridad (RenderTexture/máscara) sobre el mundo. Las paredes bloquean la luz (raycast simple contra los muros).
- La linterna tiene **batería** (100%, drena ~1%/s encendida). Hay pilas en el mapa (+35%). Con batería en 0 queda solo el círculo mínimo.

**Ruido**
- Cada acción emite un radio de ruido: quieto 0, sigiloso ~40 px, caminar ~120 px, correr ~280 px, abrir puertas/recoger objetos ~160 px.
- `NoiseSystem` emite eventos `{x, y, radius}` que las criaturas pueden "oír". Mostrar en modo debug (`F3`) como círculos.

**Resistencia (stamina):** correr consume, se recupera quieto. Agotado = jadeo audible (más ruido).

**Esconderse:** muebles marcados (casilleros, mesas) con `E`. Dentro, las criaturas pierden al jugador salvo que ya estén encima; la araña camello puede olfatear el escondite si el jugador hizo ruido justo antes (ver 5.2).

**Salud:** 2 golpes. Primer golpe = pantalla roja, 3 s de cojera y sangre en el HUD. Segundo = muerte.

**Objetivo:** recoger 3 fusibles (distribuidos en salas distintas), colocarlos en el generador (al hacerlo suena una alarma que **atrae a todas las criaturas** al generador durante 20 s), y salir por la puerta de escape.

## 5. Criaturas (cada una con un sentido distinto)

Todas heredan de `Creature` con una máquina de estados simple: `IDLE/PATROL → ALERT → CHASE → ATTACK → STUNNED/RETREAT`. Los números van en `data/tuning.ts`.

### 5.1 Milpiés gigante africano — "El Inevitable" (sentido: olfato)
- **Aspecto:** cuerpo segmentado muy largo (14–18 segmentos que siguen a la cabeza con retardo, tipo serpiente), color marrón rojizo oscuro, cientos de patas diminutas animadas con ondas.
- **Comportamiento:** lento (~45 px/s) pero **siempre sabe dónde está el jugador aproximadamente**; camina directo hacia él con pathfinding (A* sobre grid). No lo pierde escondiéndose, solo se detiene frente al escondite y espera.
- **Debilidad:** si la linterna lo ilumina directamente 1.5 s se **enrosca en espiral** y queda inmóvil 5 s (cooldown 20 s). Un enroscado bloquea el pasillo, lo que obliga a rodear.
- **Amenaza:** su cuerpo largo bloquea rutas; acorrala al jugador.
- **Audio:** roce constante y húmedo, suave; se hace más fuerte al acercarse.

### 5.2 Araña camello (solífugo) — "La Mordedora" (sentido: oído)
- **Aspecto:** cuerpo peludo claro-amarillento, quelíceros (mandíbulas) enormes que se abren y cierran, 8 patas más un par de pedipalpos delante.
- **Comportamiento:** ciega al ruido. Patrulla errática; si oye un ruido, va **en zigzag** hacia el origen a gran velocidad (~230 px/s en ráfagas de 0.6 s con pausas de 0.4 s). Mientras el jugador esté **quieto o sigiloso no lo oye**, aunque lo tenga cerca.
- **Debilidad:** se puede **distraer lanzando objetos** (botella/tuerca, tecla `Q`, 3 en el mapa) que hacen ruido en otro punto. Tras morder una vez, huye 6 s.
- **Escondites:** si el jugador corrió hace menos de 4 s antes de esconderse, la araña lo detecta igual y sacude el mueble.
- **Audio:** chasquido seco de patas muy rápido que **solo suena cuando está cerca**. El silencio repentino significa que se detuvo a escuchar.

### 5.3 Ciempiés gigante — "El Acechador" (sentido: luz)
- **Aspecto:** cuerpo aplanado de 20+ segmentos, naranja-rojizo con patas amarillentas, antenas, mandíbulas con veneno. Movimiento ondulante muy fluido.
- **Comportamiento:** vive en **conductos y grietas** (marcadas por rejillas en paredes). Se siente atraído por la **linterna encendida**: si ve luz dentro de su radio (~350 px) sale de una rejilla y ataca en embestidas rápidas.
- **Regla clave:** apagar la linterna lo hace perder al jugador. Esto crea tensión: ver el entorno o esconderse en la oscuridad.
- **Telegrafía:** antes de salir, la rejilla vibra y se oye un golpeteo metálico (1.2 s). Esta es la advertencia justa.
- **Debilidad:** tras fallar una embestida queda 2 s expuesto y desorientado.
- **Audio:** repiqueteo metálico dentro de las paredes, siseo grave al salir.

### 5.4 Escalado
- **Noche 1 (tutorial suave):** solo milpiés.
- **Noche 2:** milpiés + araña camello.
- **Noche 3:** las tres, más la alarma del generador.
Una "noche" = una partida completa. El jugador desbloquea la siguiente al ganar. Se guarda el progreso en `localStorage`.

## 6. Mapa

- Un solo nivel hecho a mano en `data/map.ts` como grid (tiles de 32 px), ~40×28 tiles: laboratorio abandonado con ~8 salas (almacén, sala de cuarentena, comedor, sala de máquinas…), pasillos estrechos y 2 bucles para poder rodear criaturas.
- Elementos: muros, puertas (abrir = ruido), muebles escondite, rejillas de ventilación (Centipede), pilas, fusibles, botellas lanzables, generador, salida.
- Fusibles y pilas en posiciones **semialeatorias** (varios candidatos por objeto) para rejugabilidad.
- Construir colisiones desde el grid; usar el mismo grid para A*.

## 7. Dirección visual

- Paleta fría y desaturada (grises azulados, verdes enfermizos) con las criaturas en tonos cálidos para destacar al entrar en la luz.
- Pixel-art generado por código o vectores simples con bordes duros; **sin suavizado** (`pixelArt: true`).
- Efectos: viñeta fuerte, grano de película sutil, parpadeo ocasional de la luz, sacudida de cámara al ser golpeado, aberración cromática breve al recibir daño.
- Los cuerpos segmentados se animan con interpolación (cada segmento sigue al anterior a distancia fija).
- **Sin gore explícito.** El miedo es de acecho, no de sangre.

## 8. Audio (todo sintetizado)

Crear `AudioEngine` con:
- Ambiente: drone grave continuo + goteo/crujidos aleatorios.
- Paneo estéreo y volumen según posición de cada criatura respecto al jugador (`StereoPannerNode` + `GainNode`).
- Latido que se acelera según proximidad de la amenaza más cercana.
- Efectos: pasos (ruido filtrado, distinto sigiloso/caminar/correr), puerta, pila, fusible, alarma, golpe, muerte.
- Respetar la política de autoplay: iniciar el `AudioContext` en el primer click del menú.
- Slider de volumen maestro en menú de pausa.

## 9. UI / HUD

- Mínimo y diegético: barra de batería (icono de pila), indicador de stamina (círculo alrededor del jugador, solo al cambiar), 2 corazones de salud, contador de fusibles `0/3`.
- Menú principal: título, "Jugar", "Controles", selección de noche (bloqueadas hasta ganar la anterior).
- Pantalla de Game Over (tiempo sobrevivido, causa: "te atrapó el milpiés" / "te oyó la araña" / "te vio el ciempiés") y de victoria.
- **Idioma: español** para toda la interfaz y textos.
- Aviso de contenido al inicio: "Contiene insectos y criaturas inquietantes, sustos repentinos y luces parpadeantes."

## 10. Hitos (en este orden)

1. **Base:** proyecto Vite+TS+Phaser, escena de juego, jugador que se mueve con colisiones, mapa desde grid, debug (`F3`).
2. **Luz:** capa de oscuridad, linterna con cono y bloqueo por paredes, batería.
3. **Ruido y stamina:** `NoiseSystem`, correr/sigilo, visualización debug.
4. **Milpiés:** cuerpo segmentado, A*, estado enroscado con la luz. *Jugable la Noche 1 completa* (fusibles → generador → salida).
5. **Audio:** `AudioEngine` con ambiente, pasos, paneo, latido y sonidos del milpiés.
6. **Araña camello:** oído, zigzag, objetos lanzables, escondites.
7. **Ciempiés:** rejillas, atracción por luz, telegrafía, embestida.
8. **Pulido:** menús, progresión de noches con `localStorage`, efectos de pantalla, Game Over/Victoria, ajuste de balance.
9. **Build y entrega:** `npm run build`, README corto con controles y cómo desplegar en itch.io.

## 11. Criterios de aceptación

- Corre a 60 FPS en un portátil medio con las 3 criaturas activas.
- Cada criatura se puede sobrevivir **aplicando su regla** (milpiés: luz; araña: silencio/distracción; ciempiés: apagar linterna) y es injusto morir sin una pista previa (sonido, vibración).
- Una partida completa de la Noche 3 dura 8–12 minutos y es ganable.
- Ningún asset binario en el repo (solo código).
- Sin errores en consola al jugar, pausar y reiniciar 5 veces seguidas.
- El audio no suena antes de la primera interacción del usuario.

## 12. Fuera de alcance (por ahora)

Móvil/táctil, multijugador, más de un mapa, cinemáticas, tienda de mejoras, generación procedural de mapas, traducciones a otros idiomas.

## 13. Notas para Claude Code

- Pon **todo el balance** (velocidades, radios, cooldowns, daño) en `data/tuning.ts` para ajustarlo fácil.
- Tras cada hito: arranca `npm run dev`, juega unos minutos y corrige antes de seguir. No acumules hitos sin probar.
- Haz un commit por hito con mensaje claro.
- Si una decisión no está cubierta aquí, elige la opción más simple que cumpla los pilares de diseño y anótala en el README bajo "Decisiones".
