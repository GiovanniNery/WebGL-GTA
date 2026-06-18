/*
 * ai.js - Carros IA + Pedestres IA para WebGL-GTA (ATG1)
 *
 * Coordenadas Three.js:
 *   Via horizontal centrada em y=-192, largura 64: lanes em y=-208 (Leste) e y=-176 (Oeste)
 *   Via vertical   centrada em x=512,  largura 64: lanes em x=496  (Sul)   e x=528  (Norte)
 *
 * RotaÃ§Ã£o sprite (sprite default aponta para Norte/cima):
 *   Norte  â rotation.z = 0
 *   Leste  â rotation.z = -PI/2
 *   Sul    â rotation.z =  PI  (ou -PI)
 *   Oeste  â rotation.z =  PI/2
 */

// Armazena carros IA separados de GTA.allCars (que Ã© do player)
GTA.aiCarsPath = GTA.aiCarsPath || [];
GTA._aiUsedBuckets = GTA._aiUsedBuckets || {};
GTA._aiStarted = GTA._aiStarted || false;

// === CARROS IA — tráfego em volta do PLAYER (segue a câmera) ===
// A cada pass: recicla carros distantes e gera circuitos numa janela ao redor
// do player. Anel = volta no quarteirão (sem ré, sem sumir). Rua longa = as
// pontas entram no prédio (volta escondida). 2 carros por circuito. So modelos limpos.

GTA._aiTopType = function ( base, c, r ) {
    var col = base[c]; if (!col) return -1;
    var cell = col[r]; if (!cell || !cell.blocks) return -1;
    for (var z = cell.blocks.length - 1; z >= 0; z--) { var b = cell.blocks[z]; if (b && b.type != null) return b.type; }
    return -1;
};

GTA._placeAICar = function ( car ) {
    var p = car._path;
    var d = p.progress % p.total; if (d < 0) d += p.total;
    var acc = 0, seg = p.segs[0], t = 0;
    for (var i = 0; i < p.segs.length; i++) {
        if (d <= acc + p.segs[i].len || i === p.segs.length - 1) { seg = p.segs[i]; t = seg.len > 0 ? (d - acc) / seg.len : 0; break; }
        acc += p.segs[i].len;
    }
    if (t < 0) t = 0; if (t > 1) t = 1;
    car.sprite.position.x = seg.x0 + seg.dx * t;
    car.sprite.position.y = seg.y0 + seg.dy * t;
    car.sprite.rotation.z = seg.ang + Math.PI / 2;
};

GTA._aiMk = function ( game, pts, CLEAN, startFrac, key ) {
    var idx = GTA.aiCarsPath.length;
    try {
        var car = new GTA.GameObjectPosition();
        car.addCar(game, CLEAN[idx % CLEAN.length], 0, 0, 0, 0);
        var segs = [], total = 0;
        for (var i = 0; i < pts.length - 1; i++) { var dx = pts[i+1][0]-pts[i][0], dy = pts[i+1][1]-pts[i][1], len = Math.sqrt(dx*dx+dy*dy); segs.push({ x0: pts[i][0], y0: pts[i][1], dx: dx, dy: dy, len: len, ang: Math.atan2(dy, dx) }); total += len; }
        car._path = { pts: pts, segs: segs, total: total, speed: 55 + (idx%4)*12, progress: startFrac*total, _dmgCooldown: 0 };
        car._bk = key;
        GTA._placeAICar(car); car.sprite.position.z = 128 + (idx%6); game.scene.add(car.sprite); GTA.aiCarsPath.push(car);
        return true;
    } catch (e) { return false; }
};

GTA._aiPass = function ( game ) {
    var CLEAN = [58, 29, 41, 27, 13, 9, 28, 6, 21, 34, 2, 37];
    var WIN = 22, REG = 8, MAX = 70, CARS_PER = 2, RECYCLE = 4200;
    var base = game.map.base, used = GTA._aiUsedBuckets;
    var cam = game.camera.position, cx = cam.x, cy = cam.y;
    // recicla carros distantes do player (libera a regiao p/ novos)
    for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) { var c = GTA.aiCarsPath[i]; var dx = c.sprite.position.x - cx, dy = c.sprite.position.y - cy; if (Math.sqrt(dx*dx+dy*dy) > RECYCLE) { try { game.scene.remove(c.sprite); } catch (e) {} if (c._bk) delete used[c._bk]; GTA.aiCarsPath.splice(i, 1); } }
    function road(cc, rr) { return GTA._aiTopType(base, cc, rr) === 2; }
    function wt(x, y) { return GTA._aiTopType(base, Math.round(x/64), -Math.round(y/64)); }
    function valid(pts) { for (var s = 0; s < pts.length - 1; s++) { var x0 = pts[s][0], y0 = pts[s][1], x1 = pts[s+1][0], y1 = pts[s+1][1], dx = x1-x0, dy = y1-y0, len = Math.sqrt(dx*dx+dy*dy); if (len < 1) continue; var ux = dx/len, uy = dy/len, px = -uy, py = ux, st = Math.max(2, Math.round(len/18)); for (var i = 0; i <= st; i++) { var t = i/st, x = x0+dx*t, y = y0+dy*t; if (wt(x+px*26,y+py*26)!==2 || wt(x-px*26,y-py*26)!==2 || wt(x,y)!==2) return false; } } return true; }
    var rc = Math.round(cx/64), rr0 = -Math.round(cy/64);
    var C0 = Math.max(3, rc-WIN), C1 = Math.min(251, rc+WIN), R0 = Math.max(3, rr0-WIN), R1 = Math.min(252, rr0+WIN);
    var H = [], V = [];
    for (var r = R0; r <= R1; r++) { var c = C0; while (c < C1) { if (road(c,r) && road(c,r+1)) { var c0 = c; while (c < C1 && road(c,r) && road(c,r+1)) c++; if ((c-c0) >= 4) H.push({ r: r, c0: c0, c1: c-1, len: c-c0 }); } else c++; } }
    for (var cc = C0; cc <= C1; cc++) { var r2 = R0; while (r2 < R1) { if (road(cc,r2) && road(cc+1,r2)) { var r0 = r2; while (r2 < R1 && road(cc,r2) && road(cc+1,r2)) r2++; if ((r2-r0) >= 4) V.push({ c: cc, r0: r0, r1: r2-1, len: r2-r0 }); } else r2++; } }
    function bk(r, c) { return Math.floor(r/REG) + '_' + Math.floor(c/REG); }
    function emit(pts, key) { if (GTA.aiCarsPath.length >= MAX) return; for (var m = 0; m < CARS_PER; m++) { if (GTA.aiCarsPath.length >= MAX) break; GTA._aiMk(game, pts, CLEAN, m/CARS_PER, key); } used[key] = 1; }
    var added = 0;
    for (var i2 = 0; i2 < H.length; i2++) { if (GTA.aiCarsPath.length >= MAX) break; var a = H[i2]; for (var j = 0; j < H.length; j++) { var b = H[j]; var gap = b.r - a.r; if (gap < 4 || gap > 14) continue; var ovL = Math.max(a.c0,b.c0), ovR = Math.min(a.c1,b.c1); if (ovR-ovL < 4) continue; var sides = []; for (var k = 0; k < V.length; k++) { var v = V[k]; if (v.c>=ovL && v.c<=ovR && v.r0<=a.r && v.r1>=b.r) sides.push(v.c); } if (sides.length < 2) continue; var cL = Math.min.apply(0,sides), cR = Math.max.apply(0,sides); if (cR-cL < 4 || cR-cL > 14) continue; var key = bk(a.r, (cL+cR)/2); if (used[key]) continue; var tY = -(64*a.r+32), bY = -(64*b.r+32), lX = 64*cL+32, rX = 64*cR+32; var ring = [[lX,tY],[rX,tY],[rX,bY],[lX,bY],[lX,tY]]; if (valid(ring)) { emit(ring, key); added++; } } }
    var cand = []; for (var hi = 0; hi < H.length; hi++) cand.push({ d:'h', r:H[hi].r, a:H[hi].c0, b:H[hi].c1, len:H[hi].len }); for (var vi = 0; vi < V.length; vi++) cand.push({ d:'v', c:V[vi].c, a:V[vi].r0, b:V[vi].r1, len:V[vi].len }); cand.sort(function (x, y) { return y.len - x.len; });
    for (var s = 0; s < cand.length; s++) { if (GTA.aiCarsPath.length >= MAX) break; var q = cand[s]; if (q.len < 6) continue; var key, mid, pts; if (q.d === 'h') { key = bk(q.r, (q.a+q.b)/2); if (used[key]) continue; var y = -(64*q.r+32); mid = [[64*q.a, y],[64*q.b, y]]; pts = [[64*(q.a-1), y],[64*(q.b+1), y]]; } else { key = bk((q.a+q.b)/2, q.c); if (used[key]) continue; var x = 64*q.c+32; mid = [[x, -(64*q.a)],[x, -(64*q.b)]]; pts = [[x, -(64*(q.a-1))],[x, -(64*(q.b+1))]]; } if (valid(mid)) { emit(pts, key); added++; } }
    return added;
};

GTA.spawnAICars = function ( game ) {
    if (GTA._aiStarted) return;
    GTA._aiStarted = true;
    GTA._aiUsedBuckets = {};
    GTA._aiPass(game);
    GTA._aiInterval = setInterval(function () { try { GTA._aiPass(game); } catch (e) {} }, 2500);
    GTA.Log('AI: gerador de trafego (em volta do player) iniciado');
};

GTA.updateAICars = function ( delta ) {
    GTA.aiCarsPath.forEach(function ( car ) {
        var p = car._path;
        p.progress += p.speed * delta;
        if (p.progress >= p.total) p.progress -= p.total;
        GTA._placeAICar(car);
    });
};

// Boot robusto: tenta ate jogo/mapa/sprites prontos, spawna pedestres e inicia
// o gerador. A geracao segue a camera, entao os carros aparecem onde o player esta.
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
