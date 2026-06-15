/*
 * ai.js - Pedestres IA e trafego para WebGL-GTA
 * Construido em cima do codigo original de Niklas von Hertzen
 * Usa GTA.Pedestrian existente com comportamento de IA
 */

// Spawn de pedestres IA (chamado por core.js)
GTA.spawnAIPedestrians = function ( game ) {

    var pedOffset = game.spriteNumbers.offset.PED;

    if (!game.sprites || !game.sprites[pedOffset]) {
        GTA.Log('AI: sprites de pedestres nao disponiveis ainda');
        return;
    }

    // Player nasce em Three.js (6720, -7616)
    // initPhysics: bodyDef.position.y = -(this.position.y) / PhysicsScale
    // Para Three.js y = -7616: worldY deve ser NEGATIVO (-7616)
    var positions = [
        [6660, -7560],  // calçada norte-oeste
        [6720, -7545],  // calçada norte (frente ao player)
        [6780, -7575],  // calçada norte-leste
        [6640, -7640],  // calçada oeste
        [6800, -7640],  // calçada leste
        [6660, -7710],  // calçada sul-oeste
        [6720, -7740],  // calçada sul
        [6780, -7700],  // calçada sul-leste
    ];

    var spawned = 0;

    positions.forEach(function(pos) {
        try {
            var ped = new GTA.AIPedestrian(game, pos[0], pos[1], pedOffset);
            if (ped) {
                GTA.aiPedestrians.push(ped);
                spawned++;
            }
        } catch(e) {
            GTA.Log('AI ped error: ' + e.message);
        }
    });

    GTA.Log('AI: ' + spawned + ' pedestres criados');
};

// Classe Pedestre IA
GTA.AIPedestrian = function ( game, worldX, worldY, pedOffset ) {

    var standingIdx = pedOffset + 98;
    if (!game.sprites[standingIdx]) {
        standingIdx = pedOffset;
    }

    var geom = THREE.GeometryUtils.clone( game.sprites[standingIdx].sprite.geometry );
    var mat  = game.sprites[standingIdx].sprite.material;
    var sprite = new THREE.Mesh(geom, mat);
    sprite.geometry.dynamic = true;

    this.sprite = sprite;
    this.add(sprite);
    this.speed = 1.5 + Math.random() * 1.5;
    this.rotationSpeed = 0.1;

    this.registerAnimations(pedOffset);
    this.spriteAnimator = new GTA.SpriteAnimation(game, standingIdx, sprite);
    this.lastframe = 0;
    this.spriteframe = 0;
    this.weapon = 0;

    this.position.x = worldX;
    this.position.y = worldY;
    this.position.z = 2;

    this.initPhysics(game);

    this.moveForward  = true;
    this.moveBackward = false;
    this.turnLeft     = false;
    this.turnRight    = false;

    this._aiTimer    = Math.random() * 3;
    this._aiInterval = 2 + Math.random() * 4;
    this._aiAngle    = Math.random() * Math.PI * 2;
    this._stopped    = false;
    this._stopTimer  = 0;

    this.physics.SetAngle(this._aiAngle);

    game.scene.add(this);

    this.game = game;
};

// Herda de GTA.Pedestrian
GTA.AIPedestrian.prototype = new THREE.Object3D();
GTA.AIPedestrian.prototype.constructor = GTA.AIPedestrian;

GTA.AIPedestrian.prototype.initPhysics      = GTA.Pedestrian.prototype.initPhysics;
GTA.AIPedestrian.prototype.registerAnimations = GTA.Pedestrian.prototype.registerAnimations;
GTA.AIPedestrian.prototype.movePedestrian   = GTA.Pedestrian.prototype.movePedestrian;

// Update de IA (chamado a cada frame por core.js)
GTA.AIPedestrian.prototype.updateAI = function ( delta ) {

    this._aiTimer += delta;

    if (this._aiTimer >= this._aiInterval) {
        this._aiTimer = 0;
        this._aiInterval = 2 + Math.random() * 5;

        var roll = Math.random();

        if (roll < 0.15) {
            this._stopped = true;
            this._stopTimer = 1 + Math.random() * 2;
            this.moveForward = false;
        } else {
            this._stopped = false;
            this._aiAngle = Math.random() * Math.PI * 2;
            this.physics.SetAngle(this._aiAngle);
            this.moveForward = true;
        }
    }

    if (this._stopped) {
        this._stopTimer -= delta;
        if (this._stopTimer <= 0) {
            this._stopped = false;
            this.moveForward = true;
        }
    }

    if (this.moveForward) {
        var angle = this.physics.GetAngle();
        var speed = delta * this.speed;
        this.physics.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            )
        );
    } else {
        this.physics.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(0, 0)
        );
    }

    var physPos = this.physics.GetPosition();
    this.movePedestrian(
        physPos.x  * GTA.PhysicsScale,
        -physPos.y * GTA.PhysicsScale,
        0
    );

    if (this.sprite) {
        this.sprite.rotation.z = -(this.physics.GetAngle() - 1.57079633);
    }

    if (this.spriteAnimator && this.moveForward) {
        this.lastframe += delta;
        var walkAnim = this.animationSprites[1];
        if (walkAnim && walkAnim.length > 2 && this.lastframe > walkAnim[2]) {
            this.lastframe = 0;
            try {
                this.spriteAnimator.setSprite(walkAnim[0] + this.spriteframe);
                this.spriteframe++;
                if (this.spriteframe >= walkAnim[1]) this.spriteframe = 0;
            } catch(e) {}
        }
    }
};
