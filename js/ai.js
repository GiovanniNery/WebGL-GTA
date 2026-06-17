/*
 * ai.js - Carros IA e Pedestres IA para WebGL-GTA
 * Carros: patrulham faixas de trafego (Leste/Oeste/Sul/Norte)
 * Pedestres: confinados em calcadas, andam no eixo da rua
 */

var _GTA_AI_PI = Math.PI;

// ââ CARROS IA âââââââââââââââââââââââââââââââââââââââââââââââââ

GTA.spawnAICars = function(game) {
    // [tipo, Three.js_x, Three.js_y, angulo_fisico, raio_patrulha_box2d]
    // Angulos: -PI/2=Leste(+x), PI/2=Oeste(-x), 0=Sul(-y), PI=Norte(+y)
    var P = _GTA_AI_PI;
    var defs = [
        // Faixa sul da rua E-O (yâ-198) â faixas separadas por ~12u
        [58, 380, -198, -P/2, 22],   // indo Leste
        [4,  650, -202,  P/2, 22],   // indo Oeste
        // Faixa norte da rua E-O (yâ-186)
        [44, 360, -186, -P/2, 22],   // indo Leste
        [58, 660, -182,  P/2, 22],   // indo Oeste
        // Faixa oeste da rua N-S (xâ490) â Sul/Norte
        [4,  490, -100,    0, 18],   // indo Sul
        [44, 490, -284,    P, 18],   // indo Norte
        // Faixa leste da rua N-S (xâ534)
        [58, 534, -100,    0, 18],   // indo Sul
        [4,  534, -284,    P, 18],   // indo Norte
    ];

    var spawned = 0;
    defs.forEach(function(d) {
        try {
            var c = new GTA.GameObjectPosition();
            // addCar(game, type, x, y, z, angle): x=tx+32, y=32-ty
            c.addCar(game, d[0], d[1] + 32, 32 - d[2], 128, 0);
            c.initPhysics(game);
            game.map.addObject(c);
            if (c.sprite) c.sprite.position.z = 128;
            game.activeObjects.push(c);
            GTA.allCars.push(c);
            // Estado IA: guardado direto no objeto
            c._ai = {
                active: true,
                angle:  d[3],
                speed:  9 + Math.random() * 5,
                radius: d[4],
                startX: c.physics ? c.physics.GetPosition().x : 0,
                startY: c.physics ? c.physics.GetPosition().y : 0
            };
            spawned++;
        } catch(e) {
            GTA.Log('AI car error: ' + e.message);
        }
    });
    GTA.Log('AI: ' + spawned + ' carros criados');
};

// Chamado no animate loop (core.js)
GTA.updateAICars = function(delta) {
    GTA.allCars.forEach(function(car) {
        if (!car._ai || !car._ai.active || !car.physics) return;
        try {
            var ai  = car._ai;
            var pos = car.physics.GetPosition();
            var dx  = pos.x - ai.startX;
            var dy  = pos.y - ai.startY;
            if (Math.sqrt(dx*dx + dy*dy) > ai.radius) {
                // Inverter direcao e resetar origem
                ai.angle  = ai.angle > 0 ? ai.angle - _GTA_AI_PI : ai.angle + _GTA_AI_PI;
                ai.startX = pos.x;
                ai.startY = pos.y;
            }
            var a = ai.angle;
            car.physics.SetLinearVelocity(
                new Box2D.Common.Math.b2Vec2(-Math.sin(a) * ai.speed, Math.cos(a) * ai.speed)
            );
            car.physics.SetAngle(a);
            car.physics.SetAwake(true);
        } catch(e) {}
    });
};

// ââ PEDESTRES IA ââââââââââââââââââââââââââââââââââââââââââââââ

GTA.spawnAIPedestrians = function(game) {
    var pedOffset = game.spriteNumbers.offset.PED;
    if (!game.sprites || !game.sprites[pedOffset]) {
        GTA.Log('AI: sprites de pedestres nao disponiveis');
        return;
    }
    // [x, y, anguloPreferido]
    // Player em (512,-192). Calcadas â 36u da rua.
    var P = _GTA_AI_PI;
    var positions = [
        // Calcada norte da rua E-O (y â -155)
        [400, -155, -P/2],  // Leste
        [535, -155,  P/2],  // Oeste
        [660, -155, -P/2],  // Leste
        // Calcada sul da rua E-O (y â -230)
        [430, -230,  P/2],  // Oeste
        [570, -230, -P/2],  // Leste
        // Calcada oeste da rua N-S (x â 466)
        [466, -128,    0],  // Sul
        [466, -262,    P],  // Norte
        // Calcada leste da rua N-S (x â 558)
        [558, -142,    0],  // Sul
    ];

    var spawned = 0;
    positions.forEach(function(pos) {
        try {
            var ped = new GTA.AIPedestrian(game, pos[0], pos[1], pedOffset, pos[2]);
            GTA.aiPedestrians.push(ped);
            spawned++;
        } catch(e) {
            GTA.Log('AI ped error: ' + e.message);
        }
    });
    GTA.Log('AI: ' + spawned + ' pedestres criados');
};

GTA.AIPedestrian = function(game, worldX, worldY, pedOffset, preferAngle) {
    THREE.Object3D.call(this);

    try {
        var geom = THREE.GeometryUtils.clone(game.sprites[pedOffset].sprite.geometry);
        var mat  = game.sprites[pedOffset].sprite.material;
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

    var P = _GTA_AI_PI;
    this._preferAngle  = (preferAngle !== undefined) ? preferAngle : (Math.random() * P * 2);
    this._aiAngle      = this._preferAngle;
    this._aiTimer      = Math.random() * 3;
    this._aiInterval   = 3 + Math.random() * 5;
    this._stopped      = false;
    this._stopTimer    = 0;
    this._speed        = 22 + Math.random() * 15;
    this._originX      = worldX;
    this._originY      = worldY;
    this._maxDist      = 280;

    // Corredor perpendicular ao eixo de caminhada
    var absP = Math.abs(this._preferAngle);
    this._isEW         = (absP > P/4 && absP < 3*P/4); // E-O = manter y
    this._corridorBase = this._isEW ? worldY : worldX;
    this._corridorHalf = 26;

    game.scene.add(this);
};

GTA.AIPedestrian.prototype = Object.create(THREE.Object3D.prototype);
GTA.AIPedestrian.prototype.constructor = GTA.AIPedestrian;

GTA.AIPedestrian.prototype.updateAI = function(delta) {
    try {
        this._aiTimer += delta;

        if (this._aiTimer >= this._aiInterval) {
            this._aiTimer    = 0;
            this._aiInterval = 3 + Math.random() * 5;

            var dx   = this.position.x - this._originX;
            var dy   = this.position.y - this._originY;
            var dist = Math.sqrt(dx*dx + dy*dy);

            if (Math.random() < 0.1) {
                this._stopped   = true;
                this._stopTimer = 1 + Math.random() * 2;
            } else if (dist > this._maxDist) {
                // Inverter direcao ao longo do eixo preferido
                this._stopped = false;
                this._preferAngle = this._preferAngle > 0
                    ? this._preferAngle - _GTA_AI_PI
                    : this._preferAngle + _GTA_AI_PI;
                this._aiAngle = this._preferAngle;
                this._originX = this.position.x;
                this._originY = this.position.y;
            } else {
                // Variacao leve em volta do preferido
                this._stopped = false;
                this._aiAngle = this._preferAngle + (Math.random() - 0.5) * 0.3;
            }
        }

        if (this._stopped) {
            this._stopTimer -= delta;
            if (this._stopTimer <= 0) this._stopped = false;
            if (this.sprite) this.sprite.rotation.z = -this._aiAngle;
            return;
        }

        // Confinamento ao corredor (calcada)
        var drift;
        if (this._isEW) {
            drift = this.position.y - this._corridorBase;
            if (drift >  this._corridorHalf) this.position.y = this._corridorBase + this._corridorHalf;
            if (drift < -this._corridorHalf) this.position.y = this._corridorBase - this._corridorHalf;
        } else {
            drift = this.position.x - this._corridorBase;
            if (drift >  this._corridorHalf) this.position.x = this._corridorBase + this._corridorHalf;
            if (drift < -this._corridorHalf) this.position.x = this._corridorBase - this._corridorHalf;
        }

        var spd = this._speed * delta;
        this.position.x += -Math.sin(this._aiAngle) * spd;
        this.position.y += -Math.cos(this._aiAngle) * spd;

        if (this.sprite) {
            this.sprite.rotation.z = -this._aiAngle;
        }
    } catch(e) {}
};
