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

// === CARROS IA — gerados automaticamente a partir das ruas do mapa ===
// Varre game.map.base, acha corredores de asfalto (type 2) por toda a
// cidade e cria uma rota de faixa em cada um (distribuidos por regiao).
// So usa modelos que renderizam limpos (sem quadrado preto).
// Rotacao: rotation.z = heading + PI/2.

GTA._aiTopType = function ( base, c, r ) {
    var col = base[c]; if (!col) return -1;
    var cell = col[r]; if (!cell || !cell.blocks) return -1;
    for (var z = cell.blocks.length - 1; z >= 0; z--) {
        var b = cell.blocks[z];
        if (b && b.type != null) return b.type;
    }
    return -1;
};

GTA._placeAICar = function ( car ) {
    var p = car._path;
    var d = p.progress % p.total; if (d < 0) d += p.total;
    var acc = 0, seg = p.segs[0], t = 0;
    for (var i = 0; i < p.segs.length; i++) {
        if (d <= acc + p.segs[i].len || i === p.segs.length - 1) {
            seg = p.segs[i]; t = seg.len > 0 ? (d - acc) / seg.len : 0; break;
        }
        acc += p.segs[i].len;
    }
    if (t < 0) t = 0; if (t > 1) t = 1;
    car.sprite.position.x = seg.x0 + seg.dx * t;
    car.sprite.position.y = seg.y0 + seg.dy * t;
    car.sprite.rotation.z = seg.ang + Math.PI / 2;
};

GTA.spawnAICars = function ( game ) {
    var base = game.map.base;
    var CLEAN = [58, 29, 41, 27, 13, 9, 28, 6, 21, 34, 2, 37];
    function road(c, r) { return GTA._aiTopType(base, c, r) === 2; }

    var H = [], V = [];
    for (var r = 3; r < 253; r++) {
        var c = 3;
        while (c < 252) {
            if (road(c, r) && road(c, r + 1)) {
                var c0 = c;
                while (c < 252 && road(c, r) && road(c, r + 1)) c++;
                if ((c - c0) >= 8) H.push({ r: r, c0: c0, c1: c - 1, len: c - c0 });
            } else c++;
        }
    }
    for (var cc = 3; cc < 252; cc++) {
        var rr = 3;
        while (rr < 253) {
            if (road(cc, rr) && road(cc + 1, rr)) {
                var r0 = rr;
                while (rr < 253 && road(cc, rr) && road(cc + 1, rr)) rr++;
                if ((rr - r0) >= 8) V.push({ c: cc, r0: r0, r1: rr - 1, len: rr - r0 });
            } else rr++;
        }
    }

    var REG = 48;
    function pickBest(list, key) {
        var best = {};
        list.forEach(function (s) { var k = key(s); if (!best[k] || s.len > best[k].len) best[k] = s; });
        return Object.keys(best).map(function (k) { return best[k]; });
    }
    var Hp = pickBest(H, function (s) { return Math.floor(s.r / REG) + '_' + Math.floor(((s.c0 + s.c1) / 2) / REG); });
    var Vp = pickBest(V, function (s) { return Math.floor(s.c / REG) + '_' + Math.floor(((s.r0 + s.r1) / 2) / REG); });

    var defs = [];
    Hp.forEach(function (s, i) {
        var y = -(64 * s.r + 32), x0 = 64 * s.c0 + 40, x1 = 64 * (s.c1 + 1) - 40;
        defs.push((i % 2) ? [[x1, y], [x0, y]] : [[x0, y], [x1, y]]);
    });
    Vp.forEach(function (s, i) {
        var x = 64 * s.c + 32, y0 = -(64 * s.r0 + 40), y1 = -(64 * (s.r1 + 1) - 40);
        defs.push((i % 2) ? [[x, y1], [x, y0]] : [[x, y0], [x, y1]]);
    });

    defs.forEach(function (pts, idx) {
        try {
            var c = new GTA.GameObjectPosition();
            c.addCar(game, CLEAN[idx % CLEAN.length], 0, 0, 0, 0);
            var segs = [], total = 0;
            for (var i = 0; i < pts.length - 1; i++) {
                var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
                var len = Math.sqrt(dx * dx + dy * dy);
                segs.push({ x0: pts[i][0], y0: pts[i][1], dx: dx, dy: dy, len: len, ang: Math.atan2(dy, dx) });
                total += len;
            }
            c._path = { pts: pts, segs: segs, total: total, speed: 60 + (idx % 4) * 12, progress: (idx * 97) % total, _dmgCooldown: 0 };
            GTA._placeAICar(c);
            c.sprite.position.z = 128 + (idx % 6);
            game.scene.add(c.sprite);
            GTA.aiCarsPath.push(c);
        } catch (e) {
            GTA.Log('AI car spawn error: ' + e.message);
        }
    });

    GTA.Log('AI: ' + GTA.aiCarsPath.length + ' carros gerados pela cidade');
};

GTA.updateAICars = function ( delta ) {
    GTA.aiCarsPath.forEach(function ( car ) {
        var p = car._path;
        p.progress += p.speed * delta;
        if (p.progress >= p.total) p.progress -= p.total;
        GTA._placeAICar(car);

        var _game = window._gtaGame;
        if (_game && _game.player && !_game.player.inCar) {
            var _pl = _game.player;
            var _cx = _pl.position.x - car.sprite.position.x;
            var _cy = _pl.position.y - car.sprite.position.y;
            if (Math.sqrt(_cx * _cx + _cy * _cy) < 50) {
                if (!p._dmgCooldown || p._dmgCooldown <= 0) {
                    if (typeof window.GTA_health !== 'undefined') {
                        window.GTA_health = Math.max(0, window.GTA_health - 1);
                        GTA.Log('Atropelado! Vida: ' + window.GTA_health);
                    }
                    p._dmgCooldown = 1.5;
                }
            }
        }
        if (p._dmgCooldown > 0) p._dmgCooldown -= delta;
    });
};

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
