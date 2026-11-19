# Genera src/data/map.ts. Ejecutar desde la raíz: python3 tools/genmap.py
W,H=40,28
g=[['#']*W for _ in range(H)]
def rect(x1,y1,x2,y2,c='.'):
    for y in range(y1,y2+1):
        for x in range(x1,x2+1): g[y][x]=c
def put(c,*pts):
    for x,y in pts: g[y][x]=c
rooms=[('Vestuario',1,1,8,7),('Laboratorio',10,1,18,7),('Oficina',20,1,26,7),('Cuarentena',28,1,38,7),
('Pasillo norte',1,9,38,10),('Almacén',1,12,11,19),('Comedor',13,12,23,19),('Conducto de servicio',25,11,25,20),
('Sala de máquinas',27,12,38,19),('Pasillo sur',1,21,38,22),('Enfermería',1,24,12,26),('Recepción',14,24,25,26),('Archivo',27,24,38,26)]
for r in rooms: rect(*r[1:])
put('.',(19,5),(19,4))
put('D',(4,8),(9,4),(14,8),(23,8),(33,8),(6,11),(3,20),(18,11),(15,20),(24,15),(26,16),(33,11),(6,23),(20,23),(32,23))
put('L',(1,1),(2,1),(4,1),(5,1),(7,1),(8,1),(26,1),(11,12),(38,15),(1,26),(28,24),(30,24),(35,24),(37,24))
put('k',(3,4),(4,4),(5,4),(20,1),(30,2),(31,2),(30,3),(31,3),(35,2),(36,2),(35,3),(36,3),
    (2,14),(3,14),(4,14),(5,14),(7,14),(8,14),(9,14),(10,14),(2,17),(3,17),(4,17),(5,17),(7,17),(8,17),(9,17),(10,17),
    (28,13),(29,13),(28,18),(29,18),(37,13),(37,18),(16,25),(17,25),(31,26),(32,26),(33,26))
put('T',(12,3),(13,3),(16,3),(17,3),(12,5),(13,5),(16,5),(17,5),(22,3),(23,3),(33,6),
    (15,14),(16,14),(20,14),(21,14),(15,17),(16,17),(20,17),(21,17),(2,24),(4,24),(9,24),(11,24))
put('G',(32,15),(33,15))
put('X',(19,27),(20,27))
put('V',(15,0),(24,0),(39,4),(0,15),(12,16),(26,13),(39,17),(8,27),(34,27),(19,8),(30,20))
put('f',(6,6),(11,7),(25,6),(37,6),(29,6),(10,18),(23,18),(12,26),(38,26),(1,7))
put('b',(2,7),(18,1),(20,7),(1,19),(13,19),(25,17),(38,12),(38,21),(13,26),(28,7))
put('o',(7,10),(30,9),(5,12),(22,12),(36,19),(10,26),(26,25))
put('P',(23,25)); put('M',(3,3)); put('S',(6,15))
rows=[''.join(r) for r in g]
assert all(len(r)==W for r in rows) and len(rows)==H
out=['// Generado a mano (ver scratch genmap.py). Leyenda en MapBuilder.ts','// # muro  . suelo  D puerta  L casillero(escondite)  T mesa(escondite)  k mueble sólido','// V rejilla  G generador  X salida  f/b/o candidatos fusible/pila/botella  P/M/S inicios','export const MAP_ROWS: string[] = [']
out+=[f"  '{r}'," for r in rows]
out.append('];\n')
out.append('export interface RoomDef { name: string; x1: number; y1: number; x2: number; y2: number; }')
out.append('export const ROOMS: RoomDef[] = [')
for n,x1,y1,x2,y2 in rooms: out.append(f"  {{ name: '{n}', x1: {x1}, y1: {y1}, x2: {x2}, y2: {y2} }},")
out.append('];\n')
open('src/data/map.ts','w').write('\n'.join(out))
print('\n'.join(rows))
