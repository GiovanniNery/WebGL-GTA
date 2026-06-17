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

    // Carros exibidos nas lanes proximas ao player (512, -192).
    // carX = tx + 64,  carY = 64 - ty   (tipo 58 / tipo 4, height=64)
    //
    // [tipo, carX, carY, angulo, speed]
    //   angulo: East=-PI/2  West=PI/2  South=0  North=PI
    var defs = [
        // Lane Leste â vai para leste (East, angle=-PI/2), y=-200
        [58,  576, 264, -P/2, 7],
        // Lane Oeste â vai para oeste (West, angle=PI/2),  y=-184
        [4,   576, 248,  P/2, 7],
        // Lane Sul â vai para sul (South, angle=0),  x=504
        [58,  568, 256,    0, 6],
        // Lane Norte â vai para norte (North, angle=PI), x=520
        [4,   584, 256,    P, 6],
    ];

    defs.forEach(function(d) {
        try {
            var c = new GTA.GameObjectPosition();
            c.addCar(game, d[0], d[1], d[2], 128, 0);
            c.initPhysics(game);

            // Pega posicao Box2D real
            var physPos = c.physics.GetPosition();

            // Adiciona sprite DIRETO na cena (visivel sem depender de secao)
            c.sprite.position.x = physPos.x * 10 - 32;
            c.sprite.position.y = -physPos.y * 10 + 32;
            c.sprite.position.z = 128;
            game.scene.add(c.sprite);

            // Kinematico: nao colide com outros carros nem edificios
            c.physics.SetType(Box2D.Dynamics.b2Body.b2_kinematicBody);

            // Dados de IA: loop unidirecional
            // Raio 2.5 Box2D = 25 Three.js (< metade do bloco = 32)
            c._ai = {
                active: true,
                angle:  d[3],
                speed:  d[4],
                radius: 2.5,
                startX: physPos.x,
                startY: physPos.y
            };

            // Apenas GTA.allCars (nao activeObjects):
            // activeObjects e sincronizado por physics.updateWorld (formula errada);
            // GTA.allCars e sincronizado pelo loop do render (formula correta).
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
        var pos = car.physics.GetPosition();
        var dx  = pos.x - ai.startX;
        var dy  = pos.y - ai.startY;

        // Quando atinge o raio: teleporta ao inicio e reinicia na mesma direcao
        if (Math.sqrt(dx * dx + dy * dy) > ai.radius) {
            car.physics.SetPosition(
                new Box2D.Common.Math.b2Vec2(ai.startX, ai.startY)
            );
            car.physics.SetLinearVelocity(
                new Box2D.Common.Math.b2Vec2(0, 0)
            );
        }

        // Mantem velocidade/angulo constantes (movimento unidirecional na pista)
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
                // Muda direcao aleatoria
                this._stopped = false;
                this._aiAngle = Math.random() * Math.PI * 2;
            }
        }

        if (this._stopped) {
            this._stopTimer -= delta;
            if (this._stopTimer <= 0) this._stopped = false;
        }

        if (!this._stopped) {
            var spd = this._speed * delta;
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
