/*
 * ai.js - Carros IA + Pedestres IA para WebGL-GTA (ATG1)
 *
 * Convencoes (ver CLAUDE.md - confirmadas no jogo ao vivo):
 *   Geometria das ruas: descoberta varrendo game.map.base por type==2 (asfalto).
 *     NAO ha rua hardcoded (o antigo "x=512" estava ERRADO).
 *     getBlock(x,y,z) = [round(x/64), -round(y/64), round(z/64)], tile 64x64.
 *   Rotacao do sprite de carro:
 *     heading = atan2(dy, dx)   (0=Leste, PI/2=Norte/+y, PI=Oeste, -PI/2=Sul/-y)
 *     sprite.rotation.z = heading + PI/2   (mesma convencao p/ player e pedestres)
 *   Carros IA vivem em GTA.aiCarsPath (sprites, sem Box2D). O carro do player
 *     vive em GTA.allCars (Box2D). Nunca misturar os dois.
 */

// Armazena carros IA separados de GTA.allCars (que e do player)
GTA.aiCarsPath = GTA.aiCarsPath || [];
GTA._aiUsedBuckets = GTA._aiUsedBuckets || {};
GTA._aiStarted = GTA._aiStarted || false;
GTA.allCars = GTA.allCars || [];

GTA._AI_OFF = 16;
GTA._aiClean = [58, 29, 41, 27, 13, 9, 28, 6, 21, 34, 2, 37];

GTA._aiTopType = function ( base, c, r ) {
    var col = base[c]; if (!col) return -1;
    var cell = col[r]; if (!cell || !cell.blocks) return -1;
    for (var z = cell.blocks.length - 1; z >= 0; z--) { var b = cell.blocks[z]; if (b && b.type != null) return b.type; }
    return -1;
};

GTA._placeAICar = function ( car ) {
    var p = car._path;
    // Anel: progresso circular (modulo). Rua reta (vai-e-volta): clampa em [0,total]
    // — usar modulo levaria progress==total de volta a 0 (teleporte no frame do retorno).
    var d;
    if (p.isRing) { d = p.progress % p.total; if (d < 0) d += p.total; }
    else { d = p.progress; if (d < 0) d = 0; else if (d > p.total) d = p.total; }
    var acc = 0, seg = p.segs[0], t = 0;
    for (var i = 0; i < p.segs.length; i++) {
        if (d <= acc + p.segs[i].len || i === p.segs.length - 1) { seg = p.segs[i]; t = seg.len > 0 ? (d - acc) / seg.len : 0; break; }
        acc += p.segs[i].len;
    }
    if (t < 0) t = 0; if (t > 1) t = 1;
    var bx = seg.x0 + seg.dx * t, by = seg.y0 + seg.dy * t;
    var dir = p.dir || 1;
    var ux = seg.ux * dir, uy = seg.uy * dir; // heading efetivo (sentido de viagem)
    // Centraliza o carro no CENTRO da sua faixa (mao direita), nao no centro do tile de cima.
    // A via tem 2 tiles; acha o par pelo mapa e poe o carro a 32px (meia-largura de tile) do
    // centro da via, do lado direito do sentido -> mao dupla certinha, entre as faixas amarelas.
    var g = window._gtaGame, base = g && g.map && g.map.base;
    if (Math.abs(seg.ux) >= Math.abs(seg.uy)) {
        // via horizontal: faixas empilhadas em Y; +y = norte, -y = sul
        var tc = Math.round(bx / 64), tr = -Math.round(by / 64), cenY = by;
        if (base && GTA._aiTopType(base, tc, tr + 1) === 2) cenY = -(64 * tr + 64);
        else if (base && GTA._aiTopType(base, tc, tr - 1) === 2) cenY = -(64 * tr);
        car.sprite.position.x = bx;
        car.sprite.position.y = (ux > 0) ? cenY - 32 : cenY + 32; // leste->faixa sul, oeste->norte
    } else {
        // via vertical: faixas lado a lado em X
        var tc2 = Math.round(bx / 64), tr2 = -Math.round(by / 64), cenX = bx;
        if (base && GTA._aiTopType(base, tc2 + 1, tr2) === 2) cenX = 64 * tc2 + 64;
        else if (base && GTA._aiTopType(base, tc2 - 1, tr2) === 2) cenX = 64 * tc2;
        car.sprite.position.x = (uy > 0) ? cenX + 32 : cenX - 32; // norte->faixa leste, sul->oeste
        car.sprite.position.y = by;
    }
    car.sprite.rotation.z = (dir > 0 ? seg.ang : seg.ang + Math.PI) + Math.PI / 2;
    car._hx = ux; car._hy = uy; // heading efetivo (sentido de viagem), usado pelo anti-sobreposicao
};

// Cor de fabrica ORIGINAL: cada modelo tem 12 remaps HLS no .G24 (car.remap[i] = {h,l,s}).
// Aproximamos o palette-shift com um tint HSL->RGB. Clamps de seguranca: nunca escurece
// demais (l>=0.55) nem satura demais (s<=0.6); remap zerado (0,0,0) = cor de fabrica base -> sem tint.
GTA._factoryPaint = function ( car, mdl ) {
    try {
        if (!mdl || !mdl.remap || !mdl.remap.length) return;
        var rm = mdl.remap[(Math.random() * mdl.remap.length) | 0];
        if (!rm || (!rm.h && !rm.l && !rm.s)) return; // base: mantem textura pura
        var h = (((rm.h % 256) + 256) % 256) / 255;
        var s = Math.min(0.6, Math.abs(rm.s) / 255);
        var l = Math.min(0.92, Math.max(0.55, 0.55 + Math.abs(rm.l) / 255 * 0.37));
        // HSL -> RGB (proprio, r49 nao tem setHSL)
        function hue(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; }
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        var r = hue(p, q, h + 1/3), gg = hue(p, q, h), b = hue(p, q, h - 1/3);
        var hex = ((r * 255) << 16) | ((gg * 255) << 8) | (b * 255 | 0);
        var sp = car.sprite; if (!sp || !sp.material) return;
        if (!sp._dmgMatCloned) { sp.material = new THREE.MeshBasicMaterial({ map: sp.material.map, transparent: true }); sp._dmgMatCloned = true; }
        sp.material.color.setHex(hex);
    } catch (e) {}
};

GTA._aiMk = function ( game, pts, CLEAN, startFrac, key ) {
    var idx = GTA.aiCarsPath.length;
    try {
        var car = new GTA.GameObjectPosition();
        car.addCar(game, GTA._aiClean[idx % GTA._aiClean.length], 0, 0, 0, 0);
        var mdl = game.cars[car.type]; // addCar nao copia dims -> puxa do modelo (px de mundo)
        if (mdl) { if (mdl.width) car.width = mdl.width; if (mdl.height) car.height = mdl.height; }
        GTA._factoryPaint(car, mdl); // cor de fabrica ORIGINAL (remap HLS do .G24)
        car._hl = Math.max(car.width || 40, car.height || 80) * 0.5; // meio-comprimento real p/ seguimento E carRadius
        var segs = [], total = 0;
        for (var i = 0; i < pts.length - 1; i++) { var dx = pts[i+1][0]-pts[i][0], dy = pts[i+1][1]-pts[i][1], len = Math.sqrt(dx*dx+dy*dy); segs.push({ x0:pts[i][0], y0:pts[i][1], dx:dx, dy:dy, len:len, ux:len>0?dx/len:0, uy:len>0?dy/len:0, ang:Math.atan2(dy,dx) }); total += len; }
        // Velocidade autentica do modelo original (maxSpeed ~5..32 nas unidades do GTA1; *3.4 -> px/s).
        var speed = Math.max(22, Math.min(110, ((mdl && mdl.maxSpeed) ? mdl.maxSpeed : 24) * 3.4));
        var isRing = (pts.length > 2 && pts[0][0] === pts[pts.length-1][0] && pts[0][1] === pts[pts.length-1][1]);
        car._path = { pts:pts, segs:segs, total:total, speed:speed, progress:startFrac*total, dir:1, isRing:isRing, _dmgCooldown:0 };
        car._bk = key;
        GTA._placeAICar(car); if (!GTA._aiInitFlow(car, game)) return false; // estado de fluxo a partir do tile do spawn
        car.sprite.position.z = 128 + (idx%6); game.scene.add(car.sprite); GTA.aiCarsPath.push(car);
        return true;
    } catch (e) { return false; }
};

GTA.disableAICar = function ( car ) {
    var i = GTA.aiCarsPath.indexOf(car); if (i >= 0) GTA.aiCarsPath.splice(i, 1);
    if (car._bk && GTA._aiUsedBuckets) delete GTA._aiUsedBuckets[car._bk];
    if (!car.physics) {
        try {
            car.x = car.sprite.position.x + 64; car.y = 64 - car.sprite.position.y;
            car.z = 128; car.rotation = car.sprite.rotation.z;
            car.initPhysics(window._gtaGame);
            if (GTA.allCars.indexOf(car) < 0) GTA.allCars.push(car);
        } catch (e) { GTA.Log('steal err: ' + e.message); }
    }
};

GTA._aiPass = function ( game ) {
    var WIN = 24, REG = 7, MAX = 50, CARS_PER = 2, RECYCLE = 4500, OFFSCR = 700, EXT = 40;
    var base = game.map.base, used = GTA._aiUsedBuckets;
    var cam = game.camera.position, cx = cam.x, cy = cam.y;
    for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) { var c = GTA.aiCarsPath[i]; var dx = c.sprite.position.x - cx, dy = c.sprite.position.y - cy; if (Math.sqrt(dx*dx+dy*dy) > RECYCLE) { try { game.scene.remove(c.sprite); } catch (e) {} if (c._bk) delete used[c._bk]; GTA.aiCarsPath.splice(i, 1); } }
    function road(cc, rr) { return GTA._aiTopType(base, cc, rr) === 2; }
    function wt(x, y) { return GTA._aiTopType(base, Math.round(x/64), -Math.round(y/64)); }
    function widthX(c, r) { var n = 1, k = c-1; while (road(k,r)) { n++; k--; } k = c+1; while (road(k,r)) { n++; k++; } return n; }
    function heightY(c, r) { var n = 1, k = r-1; while (road(c,k)) { n++; k--; } k = r+1; while (road(c,k)) { n++; k++; } return n; }
    function valid(pts) { for (var s = 0; s < pts.length - 1; s++) { var x0 = pts[s][0], y0 = pts[s][1], x1 = pts[s+1][0], y1 = pts[s+1][1], dx = x1-x0, dy = y1-y0, len = Math.sqrt(dx*dx+dy*dy); if (len < 1) continue; var ux = dx/len, uy = dy/len, px = -uy, py = ux, st = Math.max(2, Math.round(len/18)); for (var i = 0; i <= st; i++) { var t = i/st, x = x0+dx*t, y = y0+dy*t; if (wt(x+px*26,y+py*26)!==2 || wt(x-px*26,y-py*26)!==2 || wt(x,y)!==2) return false; } } return true; }
    function posAt(pts, frac) { var segs = [], total = 0; for (var i = 0; i < pts.length-1; i++) { var dx = pts[i+1][0]-pts[i][0], dy = pts[i+1][1]-pts[i][1], len = Math.sqrt(dx*dx+dy*dy); segs.push({ x0:pts[i][0], y0:pts[i][1], dx:dx, dy:dy, len:len }); total += len; } var d = frac*total, acc = 0; for (var i = 0; i < segs.length; i++) { if (d <= acc+segs[i].len || i === segs.length-1) { var t = segs[i].len>0?(d-acc)/segs[i].len:0; return [segs[i].x0+segs[i].dx*t, segs[i].y0+segs[i].dy*t]; } acc += segs[i].len; } }
    function emit(pts, key) { if (GTA.aiCarsPath.length >= MAX) return; var offs = []; for (var f = 0; f < 1; f += 0.05) { var p = posAt(pts, f); if (Math.sqrt((p[0]-cx)*(p[0]-cx)+(p[1]-cy)*(p[1]-cy)) > OFFSCR) offs.push(f); } if (offs.length === 0) return; var chosen = [offs[0]]; for (var k = 1; k < offs.length && chosen.length < CARS_PER; k++) { if (offs[k] - chosen[chosen.length-1] > 0.45) chosen.push(offs[k]); } chosen.forEach(function (f) { if (GTA.aiCarsPath.length < MAX) GTA._aiMk(game, pts, GTA._aiClean, f, key); }); used[key] = 1; }
    var rc = Math.round(cx/64), rr0 = -Math.round(cy/64);
    var C0 = Math.max(3, rc-WIN), C1 = Math.min(251, rc+WIN), R0 = Math.max(3, rr0-WIN), R1 = Math.min(252, rr0+WIN);
    var H = [], V = [];
    // Corredor (par de linhas r,r+1) consome a faixa-de-baixo (r+1): proxima faixa comeca em r+2.
    // Assim uma pista LARGA vira N corredores SEM sobreposicao (faixas limpas) em vez de N-1 runs
    // empilhados/atravessados. Inerte numa rua de 2 tiles (r+2 nao e' asfalto). Idem vertical.
    var _hcl = {};
    for (var r = R0; r <= R1; r++) { var c = C0; while (c < C1) { if (road(c,r) && road(c,r+1) && !_hcl[c+'_'+r]) { var c0 = c; while (c < C1 && road(c,r) && road(c,r+1) && !_hcl[c+'_'+r]) c++; if ((c-c0) >= 4) { H.push({ r:r, c0:c0, c1:c-1, len:c-c0 }); for (var hc = c0; hc < c; hc++) _hcl[hc+'_'+(r+1)] = 1; } } else c++; } }
    var _vcl = {};
    for (var cc = C0; cc <= C1; cc++) { var r2 = R0; while (r2 < R1) { if (road(cc,r2) && road(cc+1,r2) && !_vcl[cc+'_'+r2]) { var r0 = r2; while (r2 < R1 && road(cc,r2) && road(cc+1,r2) && !_vcl[cc+'_'+r2]) r2++; if ((r2-r0) >= 4) { V.push({ c:cc, r0:r0, r1:r2-1, len:r2-r0 }); for (var vr = r0; vr < r2; vr++) _vcl[(cc+1)+'_'+vr] = 1; } } else r2++; } }
    // Remove "runs fantasma": faixas curtas interiores a um bloco de asfalto (pista larga/praca),
    // cercadas por asfalto nos 2 lados perpendiculares ao longo de TODO o comprimento. Sem isso o
    // buscador de rotas turva entre as faixas da pista larga (zigue-zague "atravessando").
    // Inerte em rua normal de 2 tiles (um lado e' predio) -> nao regride a malha comum.
    function hInterior(h) { if (h.len > 6) return false; for (var ci = h.c0; ci <= h.c1; ci++) if (!(road(ci,h.r-1) && road(ci,h.r+2))) return false; return true; }
    function vInterior(v) { if (v.len > 6) return false; for (var ri = v.r0; ri <= v.r1; ri++) if (!(road(v.c-1,ri) && road(v.c+2,ri))) return false; return true; }
    H = H.filter(function (h) { return !hInterior(h); });
    V = V.filter(function (v) { return !vInterior(v); });
    function bk(r, c) { return Math.floor(r/REG) + '_' + Math.floor(c/REG); }
    for (var i2 = 0; i2 < H.length; i2++) { if (GTA.aiCarsPath.length >= MAX) break; var a = H[i2]; for (var j = 0; j < H.length; j++) { var b = H[j]; var gap = b.r - a.r; if (gap < 4 || gap > 16) continue; var ovL = Math.max(a.c0,b.c0), ovR = Math.min(a.c1,b.c1); if (ovR-ovL < 4) continue; var sides = []; for (var k = 0; k < V.length; k++) { var v = V[k]; if (v.c>=ovL && v.c<=ovR && v.r0<=a.r && v.r1>=b.r) sides.push(v.c); } if (sides.length < 2) continue; var cL = Math.min.apply(0,sides), cR = Math.max.apply(0,sides); if (cR-cL < 4 || cR-cL > 16) continue; var midC = Math.round((cL+cR)/2), midR = Math.round((a.r+b.r)/2); if (road(midC, midR)) continue; var key = bk(a.r, (cL+cR)/2); if (used[key]) continue; var tY = -(64*a.r+32), bY = -(64*b.r+32), lX = 64*cL+32, rX = 64*cR+32; var ring = [[lX,tY],[rX,tY],[rX,bY],[lX,bY],[lX,tY]]; if (valid(ring)) emit(ring, key); } }
    // --- Rotas que andam pela malha e VIRAM nos cruzamentos (grafo de ruas) ---
    // Cada rua de 2 tiles vira um "run" (H/V). Cruzamento = run H que cruza run V.
    // O carro caminha por um run e, ao chegar num cruzamento, as vezes vira (curva).
    function ixHV(h, v) { return (v.c >= h.c0 && v.c <= h.c1 && h.r >= v.r0 && h.r <= v.r1); }
    function crossOfH(h) { var xs = []; for (var k = 0; k < V.length; k++) if (ixHV(h, V[k])) xs.push(V[k]); xs.sort(function (a, b) { return a.c - b.c; }); return xs; }
    function crossOfV(v) { var ys = []; for (var k = 0; k < H.length; k++) if (ixHV(H[k], v)) ys.push(H[k]); ys.sort(function (a, b) { return a.r - b.r; }); return ys; }
    function nodeXY(c, r) { return [64*c+32, -(64*r+32)]; }
    // Remove pontos colineares/esporoes: mantem so os vertices (curvas) + extremos.
    function simplifyRoute(pts) {
        var a = [pts[0]];
        for (var i = 1; i < pts.length; i++) { var p = pts[i], q = a[a.length-1]; if (Math.abs(p[0]-q[0]) > 1 || Math.abs(p[1]-q[1]) > 1) a.push(p); }
        if (a.length < 3) return a;
        var out = [a[0]];
        for (var i = 1; i < a.length-1; i++) { var pr = out[out.length-1], cu = a[i], nx = a[i+1]; var h1 = Math.abs(cu[0]-pr[0]) > 1, h2 = Math.abs(nx[0]-cu[0]) > 1; if (h1 !== h2) out.push(cu); }
        out.push(a[a.length-1]);
        var d = [out[0]];
        for (var i = 1; i < out.length; i++) { var p = out[i], q = d[d.length-1]; if (Math.abs(p[0]-q[0]) > 1 || Math.abs(p[1]-q[1]) > 1) d.push(p); }
        return d;
    }
    function buildRoute() {
        if (!H.length || !V.length) return null;
        var curH = H[Math.floor(Math.random()*H.length)];
        var xs = crossOfH(curH); if (xs.length < 2) return null;
        var curV = xs[Math.floor(Math.random()*xs.length)], onH = true;
        var pts = [nodeXY(curV.c, curH.r)], turns = 0, steps = 0, dir = (Math.random()<0.5)?1:-1, i;
        while (steps++ < 8 && turns < 3) {
            if (onH) {
                var arr = crossOfH(curH), pos = -1; for (i = 0; i < arr.length; i++) if (arr[i].c === curV.c) { pos = i; break; }
                var ni = pos + dir; if (ni < 0 || ni >= arr.length) { dir = -dir; ni = pos + dir; if (ni < 0 || ni >= arr.length) break; }
                curV = arr[ni]; pts.push(nodeXY(curV.c, curH.r));
                if (Math.random() < 0.55) { var vy = crossOfV(curV), vp = -1; for (i = 0; i < vy.length; i++) if (vy[i].r === curH.r) { vp = i; break; } var vd = (Math.random()<0.5)?1:-1, nj = vp+vd; if (nj<0||nj>=vy.length){vd=-vd;nj=vp+vd;} if (nj>=0&&nj<vy.length){ curH = vy[nj]; onH = false; dir = vd; pts.push(nodeXY(curV.c, curH.r)); turns++; } }
            } else {
                var vy2 = crossOfV(curV), vp2 = -1; for (i = 0; i < vy2.length; i++) if (vy2[i].r === curH.r) { vp2 = i; break; }
                var nj2 = vp2 + dir; if (nj2 < 0 || nj2 >= vy2.length) { dir = -dir; nj2 = vp2 + dir; if (nj2 < 0 || nj2 >= vy2.length) break; }
                curH = vy2[nj2]; pts.push(nodeXY(curV.c, curH.r));
                if (Math.random() < 0.55) { var arr2 = crossOfH(curH), pos2 = -1; for (i = 0; i < arr2.length; i++) if (arr2[i].c === curV.c) { pos2 = i; break; } var hd = (Math.random()<0.5)?1:-1, ni2 = pos2+hd; if (ni2<0||ni2>=arr2.length){hd=-hd;ni2=pos2+hd;} if (ni2>=0&&ni2<arr2.length){ curV = arr2[ni2]; onH = true; dir = hd; pts.push(nodeXY(curV.c, curH.r)); turns++; } }
            }
        }
        var sp = simplifyRoute(pts);
        // Apara tocos curtos (<=1 tile) nas pontas: senao o carro "cruza a pista" 1 tile e volta.
        function seglen(a, b) { return Math.sqrt((b[0]-a[0])*(b[0]-a[0]) + (b[1]-a[1])*(b[1]-a[1])); }
        if (sp.length >= 3 && seglen(sp[0], sp[1]) < 96) sp = sp.slice(1);
        if (sp.length >= 3 && seglen(sp[sp.length-2], sp[sp.length-1]) < 96) sp = sp.slice(0, sp.length-1);
        return sp;
    }
    for (var s = 0; s < 40; s++) {
        if (GTA.aiCarsPath.length >= MAX) break;
        var rt = buildRoute(); if (!rt || rt.length < 2) continue;
        var rkey = bk(-Math.round(rt[0][1]/64), Math.round(rt[0][0]/64)); if (used[rkey]) continue;
        if (valid(rt)) emit(rt, rkey);
    }
    return 0;
};

GTA.spawnAICars = function ( game ) {
    if (GTA._aiStarted) return;
    GTA._aiStarted = true; GTA._aiUsedBuckets = {};
    GTA._aiPass(game);
    GTA._aiInterval = setInterval(function () { try { GTA._aiPass(game); } catch (e) {} }, 2000);
    GTA.Log('AI: trafego (rotas longas) iniciado');
};

// Seguimento suave (car-following) como no GTA1: em vez de liga/desliga, o carro DESACELERA
// ao se aproximar do de frente e PARA encostado (sem sobrepor), mantendo distancia natural.
// Retorna um fator de velocidade [0..1] = o menor entre todos os obstaculos da SUA faixa.
//   stop = meia-soma dos comprimentos + folga (encosta sem montar) ; ZONE = banda de frenagem.
//   Mesma direcao -> fila. Cruzamento perpendicular/parado -> so o de MAIOR indice cede
//   (ordem total => sem deadlock). Player/destroco a frente -> sempre cede.
GTA._aiSpeedFactor = function ( car, snap, selfIdx ) {
    var sx = car.sprite.position.x, sy = car.sprite.position.y, hx = car._hx || 0, hy = car._hy || 0;
    if (hx === 0 && hy === 0) return 1;
    var selfHl = car._hl || 40, LANE = 24, GAP = 8, ZONE = 52, f = 1;
    for (var k = 0; k < snap.length; k++) {
        if (k === selfIdx) continue;
        var o = snap[k];
        var dx = o.x - sx, dy = o.y - sy;
        var fwd = dx * hx + dy * hy; if (fwd <= 0) continue;
        var lat = dx * (-hy) + dy * hx; if (lat < 0) lat = -lat; if (lat > LANE) continue;
        var stop = selfHl + (o.hl || 40) + GAP;            // distancia centro-a-centro p/ encostar
        if (fwd > stop + ZONE) continue;                    // longe demais: nao afeta
        var yields;
        if (o.always || o.destroyed) yields = true;         // player / destroco
        else if (o.hx * hx + o.hy * hy > 0.5) yields = true; // mesmo sentido -> fila
        else yields = (selfIdx > k);                         // cruzamento -> maior indice cede
        if (!yields) continue;
        var ff = (fwd <= stop) ? 0 : (fwd - stop) / ZONE;    // desacelera linear na banda
        if (ff < f) f = ff;
    }
    return f;
};

// === FLUXO REAL (block.directions): carros seguem as setas one-way do mapa do GTA1 ===
// Mapeamento confirmado no jogo: right=+x(leste) left=-x(oeste) up=+y(norte,row-1) down=-y(sul,row+1).
// Cada tile de rua tem UMA direcao -> o carro anda na seta do tile e VIRA nas ruas cruzadas (mao legal).
// Mata a contramao por construcao (medida antes: 6/16 carros na contramao).
GTA._flowAt = function ( base, col, row ) {
    var c = base[col]; if (!c) return null; var cell = c[row]; if (!cell || !cell.blocks) return null;
    for (var z = cell.blocks.length - 1; z >= 0; z--) { var b = cell.blocks[z];
        if (b && b.type === 2) { var d = b.directions || {};
            if (d.right) return { dx: 1, dy: 0 }; if (d.left) return { dx: -1, dy: 0 };
            if (d.up) return { dx: 0, dy: 1 }; if (d.down) return { dx: 0, dy: -1 }; return null; } }
    return null;
};
// Le trafficLights (dado ORIGINAL do mapa, 3 bits por tile de rua) do bloco de rua do topo.
GTA._lightsAt = function ( base, col, row ) {
    var c = base[col]; if (!c) return 0; var cell = c[row]; if (!cell || !cell.blocks) return 0;
    for (var z = cell.blocks.length - 1; z >= 0; z--) { var b = cell.blocks[z]; if (b && b.type === 2) return b.trafficLights || 0; }
    return 0;
};
// Inicializa o estado de fluxo do carro a partir do tile do spawn (ja em asfalto pelo valid()).
GTA._aiInitFlow = function ( car, game ) {
    var base = game.map.base;
    var col = Math.round(car.sprite.position.x / 64), row = -Math.round(car.sprite.position.y / 64);
    var f = GTA._flowAt(base, col, row);
    if (!f) { var bd = 99, best = null;
        for (var dc = -2; dc <= 2; dc++) for (var dr = -2; dr <= 2; dr++) { var ff = GTA._flowAt(base, col + dc, row + dr); if (ff) { var dd = dc * dc + dr * dr; if (dd < bd) { bd = dd; best = { c: col + dc, r: row + dr, f: ff }; } } }
        if (best) { col = best.c; row = best.r; f = best.f; } else return false; }
    car._col = col; car._row = row; car._fdx = f.dx; car._fdy = f.dy; car._hx = f.dx; car._hy = f.dy;
    car.sprite.position.x = 64 * col; car.sprite.position.y = -64 * row;
    car.sprite.rotation.z = Math.atan2(f.dy, f.dx) + Math.PI / 2;
    return true;
};

GTA.updateAICars = function ( delta ) {
    if (delta > 0.05) delta = 0.05; // evita lurch apos load (~3min) / tab em background (delta gigante)
    var g = window._gtaGame, base = g && g.map && g.map.base; if (!base) return;
    var cam = g.camera && g.camera.position, camx = cam ? cam.x : 0, camy = cam ? cam.y : 0, CULL = 720 * 720; // alem disso o carro nao e' visivel
    var list = GTA.aiCarsPath, n = list.length, i;
    // snapshot p/ anti-sobreposicao: IA + carro(s) do player + player a pe (para o transito na frente dele)
    var snap = new Array(n);
    for (i = 0; i < n; i++) { var c = list[i]; snap[i] = { x: c.sprite.position.x, y: c.sprite.position.y, hx: c._fdx || 0, hy: c._fdy || 0, hl: c._hl || 40, destroyed: !!c._destroyed }; }
    var pcs = GTA.allCars || [];
    for (i = 0; i < pcs.length; i++) { var pc = pcs[i]; if (pc && pc.sprite) snap.push({ x: pc.sprite.position.x, y: pc.sprite.position.y, hx: 0, hy: 0, hl: pc._hl || 40, always: true }); }
    var _pl = g && g.player; if (_pl && !_pl.inCar && !_pl._dead && _pl.position) snap.push({ x: _pl.position.x, y: _pl.position.y, hx: 0, hy: 0, hl: 20, always: true });
    for (i = n - 1; i >= 0; i--) {
        var car = list[i];
        if (car._destroyed) { car._curSpeed = 0; continue; } // destroco: fica parado no lugar (fogo nele)
        if (car._fdx == null) continue; // sem estado de fluxo (raro) -> ignora
        var sp = (car._path && car._path.speed) || 60;
        car._hx = car._fdx; car._hy = car._fdy;
        // Anti-sobreposicao so p/ carros perto da camera (visiveis): corta o O(n^2) que pesava o FPS.
        var ddx = car.sprite.position.x - camx, ddy = car.sprite.position.y - camy;
        var fac = (ddx * ddx + ddy * ddy > CULL) ? 1 : GTA._aiSpeedFactor(car, snap, i);
        // SEMAFORO original (block.trafficLights): se o tile a frente tem sinal e a fase esta
        // vermelha p/ o meu eixo (H/V alternam a cada 3.5s), freia ao chegar na borda do tile.
        if (fac > 0) {
            var tlc = car._col + car._fdx, tlr = car._row - car._fdy;
            if (GTA._lightsAt(base, tlc, tlr)) {
                var phase = ((((window.performance && performance.now) ? performance.now() : Date.now()) / 3500) | 0) % 2;
                var green = (car._fdx !== 0) ? (phase === 0) : (phase === 1);
                if (!green) {
                    var distEdge = (car._fdx !== 0)
                        ? 32 - (car.sprite.position.x - 64 * car._col) * car._fdx
                        : 32 - (car.sprite.position.y - (-64 * car._row)) * car._fdy;
                    if (distEdge < 26) fac = 0;           // parado na faixa
                    else if (distEdge < 44) fac = Math.min(fac, 0.35); // desacelerando
                }
            }
        }
        car._curSpeed = sp * fac; // velocidade efetiva (usada pelo atropelamento)
        var stepd = sp * fac * delta;
        car.sprite.position.x += car._fdx * stepd; car.sprite.position.y += car._fdy * stepd;
        // mantem centrado na faixa (eixo perpendicular ao movimento)
        if (car._fdx !== 0) car.sprite.position.y = -64 * car._row; else car.sprite.position.x = 64 * car._col;
        var nc = Math.round(car.sprite.position.x / 64), nr = -Math.round(car.sprite.position.y / 64);
        if (nc !== car._col || nr !== car._row) { // entrou em tile novo: decide o sentido
            var f = GTA._flowAt(base, nc, nr);
            if (!f) { try { g.scene.remove(car.sprite); } catch (e) {} if (car._bk && GTA._aiUsedBuckets) delete GTA._aiUsedBuckets[car._bk]; list.splice(i, 1); continue; } // saiu da malha -> recicla
            car._col = nc; car._row = nr; var hx = f.dx, hy = f.dy; // default: segue a seta do tile
            if (Math.random() < 0.35) { // as vezes vira numa rua cruzada, se a mao for legal
                var legal = [], P = [{ dx: -f.dy, dy: f.dx }, { dx: f.dy, dy: -f.dx }];
                for (var q = 0; q < 2; q++) { var pp = P[q], pf = GTA._flowAt(base, nc + pp.dx, nr - pp.dy); if (pf && pf.dx === pp.dx && pf.dy === pp.dy) legal.push(pp); }
                if (legal.length) { var pk = legal[(Math.random() * legal.length) | 0]; hx = pk.dx; hy = pk.dy; }
            }
            car._fdx = hx; car._fdy = hy; car.sprite.rotation.z = Math.atan2(hy, hx) + Math.PI / 2;
            car.sprite.position.x = 64 * nc; car.sprite.position.y = -64 * nr;
        }
    }
};

GTA._aiBoot = function () {
    var g = window._gtaGame;
    var ready = g && g.scene && g.camera && g.map && g.map.base && g.cars && g.cars[58] && g.sprites && g.spriteNumbers && g.sprites[g.spriteNumbers.offset.PED];
    if (!ready) { setTimeout(GTA._aiBoot, 700); return; }
    try { if (GTA.aiPedestrians.length === 0 && typeof GTA.spawnAIPedestrians === 'function') GTA.spawnAIPedestrians(g); } catch (e) {}
    if (!GTA._aiStarted) GTA.spawnAICars(g);
};
setTimeout(GTA._aiBoot, 800);

GTA.spawnAIPedestrians = function ( game ) {

    var pedOffset = game.spriteNumbers.offset.PED;

    if (!game.sprites || !game.sprites[pedOffset]) {
        GTA.Log('AI: sprites de pedestres nao disponiveis');
        return;
    }

    // CalÃ§adas confirmadas pelos pickups:
    //   norte yâ-144   sul yâ-263   oeste xâ416   leste xâ608
    var positions = [
        [448, -145],   // calÃ§ada norte-oeste
        [512, -142],   // calÃ§ada norte-centro
        [570, -148],   // calÃ§ada norte-leste
        [416, -198],   // calÃ§ada oeste
        [608, -196],   // calÃ§ada leste
        [450, -262],   // calÃ§ada sul-oeste
        [512, -265],   // calÃ§ada sul-centro
        [574, -258],   // calÃ§ada sul-leste
    ];

    var spawned = 0;
    positions.forEach(function (pos) {
        try {
            var ped = new GTA.AIPedestrian(game, pos[0], pos[1], pedOffset);
            GTA.aiPedestrians.push(ped);
            spawned++;
        } catch (e) {
            GTA.Log('AI ped spawn error: ' + e.message);
        }
    });

    GTA.Log('AI: ' + spawned + ' pedestres criados');

    // Spawn carros IA logo apÃ³s pedestres
    GTA.spawnAICars(game);
};

// âââ Classe Pedestre IA âââââââââââââââââââââââââââââââââââââââ

GTA.AIPedestrian = function ( game, worldX, worldY, pedOffset ) {

    THREE.Object3D.call(this);

    try {
        var geom = THREE.GeometryUtils.clone(
            game.sprites[pedOffset].sprite.geometry
        );
        var mat = game.sprites[pedOffset].sprite.material;
        this.sprite = new THREE.Mesh(geom, mat);
        this.sprite.geometry.dynamic = true;
        this.add(this.sprite);
    } catch (e) {
        GTA.Log('AI sprite error: ' + e.message);
        this.sprite = null;
    }

    this.position.x = worldX;
    this.position.y = worldY;
    this.position.z = 128;

    // ââ Eixo de patrulha âââââââââââââââââââââââââââââââââââââ
    // CalÃ§adas E/O (|worldX-512|>70): andam em Y
    // CalÃ§adas N/S: andam em X
    var dxFromCenterX = Math.abs(worldX - 512);
    this._patrolAxis = (dxFromCenterX > 70) ? 'y' : 'x';

    if (this._patrolAxis === 'x') {
        this._aiAngle = (Math.random() < 0.5) ? 0 : Math.PI;
    } else {
        this._aiAngle = (Math.random() < 0.5) ? Math.PI / 2 : -Math.PI / 2;
    }

    this._aiTimer    = Math.random() * 3;
    this._aiInterval = 2 + Math.random() * 4;
    this._stopped    = false;
    this._stopTimer  = 0;
    this._speed      = 25 + Math.random() * 20;
    this._fleeSpd    = 0;

    this._originX = worldX;
    this._originY = worldY;
    this._maxDist  = 50;

    // ââ AnimaÃ§Ã£o de walking âââââââââââââââââââââââââââââââââââ
    this.lastframe      = 0;
    this.spriteframe    = 0;
    this.spriteAnimator = null;
    try {
        GTA.Pedestrian.prototype.registerAnimations.call(this, pedOffset);
        this.spriteAnimator = new GTA.SpriteAnimation(
            game,
            this.animationSprites[1][0],
            this.sprite
        );
    } catch (e) {
        GTA.Log('AI anim init error: ' + e.message);
    }

    game.scene.add(this);
};

GTA.AIPedestrian.prototype = Object.create(THREE.Object3D.prototype);
GTA.AIPedestrian.prototype.constructor = GTA.AIPedestrian;

GTA.AIPedestrian.prototype.updateAI = function ( delta ) {
    try {
        // ââ Fuga do player ââââââââââââââââââââââââââââââââââââ
        var _fleeing = false;
        var _game = window._gtaGame;
        if (_game && _game.player) {
            var _pl  = _game.player;
            var _fdx = _pl.position.x - this.position.x;
            var _fdy = _pl.position.y - this.position.y;
            if (Math.sqrt(_fdx * _fdx + _fdy * _fdy) < 150) {
                this._aiAngle = Math.atan2(
                    this.position.y - _pl.position.y,
                    this.position.x - _pl.position.x
                );
                this._stopped = false;
                this._fleeSpd = this._speed * 2.0;
                this._aiTimer = 0;
                _fleeing = true;
            }
        }

        if (!_fleeing) {
            this._fleeSpd = 0;
            this._aiTimer += delta;

            if (this._aiTimer >= this._aiInterval) {
                this._aiTimer    = 0;
                this._aiInterval = 2 + Math.random() * 5;

                var dx   = this.position.x - this._originX;
                var dy   = this.position.y - this._originY;
                var dist = Math.sqrt(dx * dx + dy * dy);

                if (Math.random() < 0.15) {
                    this._stopped   = true;
                    this._stopTimer = 1 + Math.random() * 2;
                } else if (dist > this._maxDist) {
                    this._stopped = false;
                    if (this._patrolAxis === 'x') {
                        this._aiAngle = (this._originX > this.position.x) ? 0 : Math.PI;
                    } else {
                        this._aiAngle = (this._originY > this.position.y) ? Math.PI / 2 : -Math.PI / 2;
                    }
                } else {
                    this._stopped = false;
                    if (this._patrolAxis === 'x') {
                        this._aiAngle = (Math.random() < 0.5) ? 0 : Math.PI;
                    } else {
                        this._aiAngle = (Math.random() < 0.5) ? Math.PI / 2 : -Math.PI / 2;
                    }
                }
            }

            if (this._stopped) {
                this._stopTimer -= delta;
                if (this._stopTimer <= 0) this._stopped = false;
            }
        }

        if (!this._stopped) {
            var spd = (_fleeing ? this._fleeSpd : this._speed) * delta;
            this.position.x += Math.cos(this._aiAngle) * spd;
            this.position.y += Math.sin(this._aiAngle) * spd;
        }

        // ââ RotaÃ§Ã£o do sprite âââââââââââââââââââââââââââââââââ
        if (this.sprite) {
            this.sprite.rotation.z = this._aiAngle + Math.PI / 2;
        }

        // ââ AnimaÃ§Ã£o de walking âââââââââââââââââââââââââââââââ
        if (this.spriteAnimator && this.animationSprites) {
            var walkAnim = this.animationSprites[1]; // [baseFrame, 7 frames, 0.1s]
            if (!this._stopped) {
                this.lastframe += delta;
                if (this.lastframe >= walkAnim[2]) {
                    this.lastframe = 0;
                    this.spriteframe = (this.spriteframe + 1) % walkAnim[1];
                    try { this.spriteAnimator.setSprite(walkAnim[0] + this.spriteframe); } catch (e) {}
                }
            } else {
                try { this.spriteAnimator.setSprite(this.animationSprites[0][0]); } catch (e) {}
                this.spriteframe = 0;
                this.lastframe   = 0;
            }
        }

    } catch (e) {
        // Nunca quebra o animate loop
    }
};


// === BATIDAS + AMASSADOS (marcas de batida + fumaca + fogo no nivel maximo) ===
(function () {
    if (GTA._dmgOn) return; GTA._dmgOn = true; GTA._batidaOn = true;
    var T = THREE;
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function quadXY(w, h) {
        // THREE r49: vertices precisam ser THREE.Vertex (computeBoundingSphere le .position),
        // faceVertexUvs obrigatorio no render, e boundingSphere manual evita o crash no new Mesh.
        var g = new T.Geometry();
        g.vertices.push(new T.Vertex(new T.Vector3(-w/2, -h/2, 0)));
        g.vertices.push(new T.Vertex(new T.Vector3( w/2, -h/2, 0)));
        g.vertices.push(new T.Vertex(new T.Vector3( w/2,  h/2, 0)));
        g.vertices.push(new T.Vertex(new T.Vector3(-w/2,  h/2, 0)));
        g.faces.push(new T.Face4(0, 1, 2, 3));
        if (!g.faceVertexUvs[0]) g.faceVertexUvs[0] = [];
        g.faceVertexUvs[0].push([ new T.UV(0,0), new T.UV(1,0), new T.UV(1,1), new T.UV(0,1) ]);
        g.boundingSphere = { radius: Math.max(w, h) };
        try { g.computeFaceNormals(); g.computeCentroids(); } catch (e) {}
        return g;
    }
    function mkQuad(w, h, color, opacity) {
        var m = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthTest: false, side: T.DoubleSide });
        return new T.Mesh(quadXY(w, h), m);
    }
    // Textura de brilho radial (centro claro -> bordas transparentes): transforma os
    // quads quadrados em "blobs" macios -> fogo/fumaca/faiscas deixam de parecer cubos.
    var GLOW = (function () {
        try {
            var c = document.createElement('canvas'); c.width = c.height = 64;
            var ctx = c.getContext('2d');
            var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
            var tex = new T.Texture(c); tex.needsUpdate = true; return tex;
        } catch (e) { return null; }
    })();
    // Blob macio. additive=true (padrao) p/ fogo/faisca; additive=false p/ fumaca escura.
    function glowQuad(w, h, color, opacity, additive) {
        var m = new T.MeshBasicMaterial({ map: GLOW, color: color, transparent: true, opacity: opacity, depthTest: false, blending: (additive === false ? T.NormalBlending : T.AdditiveBlending) });
        return new T.Mesh(quadXY(w, h), m);
    }
    GTA._glowQuad = glowQuad; // exposto p/ o bloco de combate (sangue redondo)
    if (typeof GTA.disableAICar !== 'function') {
        GTA.disableAICar = function (car) { var i = GTA.aiCarsPath.indexOf(car); if (i >= 0) GTA.aiCarsPath.splice(i, 1); };
    }
    GTA._aiToPhysics = function (car, game) {
        if (!car || car.physics || typeof car.initPhysics !== 'function' || !car.sprite) return false;
        try {
            car.x = car.sprite.position.x + 64; car.y = 64 - car.sprite.position.y;
            car.z = 128; car.rotation = car.sprite.rotation.z;
            car.initPhysics(game);
            GTA.allCars = GTA.allCars || [];
            if (GTA.allCars.indexOf(car) < 0) GTA.allCars.push(car);
            return true;
        } catch (e) { return false; }
    };
    GTA._fx = GTA._fx || [];
    // Material clonado por carro (material e compartilhado com peds/player; clonar evita
    // tingir todos). Usado p/ escurecer o carro conforme o dano (simula fuligem/amassado).
    function tintCar(car, hex) {
        try {
            var s = car.sprite; if (!s || !s.material) return;
            // MeshBasicMaterial NAO tem .clone() neste build do THREE -> cria material novo
            // com a MESMA textura (so esse carro), senao tingir mexeria em todos.
            if (!s._dmgMatCloned) { s.material = new T.MeshBasicMaterial({ map: s.material.map, transparent: true }); s._dmgMatCloned = true; }
            s.material.color.setHex(hex);
        } catch (e) {}
    }
    // "Amassado": leve deformacao assimetrica do sprite do carro
    function crumple(car, amt) {
        try { var s = car.sprite; if (!s) return; s.scale.set(1 - amt*0.10*rnd(0.6,1.0), 1 - amt*0.10*rnd(0.6,1.0), 1); } catch (e) {}
    }
    // Chamas NO corpo do carro (filhos do sprite, acompanham o carro) - estagio "queimando"
    function setBurning(car, on) {
        var s = car.sprite; if (!s) return;
        if (on) {
            if (car._burn) return;
            car._burn = [];
            var w = (car.width || 40), h = (car.height || 80);
            for (var i = 0; i < 6; i++) {
                try {
                    var q = glowQuad(w * rnd(0.34, 0.58), h * rnd(0.24, 0.44), (Math.random() < 0.5 ? 0xff7a00 : 0xffd24a), 0.7);
                    q.position.set(rnd(-w*0.28, w*0.28), rnd(-h*0.40, h*0.40), 2 + i * 0.05);
                    q.rotation.z = rnd(0, Math.PI);
                    s.add(q); car._burn.push(q);
                } catch (e) {}
            }
        } else if (car._burn) {
            for (var j = 0; j < car._burn.length; j++) { try { s.remove(car._burn[j]); } catch (e) {} }
            car._burn = null;
        }
    }
    function flickerBurn(car) {
        if (!car._burn) return;
        for (var i = 0; i < car._burn.length; i++) {
            var q = car._burn[i]; q.material.opacity = 0.30 + Math.random() * 0.55;
            var sc = 0.7 + Math.random() * 0.6; q.scale.set(sc, sc, 1);
        }
    }
    GTA._addDents = function (car, n) {
        if (!car || !car.sprite) return;
        var host = car.sprite, w = (car.width || 40), h = (car.height || 80);
        car._dents = car._dents || [];
        if (car._dents.length > 10) return;
        for (var i = 0; i < n; i++) {
            try {
                var s = rnd(0.09, 0.17);
                // marcas pequenas, cinza-escuro e translucidas (arranhoes/amassados, nao blocos pretos)
                var mark = mkQuad(w * s, h * s * rnd(0.6, 1.2), (Math.random() < 0.5 ? 0x161616 : 0x2c2c2c), rnd(0.20, 0.36));
                mark.position.set(rnd(-w*0.32, w*0.32), rnd(-h*0.40, h*0.40), 1 + car._dents.length * 0.02);
                mark.rotation.z = rnd(0, Math.PI);
                host.add(mark); car._dents.push(mark);
            } catch (e) {}
        }
    };
    GTA._spawnFx = function (car, kind, count) {
        if (!car || !car.sprite || !window._gtaGame) return;
        var scene = window._gtaGame.scene;
        var px = car.sprite.position.x, py = car.sprite.position.y, pz = car.sprite.position.z;
        for (var i = 0; i < count; i++) {
            try {
                if (kind === 'fire') {
                    var r = Math.random();
                    var col = r < 0.4 ? 0xff3300 : (r < 0.75 ? 0xff8a00 : 0xffd24a); // vermelho->laranja->amarelo
                    var sz = rnd(12, 22);   // blob macio (a textura faz o fade nas bordas)
                    var p = glowQuad(sz, sz, col, 0.7);
                    p.position.set(px + rnd(-8, 8), py + rnd(-8, 8), pz + 8 + rnd(0, 6));
                    scene.add(p);
                    GTA._fx.push({ mesh: p, life: 0, max: rnd(0.32, 0.58), vy: rnd(26, 52), vx: rnd(-10, 10), grow: rnd(-0.3, 0.3), o0: 0.7, flick: true });
                } else if (kind === 'spark') {
                    var sp = glowQuad(rnd(4, 7), rnd(4, 7), 0xffe070, 1);
                    sp.position.set(px + rnd(-6, 6), py + rnd(-6, 6), pz + 10);
                    scene.add(sp);
                    GTA._fx.push({ mesh: sp, life: 0, max: rnd(0.25, 0.5), vy: rnd(40, 95), vx: rnd(-45, 45), grow: -0.6, o0: 1, flick: true });
                } else {
                    var ss = rnd(18, 32);
                    var sm = glowQuad(ss, ss, (Math.random() < 0.5 ? 0x202020 : 0x3a3a3a), 0.5, false); // fumaca: blob escuro macio
                    sm.position.set(px + rnd(-8, 8), py + rnd(-8, 8), pz + 14 + rnd(0, 10));
                    scene.add(sm);
                    GTA._fx.push({ mesh: sm, life: 0, max: rnd(1.0, 1.8), vy: rnd(16, 30), vx: rnd(-8, 8), grow: rnd(1.2, 2.4), o0: 0.5 });
                }
            } catch (e) {}
        }
    };
    // Bola de fogo "fofa" (billowing) como no GTA1: blobs additive sobrepostos em
    // camadas (vermelho fora -> laranja -> nucleo amarelo/claro) que expandem + fumaca.
    function fireball(px, py, pz) {
        if (!window._gtaGame) return;
        var scene = window._gtaGame.scene;
        function blob(col, sz, op, max, spread, grow, vy) {
            var ang = rnd(0, Math.PI*2), r = rnd(0, spread);
            var q = glowQuad(sz, sz, col, op);
            q.position.set(px + Math.cos(ang)*r, py + Math.sin(ang)*r, pz + 18 + rnd(0,8));
            q.rotation.z = rnd(0, Math.PI);
            scene.add(q);
            GTA._fx.push({ mesh: q, life: 0, max: max, vy: vy, vx: rnd(-6,6), grow: grow, o0: op });
        }
        var k;
        for (k = 0; k < 7; k++) blob(0xcc1a00, rnd(34,46), 0.6,  rnd(0.45,0.7), 24, rnd(0.5,1.0), rnd(6,16));  // vermelho externo
        for (k = 0; k < 8; k++) blob(0xff6a00, rnd(24,36), 0.7,  rnd(0.40,0.6), 18, rnd(0.4,0.9), rnd(10,22)); // laranja medio
        for (k = 0; k < 6; k++) blob(0xffd24a, rnd(16,26), 0.85, rnd(0.30,0.5), 10, rnd(0.3,0.7), rnd(14,28)); // amarelo
        for (k = 0; k < 3; k++) blob(0xfff4c0, rnd(12,18), 0.95, rnd(0.20,0.35), 5, 0.2, rnd(16,30));          // nucleo claro
        var at = { sprite: { position: { x: px, y: py, z: pz } } };
        GTA._spawnFx(at, 'spark', 16); GTA._spawnFx(at, 'smoke', 8);
    }
    function explosion(car) {
        if (!car || !car.sprite) return;
        var s = car.sprite; fireball(s.position.x, s.position.y, s.position.z);
    }
    // Estrela de impacto amarela (marcador de colisao do GTA1): "+" e "x" brilhantes
    GTA._impactStar = function (x, y, z) {
        if (!window._gtaGame) return;
        var scene = window._gtaGame.scene; z = (z || 128) + 22;
        // nucleo de brilho macio
        var core = glowQuad(16, 16, 0xfff0a0, 1);
        core.position.set(x, y, z); scene.add(core);
        GTA._fx.push({ mesh: core, life: 0, max: 0.18, vy: 0, vx: 0, grow: 1.2, o0: 1 });
        // raios finos e curtos (flash rapido)
        function ray(w, h, rot) {
            var q = mkQuad(w, h, 0xffe24a, 1); q.material.blending = T.AdditiveBlending;
            q.position.set(x, y, z + 0.1); q.rotation.z = rot; scene.add(q);
            GTA._fx.push({ mesh: q, life: 0, max: rnd(0.12, 0.18), vy: 0, vx: 0, grow: 0.5, o0: 1 });
        }
        ray(15, 3, 0); ray(15, 3, Math.PI/2); ray(11, 2.5, Math.PI/4); ray(11, 2.5, -Math.PI/4);
        GTA._spawnFx({ sprite: { position: { x: x, y: y, z: z } } }, 'spark', 5);
    };
    GTA._updateFx = function (delta) {
        if (!GTA._fx.length || !window._gtaGame) return;
        var scene = window._gtaGame.scene;
        for (var i = GTA._fx.length - 1; i >= 0; i--) {
            var f = GTA._fx[i]; f.life += delta; var t = f.life / f.max;
            if (t >= 1) { try { scene.remove(f.mesh); } catch (e) {} GTA._fx.splice(i, 1); continue; }
            f.mesh.position.y += f.vy * delta; f.mesh.position.x += f.vx * delta;
            var sc = Math.max(0.05, 1 + f.grow * t); f.mesh.scale.set(sc, sc, 1);
            var o = f.o0 * (1 - t); if (f.flick) o *= (0.65 + Math.random() * 0.35);
            f.mesh.material.opacity = o;
        }
    };
    GTA._emitters = GTA._emitters || [];
    GTA._registerEmitter = function (car, kind, dur) {
        for (var i = 0; i < GTA._emitters.length; i++) { if (GTA._emitters[i].car === car) { GTA._emitters[i].kind = kind; GTA._emitters[i].age = 0; GTA._emitters[i].dur = dur || null; return; } }
        GTA._emitters.push({ car: car, kind: kind, t: 0, age: 0, dur: dur || null });
    };
    GTA._updateEmitters = function (delta) {
        for (var i = GTA._emitters.length - 1; i >= 0; i--) {
            var e = GTA._emitters[i];
            if (!e.car || !e.car.sprite) { GTA._emitters.splice(i, 1); continue; }
            // destroco fisico (carro batido): mantem parado p/ o fogo nao ficar pra tras
            if (e.car._destroyed && e.car.physics) {
                var _g = window._gtaGame;
                if (!(_g && _g.player && _g.player.currentCar === e.car)) {
                    try { e.car.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0)); } catch (er) {}
                }
            }
            // PAVIO: carro pegando fogo explode sozinho apos _fuse segundos
            if (e.car._onFire && !e.car._destroyed && e.car._fuse != null) {
                e.car._fuse -= delta;
                if (e.car._fuse <= 0) detonate(e.car);
            }
            e.age = (e.age || 0) + delta;
            if (e.dur && e.age >= e.dur) {
                if (e.kind === 'fire') { e.kind = 'smoke'; e.age = 0; e.dur = 3; setBurning(e.car, false); tintCar(e.car, 0x0a0a0a); } // fogo apaga -> carcaca + fumaca residual
                else { GTA._emitters.splice(i, 1); continue; }                     // some -> resta so a carcaca
            }
            if (e.kind === 'fire') flickerBurn(e.car); // chamas no corpo tremulam todo frame
            e.t += delta; var iv = (e.kind === 'fire') ? 0.06 : 0.22;
            if (e.t >= iv) {
                e.t = 0;
                if (e.kind === 'fire') { GTA._spawnFx(e.car, 'fire', 3); if (Math.random() < 0.4) GTA._spawnFx(e.car, 'smoke', 1); }
                else { GTA._spawnFx(e.car, 'smoke', 1); }
            }
        }
    };
    // Detona o carro: bola de fogo -> corpo em chamas (+2s) -> carcaca. Mata o player se estava nele.
    function detonate(car) {
        if (!car || !car.sprite || car._destroyed) return;
        car._destroyed = true;
        explosion(car);            // bola de fogo
        crumple(car, 1);           // amasso maximo
        tintCar(car, 0x1a1410);    // escurecendo, ainda queimando
        setBurning(car, true);     // chamas no corpo
        GTA._registerEmitter(car, 'fire', 2.0); // +2s queimando -> fumaca 3s -> carcaca (no _updateEmitters)
        try { if (car.physics) car.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0)); } catch (e) {}
        var g = window._gtaGame;
        if (g && g.player && !g.player._dead && typeof GTA._killPlayer === 'function') {
            var inThis = g.player.inCar && g.player.currentCar === car;
            var ddx = g.player.position.x - car.sprite.position.x, ddy = g.player.position.y - car.sprite.position.y;
            var near = (ddx*ddx + ddy*ddy) < 115*115; // raio da explosao (antes 70 = quase encostado, nao matava "perto")
            if (inThis || near) GTA._killPlayer();
        }
    }
    GTA.detonateCar = detonate;
    GTA._applyDamage = function (car, game, step) {
        if (!car || !car.sprite || car._destroyed) return;
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (car._dmgCd && now - car._dmgCd < 700) return;
        car._dmgCd = now; car._dmg = (car._dmg || 0) + (step || 1);
        var d = car._dmg;
        // amassa + escurece progressivamente (rampa)
        GTA._addDents(car, d <= 2 ? 1 : 2);
        crumple(car, Math.min(1, d / 6));
        var k = Math.max(0.45, 1 - d * 0.10); var c = Math.round(0xff * k);
        tintCar(car, (c << 16) | (c << 8) | c);
        // hit 5: PEGA FOGO e acende o pavio -> queima e explode sozinho (estilo GTA1)
        if (d >= 5 && !car._onFire) {
            car._onFire = true;
            setBurning(car, true);
            GTA._registerEmitter(car, 'fire'); // sem dur: queima ate o pavio estourar
            car._fuse = 2.5;                   // explode em ~2.5s
        }
    };
    GTA._aiCarCollisions = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        var pl = g.player; if (!pl.inCar || !pl.currentCar || !pl.currentCar.sprite) return;
        var pc = pl.currentCar, pcx = pc.sprite.position.x, pcy = pc.sprite.position.y;
        var nowS = (window.performance && performance.now) ? performance.now() : Date.now();
        function star(ox, oy) {
            if (pc._starCd && nowS - pc._starCd < 220) return;   // 1 estrela a cada ~220ms
            pc._starCd = nowS;
            GTA._impactStar((pcx + ox) / 2, (pcy + oy) / 2, pc.sprite.position.z);
        }
        // Dano por MASSA (dados originais): quem e' mais pesado amassa mais o outro.
        // weight vem do game.cars[type].weight (STYLE001.G24); razao >=1.8 -> hit em dobro no mais leve.
        function wOf(c) { try { var m = g.cars[c.type]; return (m && m.weight) || 1000; } catch (e) { return 1000; } }
        function hitBoth(other) {
            var wp = wOf(pc), wo = wOf(other);
            GTA._applyDamage(other, g, (wp / wo >= 1.8) ? 2 : 1);
            GTA._applyDamage(pc, g, (wo / wp >= 1.8) ? 2 : 1);
        }
        for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) {
            var car = GTA.aiCarsPath[i]; if (!car || !car.sprite) continue;
            var dx = car.sprite.position.x - pcx, dy = car.sprite.position.y - pcy;
            if (dx*dx + dy*dy < 4900) { star(car.sprite.position.x, car.sprite.position.y); GTA._aiToPhysics(car, g); GTA.aiCarsPath.splice(i, 1); hitBoth(car); }
        }
        var all = GTA.allCars || [];
        for (var a = 0; a < all.length; a++) {
            var ac = all[a]; if (ac === pc || !ac || !ac.sprite) continue;
            var ex = ac.sprite.position.x - pcx, ey = ac.sprite.position.y - pcy;
            if (ex*ex + ey*ey < 4900) { star(ac.sprite.position.x, ac.sprite.position.y); hitBoth(ac); }
        }
    };
    var _orig = GTA.updateAICars;
    GTA.updateAICars = function (delta) {
        if (typeof _orig === 'function') _orig(delta);
        try { GTA._aiCarCollisions(); } catch (e) {}
        try { GTA._updateEmitters(delta); } catch (e) {}
        try { GTA._updateFx(delta); } catch (e) {}
    };
})();


// === FASE 1: COMBATE & REACOES (tiro com projetil, morte de ped, atropelamento) ===
(function () {
    if (GTA._combatOn) return; GTA._combatOn = true;
    var T = THREE;
    function quad(w, h, color, opacity) {
        // THREE r49: ver quadXY no bloco de dano — vertices THREE.Vertex + UVs + boundingSphere manual.
        var g = new T.Geometry();
        g.vertices.push(new T.Vertex(new T.Vector3(-w/2,-h/2,0)));
        g.vertices.push(new T.Vertex(new T.Vector3( w/2,-h/2,0)));
        g.vertices.push(new T.Vertex(new T.Vector3( w/2, h/2,0)));
        g.vertices.push(new T.Vertex(new T.Vector3(-w/2, h/2,0)));
        g.faces.push(new T.Face4(0,1,2,3));
        if (!g.faceVertexUvs[0]) g.faceVertexUvs[0] = [];
        g.faceVertexUvs[0].push([ new T.UV(0,0), new T.UV(1,0), new T.UV(1,1), new T.UV(0,1) ]);
        g.boundingSphere = { radius: Math.max(w,h) };
        try { g.computeFaceNormals(); g.computeCentroids(); } catch (e) {}
        var m = new T.MeshBasicMaterial({ color:color, transparent:true, opacity:opacity, depthTest:false, side:T.DoubleSide });
        return new T.Mesh(g, m);
    }
    function rnd(a, b) { return a + Math.random()*(b-a); }
    function carRadius(car) { var w = car.width||40, h = car.height||80; return Math.max(w,h)*0.5; }
    // Raio de colisao do PED direto do sprite ORIGINAL (metade da largura), cacheado. Fallback 10.
    GTA._pedRadius = function (g) {
        if (GTA._pedRcache) return GTA._pedRcache;
        var r = 10;
        try { var sp = g.sprites[g.spriteNumbers.offset.PED]; if (sp && sp.width) r = Math.max(6, sp.width * 0.5); } catch (e) {}
        GTA._pedRcache = r; return r;
    };

    // --- Particulas de combate (tracer, sangue) ---
    GTA._combatFx = GTA._combatFx || [];
    function addFx(mesh, o) {
        o = o || {}; o.mesh = mesh; o.life = 0; o.max = o.max || 0.5; o.o0 = mesh.material.opacity;
        GTA._combatFx.push(o);
        try { window._gtaGame.scene.add(mesh); } catch (e) {}
    }
    GTA._updateCombatFx = function (delta) {
        var scene = window._gtaGame ? window._gtaGame.scene : null; if (!scene) return;
        for (var i = GTA._combatFx.length-1; i >= 0; i--) {
            var f = GTA._combatFx[i]; f.life += delta; var t = f.life/f.max;
            if (t >= 1) { try { scene.remove(f.mesh); } catch (e) {} GTA._combatFx.splice(i,1); continue; }
            if (f.vx) f.mesh.position.x += f.vx*delta;
            if (f.vy) f.mesh.position.y += f.vy*delta;
            if (f.grow) { var sc = 1 + f.grow*t; f.mesh.scale.set(sc, sc, 1); }
            var hold = (f.hold != null) ? f.hold : 0;
            f.mesh.material.opacity = (t < hold) ? f.o0 : f.o0*(1 - (t-hold)/(1-hold));
        }
    };
    function spawnTracer(mx, my, ex, ey) {
        var dx = ex-mx, dy = ey-my, len = Math.sqrt(dx*dx+dy*dy); if (len < 1) return;
        var ux = dx/len, uy = dy/len;
        var gq = GTA._glowQuad;
        // "pingos" cinzas seguidos na direcao do tiro (estilo GTA1). Pistola = poucos por
        // tiro; metralhadora = varios tiros/seg -> linha continua de pingos.
        var step = 16, n = Math.min(10, Math.floor(len/step));
        for (var i = 0; i <= n; i++) {
            var d = 6 + i*step + rnd(-2, 2);
            // pingos maiores/mais claros/mais opacos -> tiro bem visivel (antes quase transparente)
            var puff = gq ? gq(rnd(7, 11), rnd(7, 11), (Math.random() < 0.5 ? 0xf4f4f4 : 0xc0c0c0), 0.95, false)
                          : quad(rnd(7, 11), rnd(7, 11), 0xf4f4f4, 0.95);
            puff.position.set(mx + ux*d + rnd(-2, 2), my + uy*d + rnd(-2, 2), 150);
            addFx(puff, { max: rnd(0.22, 0.42), grow: 0.45 });
        }
        // flash curto na boca da arma
        var fl = gq ? gq(15, 15, 0xfff0b0, 1) : quad(15, 15, 0xffffaa, 1);
        fl.position.set(mx, my, 151); addFx(fl, { max: 0.1, grow: 0.7 });
    }
    function spawnBlood(x, y) {
        // Poca redonda escura (textura de brilho radial em cor de sangue, blending normal) -> mancha macia, nao quadrado
        var gq = GTA._glowQuad;
        if (gq) {
            var pool = gq(rnd(36, 50), rnd(36, 50), 0x5a0000, 0.78, false);
            pool.position.set(x, y, 119); pool.rotation.z = rnd(0, 3.14);
            addFx(pool, { max: 10.0, hold: 0.88 });            // fica bastante tempo, depois desbota
            var pool2 = gq(rnd(20, 30), rnd(20, 30), 0x7a0000, 0.7, false);
            pool2.position.set(x + rnd(-12, 12), y + rnd(-12, 12), 119.4); pool2.rotation.z = rnd(0, 3.14);
            addFx(pool2, { max: 9.0, hold: 0.88 });
        }
        // respingos pequenos que saem no impacto
        for (var i = 0; i < 8; i++) {
            var p = gq ? gq(rnd(5, 9), rnd(5, 9), (Math.random() < 0.5 ? 0x8b0000 : 0xb00000), 0.85, false)
                       : quad(rnd(5, 9), rnd(5, 9), 0x8b0000, 0.85);
            p.position.set(x + rnd(-4, 4), y + rnd(-4, 4), 130); addFx(p, { max: rnd(0.4, 0.8), vx: rnd(-30, 30), vy: rnd(-30, 30), grow: 0.4 });
        }
    }

    // --- Tiro: hitscan na direcao do player a pe ---
    GTA.fireBullet = function () {
        var g = window._gtaGame; if (!g || !g.player || g.player.inCar) return;
        var p = g.player;
        // Mira na frente VISUAL do sprite (nose = +Y girado por sprite.rotation.z),
        // senao o tiro saia espelhado/ao contrario da direcao que o player aponta.
        var rot = p.sprite ? p.sprite.rotation.z : (p.physics ? -p.physics.GetAngle() : 0);
        // Sprite do ped aponta pra -Y -> frente = (sin, -cos). VERIFICADO no jogo (usuario
        // confirmou: (-sin,cos) sai espelhado). NAO reverter sem testar no jogo ao vivo.
        var ax = Math.sin(rot), ay = -Math.cos(rot);
        var mx = p.position.x + ax*16, my = p.position.y + ay*16;
        var range = 520, hitT = range, hitPed = null, hitCar = null;
        function test(tx, ty, radius) {
            var rx = tx-mx, ry = ty-my; var t = rx*ax + ry*ay; if (t < 0 || t > range) return -1;
            var px = rx-ax*t, py = ry-ay*t; var R = radius+8; if (px*px+py*py > R*R) return -1; return t;
        }
        var peds = GTA.aiPedestrians || [];
        var pedR = GTA._pedRadius(g); // raio REAL do sprite original (nao 12 fixo)
        for (var i = 0; i < peds.length; i++) { var pd = peds[i]; if (!pd || pd._dead) continue; var t = test(pd.position.x, pd.position.y, pedR); if (t >= 0 && t < hitT) { hitT = t; hitPed = pd; hitCar = null; } }
        var cars = (GTA.aiCarsPath || []).concat(GTA.allCars || []);
        for (var j = 0; j < cars.length; j++) { var c = cars[j]; if (!c || !c.sprite || c === p.currentCar) continue; var t2 = test(c.sprite.position.x, c.sprite.position.y, carRadius(c)); if (t2 >= 0 && t2 < hitT) { hitT = t2; hitCar = c; hitPed = null; } }
        spawnTracer(mx, my, mx + ax*hitT, my + ay*hitT);
        if (hitPed) GTA._killPed(hitPed, 'shot');
        else if (hitCar) { try { GTA._applyDamage(hitCar, g); } catch (e) {} }
    };

    GTA._killPed = function (ped, cause) {
        if (!ped || ped._dead) return; ped._dead = true;
        spawnBlood(ped.position.x, ped.position.y);
        try { window._gtaGame.scene.remove(ped); } catch (e) {}
        var i = GTA.aiPedestrians.indexOf(ped); if (i >= 0) GTA.aiPedestrians.splice(i, 1);
        if (typeof window.GTA_registrarMorte === 'function') { try { window.GTA_registrarMorte(cause); } catch (e) {} }
    };

    // --- Morte do player (carro explodiu com ele dentro) ---
    GTA._killPlayer = function () {
        var g = window._gtaGame; if (!g || !g.player || g.player._dead) return;
        var p = g.player;
        var px = p.position.x, py = p.position.y;
        // Ejeta com a logica padrao (reposiciona o corpo fisico ao lado do carro),
        // senao no respawn o player teleporta p/ onde entrou no carro (parecia reiniciar o jogo).
        try { if (p.inCar && typeof p.exitCar === 'function') p.exitCar(); else { p.inCar = false; p.currentCar = null; } }
        catch (e) { p.inCar = false; p.currentCar = null; }
        p._dead = true;
        try { if (p.sprite) { p.sprite.visible = true; p.sprite.rotation.z = Math.PI / 2; } } catch (e) {} // corpo deitado
        try { if (p.physics) p.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0)); } catch (e) {}
        spawnBlood(px, py); spawnBlood(px + rnd(-12, 12), py + rnd(-12, 12)); // poca de sangue do lado
        try { if (g.scene) { g.scene.remove(p); g.scene.add(p); } } catch (e) {} // corpo por cima do sangue
        if (typeof window.GTA_onPlayerMorto === 'function') { try { window.GTA_onPlayerMorto(); } catch (e) {} }
    };
    GTA._revivePlayer = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        var p = g.player; p._dead = false;
        try { if (p.sprite) p.sprite.rotation.z = 0; } catch (e) {}
    };

    // --- Atropelamento: carro do player em movimento mata peds que toca ---
    GTA._runOverCheck = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        var p = g.player; if (!p.inCar || !p.currentCar || !p.currentCar.sprite) return;
        var car = p.currentCar, spd = 0;
        try { var v = car.physics.GetLinearVelocity(); spd = Math.sqrt(v.x*v.x + v.y*v.y); } catch (e) {}
        if (spd < 1.5) return;
        var cx = car.sprite.position.x, cy = car.sprite.position.y, R = carRadius(car) + GTA._pedRadius(g);
        var peds = GTA.aiPedestrians || [];
        for (var i = peds.length-1; i >= 0; i--) { var pd = peds[i]; if (!pd || pd._dead) continue; var dx = pd.position.x-cx, dy = pd.position.y-cy; if (dx*dx+dy*dy < R*R) GTA._killPed(pd, 'run'); }
    };

    // --- Atropelamento do PLAYER a pe por carro IA: so morre se o carro vinha em ALTA velocidade ---
    // Encostao lento NAO mata; e ao parar na frente p/ roubar o carro freia (_curSpeed=0) -> sem morte.
    // Quem acerta o player de lado/por tras EM ALTA velocidade (fora do cone de frente) atropela.
    GTA._aiRunOverPlayer = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        var p = g.player; if (p.inCar || p._dead || !p.position) return;
        var SPDKILL = 52, px = p.position.x, py = p.position.y, cars = GTA.aiCarsPath || [];
        for (var i = 0; i < cars.length; i++) {
            var c = cars[i]; if (!c || !c.sprite || c._destroyed) continue;
            if ((c._curSpeed || 0) < SPDKILL) continue; // lento = so um encostao
            var dx = c.sprite.position.x - px, dy = c.sprite.position.y - py, R = carRadius(c) + 6;
            if (dx*dx + dy*dy < R*R) { GTA._killPlayer(); return; }
        }
    };

    // --- Objetos ESMAGAVEIS (dado original: gameobjects com status==2 no .G24) ---
    // O mapa ja posiciona os objetos (map.gameobjects); aqui filtramos os esmagaveis uma vez
    // e o carro do player em movimento os destroi (remove sprite + estrela de impacto).
    GTA._smashables = null;
    GTA._smashInit = function (g) {
        var list = [];
        try {
            var objs = (g.map && g.map.gameobjects) || [];
            for (var i = 0; i < objs.length; i++) {
                var go = objs[i]; if (!go || !go.sprite || go.remap >= 128) continue; // >=128 = veiculo
                var def = g.gameobjects && g.gameobjects[go.type];
                if (!def || def.status !== 2) continue;
                var r = Math.max(8, Math.max(def.width || 0, def.height || 0) * 0.5);
                list.push({ sprite: go.sprite, x: go.sprite.position.x, y: go.sprite.position.y, r: r, done: false });
            }
        } catch (e) {}
        GTA._smashables = list;
        GTA.Log('Smash: ' + list.length + ' objetos esmagaveis no mapa');
    };
    GTA._smashCheck = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        if (GTA._smashables === null && g.map && g.map.gameobjects && g.map.gameobjects.length) GTA._smashInit(g);
        var s = GTA._smashables; if (!s || !s.length) return;
        var p = g.player; if (!p.inCar || !p.currentCar || !p.currentCar.sprite) return;
        var car = p.currentCar, spd = 0;
        try { var v = car.physics.GetLinearVelocity(); spd = Math.sqrt(v.x*v.x + v.y*v.y); } catch (e) {}
        if (spd < 1.2) return; // parado nao esmaga
        var cx = car.sprite.position.x, cy = car.sprite.position.y, CR = carRadius(car);
        for (var i = 0; i < s.length; i++) {
            var o = s[i]; if (o.done) continue;
            var dx = o.x - cx; if (dx > 200 || dx < -200) continue;
            var dy = o.y - cy; if (dy > 200 || dy < -200) continue;
            var R = o.r + CR;
            if (dx*dx + dy*dy < R*R) {
                o.done = true;
                try { if (o.sprite.parent) o.sprite.parent.remove(o.sprite); else o.sprite.visible = false; } catch (e) { try { o.sprite.visible = false; } catch (e2) {} }
                try { GTA._impactStar(o.x, o.y, car.sprite.position.z); } catch (e) {}
            }
        }
    };

    // --- Respawn de peds nas calcadas (type 3) perto do player ---
    GTA._pedRespawnT = 0;
    GTA._pedRespawn = function (game) {
        var TARGET = 14; var peds = GTA.aiPedestrians || []; if (peds.length >= TARGET) return;
        var base = game.map.base; if (!base) return;
        var off = game.spriteNumbers.offset.PED; if (!game.sprites || !game.sprites[off]) return;
        var cam = game.camera.position, cc = Math.round(cam.x/64), cr = -Math.round(cam.y/64);
        var WIN = 20, tries = 0, made = 0;
        while (made < 3 && tries < 60 && (peds.length+made) < TARGET) {
            tries++;
            var c = cc + Math.round((Math.random()*2-1)*WIN), r = cr + Math.round((Math.random()*2-1)*WIN);
            if (GTA._aiTopType(base, c, r) !== 3) continue;
            var wx = 64*c, wy = -64*r;
            var ddx = wx-cam.x, ddy = wy-cam.y; if (Math.sqrt(ddx*ddx+ddy*ddy) < 520) continue; // so fora da tela
            try { var ped = new GTA.AIPedestrian(game, wx, wy, off); GTA.aiPedestrians.push(ped); made++; } catch (e) {}
        }
    };

    GTA._updateCombat = function (delta) {
        try { GTA._updateCombatFx(delta); } catch (e) {}
        try {
            var _g = window._gtaGame; // se o carro do player virou destroco, ele morre
            if (_g && _g.player && _g.player.inCar && _g.player.currentCar && _g.player.currentCar._destroyed && !_g.player._dead) GTA._killPlayer();
        } catch (e) {}
        try { GTA._runOverCheck(); } catch (e) {}
        try { GTA._smashCheck(); } catch (e) {}
        try { GTA._aiRunOverPlayer(); } catch (e) {}
        GTA._pedRespawnT += delta;
        if (GTA._pedRespawnT > 2) { GTA._pedRespawnT = 0; try { if (window._gtaGame) GTA._pedRespawn(window._gtaGame); } catch (e) {} }
    };

    var _prev = GTA.updateAICars;
    GTA.updateAICars = function (delta) { if (typeof _prev === 'function') _prev(delta); try { GTA._updateCombat(delta); } catch (e) {} };
})();

// === FASE SOM: SFX ORIGINAIS do GTA1 (data/AUDIO/LEVEL001.SDT + .RAW) ===
// SDT = tabela de 12 bytes/som (offset, tamanho, sampleRate); RAW = PCM 8-bit unsigned mono.
// Web Audio: decodifica na mao p/ AudioBuffer. Mapa de indices calibravel: GTA._sfxMap.
// Debug no console: GTA.testSound(i) toca o som i (0..130) p/ calibrar os indices.
(function () {
    if (GTA._sfxOn) return; GTA._sfxOn = true;
    var ctx = null, raw = null, table = null, cache = {}, master = null;
    var pending = false;

    GTA._sfxMap = { shot: 19, mg: 20, explo: 2, crash: 3, engine: 30 }; // chutes calibraveis

    function ensureCtx() {
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
        return ctx;
    }
    // iOS/Chrome exigem gesto do usuario p/ liberar o audio
    function unlock() { try { var c = ensureCtx(); if (c && c.state === 'suspended') c.resume(); } catch (e) {} }
    ['keydown', 'touchstart', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, unlock, { passive: true }); });

    function loadData() {
        if (pending || (raw && table)) return; pending = true;
        var done = 0;
        function fin() { done++; if (done === 2) { pending = false; GTA.Log('SFX: ' + (table ? table.length : 0) + ' sons originais carregados'); } }
        try {
            var x1 = new XMLHttpRequest(); x1.open('GET', 'data/AUDIO/LEVEL001.SDT', true); x1.responseType = 'arraybuffer';
            x1.onload = function () { var dv = new DataView(x1.response); var n = (x1.response.byteLength / 12) | 0; table = [];
                for (var i = 0; i < n; i++) table.push({ off: dv.getUint32(i * 12, true), len: dv.getUint32(i * 12 + 4, true), sr: dv.getUint32(i * 12 + 8, true) });
                fin(); };
            x1.onerror = function () { pending = false; }; x1.send();
            var x2 = new XMLHttpRequest(); x2.open('GET', 'data/AUDIO/LEVEL001.RAW', true); x2.responseType = 'arraybuffer';
            x2.onload = function () { raw = new Uint8Array(x2.response); fin(); };
            x2.onerror = function () { pending = false; }; x2.send();
        } catch (e) { pending = false; }
    }
    setTimeout(loadData, 3000); // carrega em paralelo com o mapa

    function getBuf(i) {
        if (cache[i]) return cache[i];
        if (!raw || !table || !table[i] || !ensureCtx()) return null;
        var e = table[i]; if (!e.len || !e.sr || e.len < 100) return null;
        var buf = ctx.createBuffer(1, e.len, Math.max(3000, Math.min(48000, e.sr)));
        var ch = buf.getChannelData(0);
        for (var j = 0; j < e.len; j++) ch[j] = (raw[e.off + j] - 128) / 128; // 8-bit unsigned -> float
        cache[i] = buf; return buf;
    }
    GTA.playSoundIdx = function (i, opts) {
        opts = opts || {};
        try {
            var c = ensureCtx(); if (!c || c.state === 'suspended') return null;
            var b = getBuf(i); if (!b) { loadData(); return null; }
            var src = c.createBufferSource(); src.buffer = b;
            src.loop = !!opts.loop;
            src.playbackRate.value = opts.rate || 1;
            var g = c.createGain(); g.gain.value = (opts.vol != null ? opts.vol : 1);
            src.connect(g); g.connect(master); src.start(0);
            src._gain = g;
            return src;
        } catch (e) { return null; }
    };
    GTA.playSfx = function (name, opts) { var i = GTA._sfxMap[name]; if (i == null) return null; return GTA.playSoundIdx(i, opts); };
    GTA.testSound = function (i) { unlock(); return GTA.playSoundIdx(i, { vol: 1 }); };

    // --- Hooks: tiro, explosao, batida (wrappers; nao mexem nas funcoes) ---
    var _fb = GTA.fireBullet;
    if (typeof _fb === 'function') GTA.fireBullet = function () { try { GTA.playSfx('shot', { vol: 0.8 }); } catch (e) {} return _fb.apply(this, arguments); };
    var _det = GTA.detonateCar;
    if (typeof _det === 'function') GTA.detonateCar = function () { try { GTA.playSfx('explo', { vol: 1 }); } catch (e) {} return _det.apply(this, arguments); };
    var _ad = GTA._applyDamage;
    if (typeof _ad === 'function') GTA._applyDamage = function (car) { try { if (car && !car._destroyed) GTA.playSfx('crash', { vol: 0.6 }); } catch (e) {} return _ad.apply(this, arguments); };

    // --- Motor do player: loop com pitch pela velocidade ---
    var engineSrc = null;
    GTA._engineTick = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        var p = g.player;
        if (p.inCar && p.currentCar && p.currentCar.physics && ctx && ctx.state === 'running') {
            var v = p.currentCar.physics.GetLinearVelocity(); var spd = Math.sqrt(v.x * v.x + v.y * v.y);
            if (!engineSrc) { engineSrc = GTA.playSfx('engine', { loop: true, vol: 0.35, rate: 0.8 }); }
            if (engineSrc) { try { engineSrc.playbackRate.value = Math.min(2.2, 0.75 + spd * 0.055); } catch (e) {} }
        } else if (engineSrc) { try { engineSrc.stop(0); } catch (e) {} engineSrc = null; }
    };
    var _up = GTA.updateAICars;
    GTA.updateAICars = function (delta) { if (typeof _up === 'function') _up(delta); try { GTA._engineTick(); } catch (e) {} };
})();
