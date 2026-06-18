/*
 * ai.js - Carros IA + Pedestres IA para WebGL-GTA (ATG1)
 *
 * Player nasce em Three.js (512, -192) via GTA.Debug.startPosition=[8,3,2]
 *
 * Formula sprite local (core.js render loop):
 *   sprite_x = bx * 10 - 32
 *   sprite_y = -by * 10 + 32
 * Para exibir em Three.js (tx, ty):
 *   bx = (tx + 32) / 10  â  carX = tx + 64   (tipo 58/4, h=64)
 *   by = (32 - ty) / 10  â  carY = 64 - ty    (tipo 58/4, h=64)
 *
 * Via de 64 units de largura centrada em y=-192 (horizontal) e x=512 (vertical):
 *   Lane offset = 16 units â faixas em y=-208/-176 e x=496/528
 */

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// CARROS IA
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

GTA.spawnAICars = function ( game ) {

    var P = Math.PI;

    // Faixas centradas na via (offset 16 units do centro):
    //   Via horizontal centrada em y=-192: faixas em y=-208 (leste) e y=-176 (oeste)
    //   Via vertical   centrada em x=512:  faixas em x=496  (sul)   e x=528  (norte)
    //
    // ConversÃ£o: carX = tx+64, carY = 64-ty
    //   y=-208 â carY=272   y=-176 â carY=240
    //   x=496  â carX=560   x=528  â carX=592
    //
    // Angulo: East=-PI/2  West=PI/2  South=0  North=PI
    // Velocidade Box2D: vx=-sin(a)*speed, vy=cos(a)*speed
    // Progresso: -sin(a)*(pos.x-sx) + cos(a)*(pos.y-sy)
    //
    // Via horizontal (segLen=14 Box2D = 140 Three.js units, x de 440 a 580):
    //   Lane Leste (ty=-208): carX_start=504, carY=272
    //   Lane Oeste (ty=-176): carX_start=644, carY=240
    // Via vertical (segLen=8 Box2D = 80 Three.js units, y de -152 a -232):
    //   Lane Sul  (tx=496): carX=560, carY_start=216
    //   Lane Norte(tx=528): carX=592, carY_start=296
    var defs = [
        // [tipo, carX, carY, angulo, speed, segLen]
        [58,  504, 272, -P/2, 8, 14],   // Leste: ty=-208, x 440â580
        [4,   644, 240,  P/2, 8, 14],   // Oeste: ty=-176, x 580â440
        [58,  560, 216,    0, 7,  8],   // Sul:   tx=496,  y -152â-232
        [4,   592, 296,    P, 7,  8],   // Norte: tx=528,  y -232â-152
    ];

    defs.forEach(function(d) {
        try {
            var c = new GTA.GameObjectPosition();
            c.addCar(game, d[0], d[1], d[2], 128, 0);
            c.initPhysics(game);

            var physPos = c.physics.GetPosition();

            // Sprite DIRETO na cena (sem depender de secao)
            c.sprite.position.x = physPos.x * 10 - 32;
            c.sprite.position.y = -physPos.y * 10 + 32;
            c.sprite.position.z = 128;
            game.scene.add(c.sprite);

            // Kinematico: nao colide com edificios nem com outros carros IA
            c.physics.SetType(Box2D.Dynamics.b2Body.b2_kinematicBody);

            c._ai = {
                active:    true,
                angle:     d[3],
                speed:     d[4],
                segLen:    d[5],
                startX:    physPos.x,
                startY:    physPos.y,
                hideTimer: 0
            };

            GTA.allCars.push(c);

        } catch(e) {
            GTA.Log('AI car spawn error: ' + e.message);
        }
    });

    GTA.Log('AI: spawnAICars done (' + defs.length + ' carros)');
};

// Chamado a cada frame por core.js
GTA.updateAICars = function ( delta ) {
    if (!GTA.allCars) return;
    GTA.allCars.forEach(function(car) {
        if (!car || !car._ai || !car._ai.active) return;
        var ai  = car._ai;

        // Teleporte invisivel: esconde sprite por 50 ms
        if (ai.hideTimer > 0) {
            ai.hideTimer -= delta;
            if (ai.hideTimer <= 0) {
                ai.hideTimer = 0;
                if (car.sprite) car.sprite.visible = true;
            }
            return;
        }

        var pos = car.physics.GetPosition();
        var dx  = pos.x - ai.startX;
        var dy  = pos.y - ai.startY;

        // Progresso ao longo da direcao da lane
        var progress = -Math.sin(ai.angle) * dx + Math.cos(ai.angle) * dy;

        if (progress > ai.segLen) {
            car.physics.SetPosition(
                new Box2D.Common.Math.b2Vec2(ai.startX, ai.startY)
            );
            car.physics.SetLinearVelocity(
                new Box2D.Common.Math.b2Vec2(0, 0)
            );
            if (car.sprite) car.sprite.visible = false;
            ai.hideTimer = 0.05;
            return;
        }

        // Movimento unidirecional constante na lane
        var a = ai.angle;
        car.physics.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(
                -Math.sin(a) * ai.speed,
                 Math.cos(a) * ai.speed
            )
        );
        car.physics.SetAngle(a);
        car.physics.SetAngularVelocity(0);
        car.physics.SetAwake(true);

        // ââ ColisÃ£o com player a pÃ© ââââââââââââââââââââââââââââ
        var _game = window._gtaGame;
        if (_game && _game.player && !_game.player.inCar && car.sprite && car.sprite.visible) {
            var _pl  = _game.player;
            var _cdx = _pl.position.x - car.sprite.position.x;
            var _cdy = _pl.position.y - car.sprite.position.y;
            var _cdist = Math.sqrt(_cdx * _cdx + _cdy * _cdy);
            if (_cdist < 55) {
                if (!ai._dmgCooldown || ai._dmgCooldown <= 0) {
                    if (typeof window.GTA_health !== 'undefined') {
                        window.GTA_health = Math.max(0, window.GTA_health - 1);
                        GTA.Log('Atropelado! Vida: ' + window.GTA_health);
                    }
                    ai._dmgCooldown = 1.5;
                }
            }
        }
        if (ai._dmgCooldown && ai._dmgCooldown > 0) {
            ai._dmgCooldown -= delta;
        }
    });
};

// Chamado por player.js quando o player entra no carro
GTA.disableAICar = function ( car ) {
    if (car && car._ai) {
        car._ai.active = false;
        car.physics.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(0, 0)
        );
        car.physics.SetType(
            Box2D.Dynamics.b2Body.b2_dynamicBody
        );
    }
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

    // Calcadas ao redor do player (512, -192).
    // Confirmadas pelos pickups (norte y=-140, sul y=-270, oeste x=416, leste x=608).
    var positions = [
        [448, -145],   // calcada norte-oeste
        [512, -142],   // calcada norte-centro
        [570, -148],   // calcada norte-leste
        [416, -198],   // calcada oeste
        [608, -196],   // calcada leste
        [450, -262],   // calcada sul-oeste
        [512, -265],   // calcada sul-centro
        [574, -258],   // calcada sul-leste
    ];

    var spawned = 0;
    positions.forEach(function(pos) {
        try {
            var ped = new GTA.AIPedestrian(game, pos[0], pos[1], pedOffset);
            GTA.aiPedestrians.push(ped);
            spawned++;
        } catch(e) {
            GTA.Log('AI ped spawn error: ' + e.message);
        }
    });

    GTA.Log('AI: ' + spawned + ' pedestres criados');

    // Spawn carros IA logo apos pedestres
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
    } catch(e) {
        GTA.Log('AI sprite error: ' + e.message);
        this.sprite = null;
    }

    this.position.x = worldX;
    this.position.y = worldY;
    this.position.z = 128;

    // ââ Eixo de patrulha âââââââââââââââââââââââââââââââââââââ
    // CalÃ§adas E/O (xâ416 ou xâ608, >70 units do centro x=512): andam em Y
    // CalÃ§adas N/S (yâ-144 ou yâ-263): andam em X
    var dxFromCenterX = Math.abs(worldX - 512);
    this._patrolAxis = (dxFromCenterX > 70) ? 'y' : 'x';

    // Ãngulo inicial sempre ao longo do eixo de patrulha
    if (this._patrolAxis === 'x') {
        this._aiAngle = (Math.random() < 0.5) ? 0 : Math.PI;               // Leste ou Oeste
    } else {
        this._aiAngle = (Math.random() < 0.5) ? Math.PI / 2 : -Math.PI / 2; // Norte ou Sul
    }

    this._aiTimer    = Math.random() * 3;
    this._aiInterval = 2 + Math.random() * 4;
    this._stopped    = false;
    this._stopTimer  = 0;
    this._speed      = 25 + Math.random() * 20;
    this._fleeSpd    = 0;

    this._originX = worldX;
    this._originY = worldY;
    this._maxDist  = 50;  // raio maximo na calcada

    // ââ AnimaÃ§Ã£o de walking âââââââââââââââââââââââââââââââââââ
    this.lastframe   = 0;
    this.spriteframe = 0;
    this.spriteAnimator = null;
    try {
        // registerAnimations seta animationSprites[1] = [offset+0, 7 frames, 0.1s]
        GTA.Pedestrian.prototype.registerAnimations.call(this, pedOffset);
        this.spriteAnimator = new GTA.SpriteAnimation(
            game,
            this.animationSprites[1][0],
            this.sprite
        );
    } catch(e) {
        GTA.Log('AI anim init error: ' + e.message);
    }

    game.scene.add(this);
};

GTA.AIPedestrian.prototype = Object.create(THREE.Object3D.prototype);
GTA.AIPedestrian.prototype.constructor = GTA.AIPedestrian;

GTA.AIPedestrian.prototype.updateAI = function ( delta ) {
    try {
        // ââ DetecÃ§Ã£o de fuga: verifica player prÃ³ximo ââââââââââ
        var _fleeing = false;
        var _game = window._gtaGame;
        if (_game && _game.player) {
            var _pl  = _game.player;
            var _fdx = _pl.position.x - this.position.x;
            var _fdy = _pl.position.y - this.position.y;
            var _fdist = Math.sqrt(_fdx * _fdx + _fdy * _fdy);

            if (_fdist < 150) {
                // Foge na direÃ§Ã£o oposta ao player
                this._aiAngle = Math.atan2(
                    this.position.y - _pl.position.y,
                    this.position.x - _pl.position.x
                );
                this._stopped  = false;
                this._fleeSpd  = this._speed * 2.0;
                this._aiTimer  = 0;
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
                    // Para por um momento
                    this._stopped   = true;
                    this._stopTimer = 1 + Math.random() * 2;
                } else if (dist > this._maxDist) {
                    // Volta para a calcada de origem ao longo do eixo
                    this._stopped = false;
                    if (this._patrolAxis === 'x') {
                        this._aiAngle = (this._originX > this.position.x) ? 0 : Math.PI;
                    } else {
                        this._aiAngle = (this._originY > this.position.y) ? Math.PI / 2 : -Math.PI / 2;
                    }
                } else {
                    // Muda direÃ§Ã£o â sempre ao longo do eixo de patrulha
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

        // ââ AnimaÃ§Ã£o de walking (cicla 7 frames) ââââââââââââââ
        if (this.spriteAnimator && this.animationSprites) {
            var walkAnim = this.animationSprites[1]; // [baseFrame, 7, 0.1]
            if (!this._stopped) {
                this.lastframe += delta;
                if (this.lastframe >= walkAnim[2]) {
                    this.lastframe = 0;
                    this.spriteframe = (this.spriteframe + 1) % walkAnim[1];
                    try {
                        this.spriteAnimator.setSprite(walkAnim[0] + this.spriteframe);
                    } catch(e) {}
                }
            } else {
                // Parado: frame estatico de standing (animationSprites[0])
                try {
                    this.spriteAnimator.setSprite(this.animationSprites[0][0]);
                } catch(e) {}
                this.spriteframe = 0;
                this.lastframe   = 0;
            }
        }

    } catch(e) {
        // Nunca quebra o animate loop
    }
};
