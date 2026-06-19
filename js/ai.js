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
GTA._aiStarted = GTA._aiStarted || false;
GTA.allCars = GTA.allCars || [];

// === TRAFEGO IA — carros vagueiam pelas ruas e viram nos cruzamentos ===
// Nunca somem (nao teleportam): andam de tile em tile escolhendo ruas, viram
// nas esquinas, nascem FORA da tela e dirigem na faixa da DIREITA (nao na linha
// amarela, e sem bater de frente). Recicla os distantes. Roubaveis (disableAICar).

GTA._AI_OFF = 15; // deslocamento p/ a faixa da direita
GTA._aiClean = [58, 29, 41, 27, 13, 9, 28, 6, 21, 34, 2, 37];

GTA._aiTopType = function ( base, c, r ) {
    var col = base[c]; if (!col) return -1;
    var cell = col[r]; if (!cell || !cell.blocks) return -1;
    for (var z = cell.blocks.length - 1; z >= 0; z--) { var b = cell.blocks[z]; if (b && b.type != null) return b.type; }
    return -1;
};

GTA._wNext = function ( car ) {
    var base = window._gtaGame.map.base, w = car._w;
    function road(c, r) { return GTA._aiTopType(base, c, r) === 2; }
    var col = Math.round(w.px/64), row = -Math.round(w.py/64), d = w.dir;
    var perp = [[-d[1], d[0]], [d[1], -d[0]]];
    var straightOk = road(col + d[0], row - d[1]);
    var turns = perp.filter(function (dd) { return road(col + dd[0], row - dd[1]); });
    var pick = null;
    if (straightOk && (turns.length === 0 || Math.random() < 0.72)) pick = d;
    else if (turns.length) pick = turns[Math.floor(Math.random()*turns.length)];
    else if (straightOk) pick = d;
    else { var rev = [-d[0], -d[1]]; if (road(col + rev[0], row - rev[1])) pick = rev; }
    if (!pick) return false;
    w.dir = pick; w.tcx = 64*(col + pick[0]); w.tcy = -64*(row - pick[1]); return true;
};

GTA._wUpdate = function ( car, delta ) {
    var w = car._w;
    var dx = w.tcx - w.px, dy = w.tcy - w.py, d = Math.sqrt(dx*dx + dy*dy);
    var step = w.speed * delta;
    if (d <= step || d < 1) { w.px = w.tcx; w.py = w.tcy; if (!GTA._wNext(car)) return false; }
    else { w.px += dx/d*step; w.py += dy/d*step; }
    var lr = [w.dir[1], -w.dir[0]];
    car.sprite.position.x = w.px + lr[0]*GTA._AI_OFF;
    car.sprite.position.y = w.py + lr[1]*GTA._AI_OFF;
    car.sprite.rotation.z = Math.atan2(w.dir[1], w.dir[0]) + Math.PI/2;
    return true;
};

// Roubar: converte o carro IA em carro DIRIGIVEL (Box2D)
GTA.disableAICar = function ( car ) {
    var i = GTA.aiCarsPath.indexOf(car); if (i >= 0) GTA.aiCarsPath.splice(i, 1);
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
    var TARGET = 16, WIN = 22, RECYCLE = 4000, OFFSCR = 520;
    var base = game.map.base;
    function road(c, r) { return GTA._aiTopType(base, c, r) === 2; }
    var cam = game.camera.position, cx = cam.x, cy = cam.y;
    for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) { var c = GTA.aiCarsPath[i]; var dx = c.sprite.position.x - cx, dy = c.sprite.position.y - cy; if (Math.sqrt(dx*dx+dy*dy) > RECYCLE) { try { game.scene.remove(c.sprite); } catch (e) {} GTA.aiCarsPath.splice(i, 1); } }
    var rc = Math.round(cx/64), rr0 = -Math.round(cy/64), dirs = [[1,0],[-1,0],[0,1],[0,-1]], tries = 0;
    while (GTA.aiCarsPath.length < TARGET && tries < 60) {
        tries++;
        var col = rc + Math.floor((Math.random()*2-1)*WIN), row = rr0 + Math.floor((Math.random()*2-1)*WIN);
        if (!road(col, row)) continue;
        var wx = 64*col, wy = -64*row;
        if (Math.sqrt((wx-cx)*(wx-cx)+(wy-cy)*(wy-cy)) < OFFSCR) continue;
        var vd = dirs.filter(function (d) { return road(col + d[0], row - d[1]); });
        if (!vd.length) continue;
        var idx = GTA.aiCarsPath.length;
        try {
            var car = new GTA.GameObjectPosition();
            car.addCar(game, GTA._aiClean[idx % GTA._aiClean.length], 0, 0, 0, 0);
            car._w = { px: wx, py: wy, dir: vd[Math.floor(Math.random()*vd.length)], speed: 60 + (idx%4)*12, tcx: wx, tcy: wy };
            GTA._wNext(car);
            car.sprite.position.z = 128 + (idx%6);
            game.scene.add(car.sprite); GTA.aiCarsPath.push(car);
        } catch (e) {}
    }
    return 0;
};

GTA.spawnAICars = function ( game ) {
    if (GTA._aiStarted) return;
    GTA._aiStarted = true;
    GTA._aiPass(game);
    GTA._aiInterval = setInterval(function () { try { GTA._aiPass(game); } catch (e) {} }, 2500);
    GTA.Log('AI: trafego (wander) iniciado');
};

GTA.updateAICars = function ( delta ) {
    for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) {
        var car = GTA.aiCarsPath[i];
        if (car._w) { if (!GTA._wUpdate(car, delta)) { try { window._gtaGame.scene.remove(car.sprite); } catch (e) {} GTA.aiCarsPath.splice(i, 1); } }
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
