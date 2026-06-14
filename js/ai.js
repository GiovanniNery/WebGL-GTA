/*
 * ai.js - Pedestres IA e tráfego para WebGL-GTA
 * Construído em cima do código original de Niklas von Hertzen
 * Usa GTA.Pedestrian existente com comportamento de IA
 */

// ── Spawn de pedestres IA (chamado por core.js) ──────────────
GTA.spawnAIPedestrians = function ( game ) {

    var pedOffset = game.spriteNumbers.offset.PED;

    // Verifica se sprites estão disponíveis
    if (!game.sprites || !game.sprites[pedOffset]) {
        GTA.Log('AI: sprites de pedestres nao disponiveis ainda');
        return;
    }

    // Posições no mundo — mesma área dos carros e do player inicial
    // x: 190–390, y: 190–340 (calçadas ao redor das ruas)
    var positions = [
        [248, 192],
        [268, 205],
        [300, 196],
        [340, 200],
        [375, 195],
        [225, 245],
        [260, 255],
        [295, 248],
        [330, 253],
        [368, 250],
        [210, 298],
        [245, 305],
        [280, 300],
        [320, 303],
        [358, 298],
        [235, 330],
        [270, 325],
        [305, 332],
        [345, 328],
        [380, 322],
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

// ── Classe Pedestre IA ────────────────────────────────────────
GTA.AIPedestrian = function ( game, worldX, worldY, pedOffset ) {

    // Cria sprite do pedestre usando os sprites originais do GTA 1
    var standingIdx = pedOffset + 98; // sprite de "parado"
    if (!game.sprites[standingIdx]) {
        standingIdx = pedOffset;
    }

    var geom = THREE.GeometryUtils.clone( game.sprites[standingIdx].sprite.geometry );
    var mat  = game.sprites[standingIdx].sprite.material;
    var sprite = new THREE.Mesh(geom, mat);
    sprite.geometry.dynamic = true;

    // Chama construtor base GTA.Pedestrian
    this.sprite = sprite;
    this.add(sprite);
    this.speed = 1.5 + Math.random() * 1.5; // velocidade variada
    this.rotationSpeed = 0.1;

    // Registra animações dos sprites originais
    this.registerAnimations(pedOffset);
    this.spriteAnimator = new GTA.SpriteAnimation(game, standingIdx, sprite);
    this.lastframe = 0;
    this.spriteframe = 0;
    this.weapon = 0;

    // Posição no mundo
    this.position.x = worldX;
    this.position.y = worldY;
    this.position.z = 2;

    // Inicia física Box2D (mesmo sistema do player)
    this.initPhysics(game);

    // IA: estado de caminhada
    this.moveForward  = true;
    this.moveBackward = false;
    this.turnLeft     = false;
    this.turnRight    = false;

    // Timer de mudança de direção
    this._aiTimer    = Math.random() * 3;
    this._aiInterval = 2 + Math.random() * 4;
    this._aiAngle    = Math.random() * Math.PI * 2;
    this._stopped    = false;
    this._stopTimer  = 0;

    // Define ângulo inicial aleatório
    this.physics.SetAngle(this._aiAngle);

    // Adiciona ao scene do Three.js
    game.scene.add(this);

    this.game = game;
};

// Herda de GTA.Pedestrian (Object3D + initPhysics + registerAnimations + movePedestrian)
GTA.AIPedestrian.prototype = new THREE.Object3D();
GTA.AIPedestrian.prototype.constructor = GTA.AIPedestrian;

// Copia métodos necessários de GTA.Pedestrian
GTA.AIPedestrian.prototype.initPhysics      = GTA.Pedestrian.prototype.initPhysics;
GTA.AIPedestrian.prototype.registerAnimations = GTA.Pedestrian.prototype.registerAnimations;
GTA.AIPedestrian.prototype.movePedestrian   = GTA.Pedestrian.prototype.movePedestrian;

// Update de IA (chamado a cada frame por core.js)
GTA.AIPedestrian.prototype.updateAI = function ( delta ) {

    this._aiTimer += delta;

    // Muda direção periodicamente
    if (this._aiTimer >= this._aiInterval) {
        this._aiTimer = 0;
        this._aiInterval = 2 + Math.random() * 5;

        var roll = Math.random();

        if (roll < 0.15) {
            // Para por um momento
            this._stopped = true;
            this._stopTimer = 1 + Math.random() * 2;
            this.moveForward = false;
        } else {
            // Muda para nova direção aleatória
            this._stopped = false;
            this._aiAngle = Math.random() * Math.PI * 2;
            this.physics.SetAngle(this._aiAngle);
            this.moveForward = true;
        }
    }

    // Conta tempo parado
    if (this._stopped) {
        this._stopTimer -= delta;
        if (this._stopTimer <= 0) {
            this._stopped = false;
            this.moveForward = true;
        }
    }

    // Aplica velocidade via física
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

    // Atualiza posição visual a partir da física
    var physPos = this.physics.GetPosition();
    this.movePedestrian(
        physPos.x  * GTA.PhysicsScale,
        -physPos.y * GTA.PhysicsScale,
        0
    );

    // Rotaciona sprite
    if (this.sprite) {
        this.sprite.rotation.z = -(this.physics.GetAngle() - 1.57079633);
    }

    // Animação de caminhada simples
    if (this.spriteAnimator && this.moveForward) {
        this.lastframe += delta;
        var walkAnim = this.animationSprites[1]; // walking
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
