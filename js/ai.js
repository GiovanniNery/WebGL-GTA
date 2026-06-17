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
 */

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// CARROS IA
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

GTA.spawnAICars = function ( game ) {

    var P = Math.PI;

    // Carros em segmentos de rua reais perto do player (512, -192).
    // carX = tx + 64,  carY = 64 - ty   (tipo 58/4, height=64)
    //
    // Cada carro tem inicio e fim do segmento:
    //   [tipo, carX_start, carY_start, angulo, speed, segLen_box2d]
    //
    // Angulo:  East=-PI/2  West=PI/2  South=0  North=PI
    // Velocidade Box2D: vx=-sin(a)*speed, vy=cos(a)*speed
    // Progresso: dot((pos-start), dir) = -sin(a)*(pos.x-sx) + cos(a)*(pos.y-sy)
    //
    // Rua horizontal (Three.js yâ-192):
    //   Lane Leste:  x 440â580, y=-200  â segLen=14 Box2D
    //   Lane Oeste:  x 580â440, y=-184  â segLen=14 Box2D
    // Rua vertical (Three.js xâ512):
    //   Lane Sul:    y -152â-232, x=504 â segLen=8 Box2D
    //   Lane Norte:  y -232â-152, x=520 â segLen=8 Box2D
    var defs = [
        // [tipo, carX, carY, angulo, speed, segLen]
        [58,  504, 264, -P/2, 8, 14],   // Leste: Three.js (440,-200) â (580,-200)
        [4,   644, 248,  P/2, 8, 14],   // Oeste: Three.js (580,-184) â (440,-184)
        [58,  568, 216,    0, 7,  8],   // Sul:   Three.js (504,-152) â (504,-232)
        [4,   584, 296,    P, 7,  8],   // Norte: Three.js (520,-232) â (520,-152)
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
                hideTimer: 0          // timer para esconder sprite no teleporte
            };

            // Apenas GTA.allCars â physics.updateWorld usa formula errada para IA
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
            return; // nao move enquanto teleportando
        }

        var pos = car.physics.GetPosition();
        var dx  = pos.x - ai.startX;
        var dy  = pos.y - ai.startY;

        // Progresso ao longo da direcao da lane
        var progress = -Math.sin(ai.angle) * dx + Math.cos(ai.angle) * dy;

        if (progress > ai.segLen) {
            // Fim do segmento: teleporta ao inicio e esconde brevemente
            car.physics.SetPosition(
                new Box2D.Common.Math.b2Vec2(ai.startX, ai.startY)
            );
            car.physics.SetLinearVelocity(
                new Box2D.Common.Math.b2Vec2(0, 0)
            );
            if (car.sprite) car.sprite.visible = false;
            ai.hideTimer = 0.05; // 50 ms invisivel
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
                // Cooldown de 1.5s para nÃ£o tirar toda a vida de uma vez
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
    // Confirmadas pelos pickups em index.html (norte y=-140, sul y=-270,
    // oeste x=416, leste x=608).
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

    this._aiTimer    = Math.random() * 3;
    this._aiInterval = 2 + Math.random() * 4;
    this._aiAngle    = Math.random() * Math.PI * 2;
    this._stopped    = false;
    this._stopTimer  = 0;
    this._speed      = 25 + Math.random() * 20;

    // Origem e limite: 40 units â fica na calcada, nao entra na rua
    this._originX = worldX;
    this._originY = worldY;
    this._maxDist  = 40;

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
                this._fleeSpd  = this._speed * 2.0;  // corre mais rÃ¡pido
                this._aiTimer  = 0;                  // reseta timer para nÃ£o mudar direÃ§Ã£o tÃ£o cedo
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
                    // Volta para a calcada de origem
                    this._stopped = false;
                    this._aiAngle = Math.atan2(
                        this._originY - this.position.y,
                        this._originX - this.position.x
                    );
                } else {
                    // Muda direÃ§Ã£o aleatÃ³ria
                    this._stopped = false;
                    this._aiAngle = Math.random() * Math.PI * 2;
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

        if (this.sprite) {
            this.sprite.rotation.z = -(this._aiAngle - Math.PI / 2);
        }

    } catch(e) {
        // Nunca quebra o animate loop
    }
};
