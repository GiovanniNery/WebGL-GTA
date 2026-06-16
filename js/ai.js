/*
 * ai.js - Pedestres IA para WebGL-GTA
 * Movimento puro Three.js (sem Box2D) â estavel e visivel
 */

// ââ Spawn de pedestres IA âââââââââââââââââââââââââââââââââââââ
GTA.spawnAIPedestrians = function ( game ) {

    var pedOffset = game.spriteNumbers.offset.PED;

    if (!game.sprites || !game.sprites[pedOffset]) {
        GTA.Log('AI: sprites de pedestres nao disponiveis');
        return;
    }

    // Posicoes ao redor do spawn do player (512, -192)
    var positions = [
        [448, -128],
        [512, -128],
        [576, -128],
        [416, -192],
        [608, -192],
        [448, -256],
        [512, -256],
        [576, -256],
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
};

// ââ Classe Pedestre IA (sem Box2D â movimento Three.js puro) ââ
GTA.AIPedestrian = function ( game, worldX, worldY, pedOffset ) {

    THREE.Object3D.call(this);

    // Cria sprite do pedestre
    try {
        var geom = THREE.GeometryUtils.clone( game.sprites[pedOffset].sprite.geometry );
        var mat  = game.sprites[pedOffset].sprite.material;
        this.sprite = new THREE.Mesh(geom, mat);
        this.sprite.geometry.dynamic = true;
        this.add(this.sprite);
    } catch(e) {
        GTA.Log('AI sprite error: ' + e.message);
        this.sprite = null;
    }

    // Posicao inicial
    this.position.x = worldX;
    this.position.y = worldY;
    this.position.z = 128; // mesmo nivel do player (chao=32, player=128)

    // Estado da IA
    this._aiTimer    = Math.random() * 3;
    this._aiInterval = 2 + Math.random() * 4;
    this._aiAngle    = Math.random() * Math.PI * 2;
    this._stopped    = false;
    this._stopTimer  = 0;
    this._speed      = 25 + Math.random() * 20;

    // Fica perto do spawn
    this._originX = worldX;
    this._originY = worldY;
    this._maxDist  = 200;

    // Adiciona ao scene
    game.scene.add(this);
};

GTA.AIPedestrian.prototype = Object.create(THREE.Object3D.prototype);
GTA.AIPedestrian.prototype.constructor = GTA.AIPedestrian;

// Update chamado a cada frame por core.js
GTA.AIPedestrian.prototype.updateAI = function ( delta ) {
    try {
        this._aiTimer += delta;

        if (this._aiTimer >= this._aiInterval) {
            this._aiTimer    = 0;
            this._aiInterval = 2 + Math.random() * 5;

            var dx   = this.position.x - this._originX;
            var dy   = this.position.y - this._originY;
            var dist = Math.sqrt(dx*dx + dy*dy);

            if (Math.random() < 0.15) {
                this._stopped   = true;
                this._stopTimer = 1 + Math.random() * 2;
            } else if (dist > this._maxDist) {
                // Volta para a origem
                this._stopped = false;
                this._aiAngle = Math.atan2(this._originY - this.position.y,
                                           this._originX - this.position.x);
            } else {
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
