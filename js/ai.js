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
    var d = p.progress % p.total; if (d < 0) d += p.total;
    var acc = 0, seg = p.segs[0], t = 0;
    for (var i = 0; i < p.segs.length; i++) {
        if (d <= acc + p.segs[i].len || i === p.segs.length - 1) { seg = p.segs[i]; t = seg.len > 0 ? (d - acc) / seg.len : 0; break; }
        acc += p.segs[i].len;
    }
    if (t < 0) t = 0; if (t > 1) t = 1;
    var bx = seg.x0 + seg.dx * t, by = seg.y0 + seg.dy * t;
    car.sprite.position.x = bx + seg.uy * GTA._AI_OFF;
    car.sprite.position.y = by - seg.ux * GTA._AI_OFF;
    car.sprite.rotation.z = seg.ang + Math.PI / 2;
};

GTA._aiMk = function ( game, pts, CLEAN, startFrac, key ) {
    var idx = GTA.aiCarsPath.length;
    try {
        var car = new GTA.GameObjectPosition();
        car.addCar(game, GTA._aiClean[idx % GTA._aiClean.length], 0, 0, 0, 0);
        var segs = [], total = 0;
        for (var i = 0; i < pts.length - 1; i++) { var dx = pts[i+1][0]-pts[i][0], dy = pts[i+1][1]-pts[i][1], len = Math.sqrt(dx*dx+dy*dy); segs.push({ x0:pts[i][0], y0:pts[i][1], dx:dx, dy:dy, len:len, ux:len>0?dx/len:0, uy:len>0?dy/len:0, ang:Math.atan2(dy,dx) }); total += len; }
        var speed = Math.max(35, Math.min(95, total / 9));
        car._path = { pts:pts, segs:segs, total:total, speed:speed, progress:startFrac*total, _dmgCooldown:0 };
        car._bk = key;
        GTA._placeAICar(car); car.sprite.position.z = 128 + (idx%6); game.scene.add(car.sprite); GTA.aiCarsPath.push(car);
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
    var WIN = 22, REG = 6, MAX = 70, CARS_PER = 2, RECYCLE = 4500, OFFSCR = 600, EXT = 40;
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
    for (var r = R0; r <= R1; r++) { var c = C0; while (c < C1) { if (road(c,r) && road(c,r+1)) { var c0 = c; while (c < C1 && road(c,r) && road(c,r+1)) c++; if ((c-c0) >= 4) H.push({ r:r, c0:c0, c1:c-1, len:c-c0 }); } else c++; } }
    for (var cc = C0; cc <= C1; cc++) { var r2 = R0; while (r2 < R1) { if (road(cc,r2) && road(cc+1,r2)) { var r0 = r2; while (r2 < R1 && road(cc,r2) && road(cc+1,r2)) r2++; if ((r2-r0) >= 4) V.push({ c:cc, r0:r0, r1:r2-1, len:r2-r0 }); } else r2++; } }
    function bk(r, c) { return Math.floor(r/REG) + '_' + Math.floor(c/REG); }
    for (var i2 = 0; i2 < H.length; i2++) { if (GTA.aiCarsPath.length >= MAX) break; var a = H[i2]; for (var j = 0; j < H.length; j++) { var b = H[j]; var gap = b.r - a.r; if (gap < 4 || gap > 16) continue; var ovL = Math.max(a.c0,b.c0), ovR = Math.min(a.c1,b.c1); if (ovR-ovL < 4) continue; var sides = []; for (var k = 0; k < V.length; k++) { var v = V[k]; if (v.c>=ovL && v.c<=ovR && v.r0<=a.r && v.r1>=b.r) sides.push(v.c); } if (sides.length < 2) continue; var cL = Math.min.apply(0,sides), cR = Math.max.apply(0,sides); if (cR-cL < 4 || cR-cL > 16) continue; var midC = Math.round((cL+cR)/2), midR = Math.round((a.r+b.r)/2); if (road(midC, midR)) continue; var key = bk(a.r, (cL+cR)/2); if (used[key]) continue; var tY = -(64*a.r+32), bY = -(64*b.r+32), lX = 64*cL+32, rX = 64*cR+32; var ring = [[lX,tY],[rX,tY],[rX,bY],[lX,bY],[lX,tY]]; if (valid(ring)) emit(ring, key); } }
    var cand = []; for (var hi = 0; hi < H.length; hi++) cand.push({ d:'h', r:H[hi].r, a:H[hi].c0, b:H[hi].c1, len:H[hi].len }); for (var vi = 0; vi < V.length; vi++) cand.push({ d:'v', c:V[vi].c, a:V[vi].r0, b:V[vi].r1, len:V[vi].len }); cand.sort(function (x, y) { return y.len - x.len; });
    for (var s = 0; s < cand.length; s++) { if (GTA.aiCarsPath.length >= MAX) break; var q = cand[s]; if (q.len < 6) continue; var key, pts;
        if (q.d === 'h') { var cm = Math.round((q.a+q.b)/2); if (!(widthX(cm,q.r) > heightY(cm,q.r))) continue; key = bk(q.r, (q.a+q.b)/2); if (used[key]) continue; var a2 = q.a, b2 = q.b, ex = 0; while (a2 > 3 && road(a2-1,q.r) && road(a2-1,q.r+1) && ex < EXT) { a2--; ex++; } ex = 0; while (b2 < 250 && road(b2+1,q.r) && road(b2+1,q.r+1) && ex < EXT) { b2++; ex++; } var y = -(64*q.r+32); pts = [[64*a2, y],[64*b2, y]]; }
        else { var rm = Math.round((q.a+q.b)/2); if (!(heightY(q.c,rm) > widthX(q.c,rm))) continue; key = bk((q.a+q.b)/2, q.c); if (used[key]) continue; var rr1 = q.a, rr2 = q.b, ex = 0; while (rr1 > 3 && road(q.c,rr1-1) && road(q.c+1,rr1-1) && ex < EXT) { rr1--; ex++; } ex = 0; while (rr2 < 251 && road(q.c,rr2+1) && road(q.c+1,rr2+1) && ex < EXT) { rr2++; ex++; } var x = 64*q.c+32; pts = [[x, -(64*rr1)],[x, -(64*rr2)]]; }
        if (valid(pts)) emit(pts, key); }
    return 0;
};

GTA.spawnAICars = function ( game ) {
    if (GTA._aiStarted) return;
    GTA._aiStarted = true; GTA._aiUsedBuckets = {};
    GTA._aiPass(game);
    GTA._aiInterval = setInterval(function () { try { GTA._aiPass(game); } catch (e) {} }, 2500);
    GTA.Log('AI: trafego (rotas longas) iniciado');
};

GTA.updateAICars = function ( delta ) {
    var cam = window._gtaGame.camera.position;
    for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) {
        var car = GTA.aiCarsPath[i]; var p = car._path;
        p.progress += p.speed * delta;
        if (p.progress >= p.total) {
            var s = p.pts[0];
            if (Math.sqrt((s[0]-cam.x)*(s[0]-cam.x) + (s[1]-cam.y)*(s[1]-cam.y)) < 560) { try { window._gtaGame.scene.remove(car.sprite); } catch (e) {} GTA.aiCarsPath.splice(i, 1); continue; }
            p.progress -= p.total;
        }
        GTA._placeAICar(car);
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
