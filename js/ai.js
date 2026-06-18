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

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// CARROS IA  â  movimento direto em Three.js, sem Box2D
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

GTA.spawnAICars = function ( game ) {

    var P = Math.PI;

    // [tipo, startX, startY, endX, endY, rotZ, speed(px/s)]
    // Regra GTA1: trÃ¡fego pela direita
    //   Leste  â faixa sul   y=-208, de x=430 a x=590
    //   Oeste  â faixa norte y=-176, de x=590 a x=430
    //   Sul    â faixa oeste x=496,  de y=-152 a y=-248
    //   Norte  â faixa leste x=528,  de y=-248 a y=-152
    // [tipo, startX, startY, endX, endY, rotZ, speed(px/s)]
    // Regra GTA1: trÃ¡fego pela direita
    //   Leste  â faixa sul   y=-208, de x=380 a x=640
    //   Oeste  â faixa norte y=-176, de x=640 a x=380
    //   Sul    â faixa oeste x=496,  de y=-120 a y=-280
    //   Norte  â faixa leste x=528,  de y=-280 a y=-120
    var routes = [
        [58,  380, -208,  640, -208, -P/2,  80],   // Leste  (260px / 80px/s = 3.25s)
        [ 4,  640, -176,  380, -176,  P/2,  80],   // Oeste
        [58,  496, -120,  496, -280,   P,   60],   // Sul    (160px / 60px/s = 2.67s)
        [ 4,  528, -280,  528, -120,   0,   60],   // Norte
    ];

    routes.forEach(function (r, idx) {
        try {
            var c = new GTA.GameObjectPosition();
            c.addCar(game, r[0], 64, 64, 128, 0);

            var dx = r[3] - r[1];
            var dy = r[4] - r[2];
            var totalDist = Math.sqrt(dx * dx + dy * dy);

            // Escalonar: cada carro comeÃ§a em 1/4 da rota para nunca sincronizarem
            var initialProgress = (idx / routes.length) * totalDist;

            c.sprite.position.x = r[1] + dx * (initialProgress / totalDist);
            c.sprite.position.y = r[2] + dy * (initialProgress / totalDist);
            c.sprite.position.z = 128;
            c.sprite.rotation.z = r[5];
            game.scene.add(c.sprite);

            c._path = {
                startX:    r[1],
                startY:    r[2],
                endX:      r[3],
                endY:      r[4],
                rot:       r[5],
                speed:     r[6],
                dx:        dx,
                dy:        dy,
                totalDist: totalDist,
                progress:  initialProgress,
                _dmgCooldown: 0
            };

            GTA.aiCarsPath.push(c);

        } catch (e) {
            GTA.Log('AI car spawn error: ' + e.message);
        }
    });

    GTA.Log('AI: spawnAICars done (' + routes.length + ' carros)');
};

// Chamado a cada frame por core.js
GTA.updateAICars = function ( delta ) {
    GTA.aiCarsPath.forEach(function (car) {
        var p = car._path;

        // ââ AvanÃ§ar na rota âââââââââââââââââââââââââââââââââââ
        p.progress += p.speed * delta;

        if (p.progress >= p.totalDist) {
            // Chegou ao fim â reinicia imediatamente sem pausa
            p.progress = 0;
        }

        var t = p.progress / p.totalDist;
        car.sprite.position.x = p.startX + p.dx * t;
        car.sprite.position.y = p.startY + p.dy * t;

        // ââ ColisÃ£o com player a pÃ© âââââââââââââââââââââââââââ
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

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// PEDESTRES IA
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
