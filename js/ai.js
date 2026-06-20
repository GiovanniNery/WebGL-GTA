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
// CARROS IA  â  spawn/despawn dinÃ¢mico baseado na cÃ¢mera
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//
// PrincÃ­pio: o carro entra pela borda FORA do campo de visÃ£o e
// sai pelo outro lado tambÃ©m fora da tela. Nunca hÃ¡ teleporte visÃ­vel.
//
// FOV=45Â° â half_height = tan(22.5Â°) Ã (camZ-spriteZ) = 0.4142 Ã (400-128) â 113 px
// half_width  = half_height Ã (canvas_width / canvas_height)
//
// Bounds de spawn/despawn = visÃ­vel + MARGIN de seguranÃ§a

var _AI_MAX_CARS       = 6;    // mÃ¡ximo de carros IA simultÃ¢neos
var _AI_MARGIN         = 100;  // px alÃ©m da borda visÃ­vel (evita pop-in)
var _AI_HALF_H         = 113;  // metade da altura visÃ­vel em Three.js units
var _AI_MIN_GAP        = 130;  // gap mÃ­nimo entre carros na mesma lane
var _AI_SPAWN_INTERVAL = 1.0;  // segundos entre tentativas de spawn
GTA._aiSpawnTimer      = 0;

// DefiniÃ§Ã£o das 4 lanes de trÃ¡fego
// axis='x': lane horizontal   dir=+1 â Leste (WâE)   dir=-1 â Oeste (EâW)
// axis='y': lane vertical     dir=-1 â Sul  (NâS)    dir=+1 â Norte (SâN)
var _AI_LANES = [
    { carType: 58, axis: 'x', lanePos: -208, dir: +1, rotZ: -Math.PI/2, speed: 90 }, // Leste
    { carType:  4, axis: 'x', lanePos: -176, dir: -1, rotZ:  Math.PI/2, speed: 90 }, // Oeste
    { carType: 58, axis: 'y', lanePos:  496, dir: -1, rotZ:  Math.PI,   speed: 70 }, // Sul
    { carType:  4, axis: 'y', lanePos:  528, dir: +1, rotZ:  0,         speed: 70 }, // Norte
];

// Retorna {left, right, bottom, top} = Ã¡rea visÃ­vel + margem, centrada na cÃ¢mera
function _aiGetBounds(camX, camY) {
    var asp = (window.innerWidth && window.innerHeight)
        ? (window.innerWidth / window.innerHeight)
        : 1.778;
    var hw = _AI_HALF_H * asp + _AI_MARGIN;
    var hh = _AI_HALF_H + _AI_MARGIN;
    return {
        left:   camX - hw,
        right:  camX + hw,
        bottom: camY - hh,
        top:    camY + hh
    };
}

// Coordenada de entrada de um carro (ponto de spawn, fora da tela)
//   lane horizontal dir=+1 (Leste): entra pela esquerda (b.left)
//   lane horizontal dir=-1 (Oeste): entra pela direita  (b.right)
//   lane vertical   dir=-1 (Sul):   entra por cima      (b.top, pois y decresce)
//   lane vertical   dir=+1 (Norte): entra por baixo     (b.bottom)
function _aiEntryPt(lane, b) {
    if (lane.axis === 'x') {
        return { x: lane.dir > 0 ? b.left : b.right, y: lane.lanePos };
    } else {
        return { x: lane.lanePos, y: lane.dir < 0 ? b.top : b.bottom };
    }
}

// O carro jÃ¡ passou pela borda de saÃ­da (deve ser despawnado)?
function _aiExited(car, b) {
    var p  = car._path;
    var cx = car.sprite.position.x;
    var cy = car.sprite.position.y;
    if (p.axis === 'x') {
        return p.dir > 0 ? cx > b.right : cx < b.left;
    } else {
        return p.dir < 0 ? cy < b.bottom : cy > b.top;
    }
}

// Tenta criar um carro numa lane. Retorna true se spawnou, false se o gap mÃ­nimo
// nÃ£o foi respeitado (evita carros empilhados na borda de entrada).
function _aiSpawn(lane, b, game) {
    var entry = _aiEntryPt(lane, b);

    // Verifica gap com outros carros na mesma lane
    for (var j = 0; j < GTA.aiCarsPath.length; j++) {
        var ec = GTA.aiCarsPath[j];
        if (!ec._path) continue;
        if (ec._path.axis !== lane.axis || ec._path.lanePos !== lane.lanePos) continue;
        var d = lane.axis === 'x'
            ? Math.abs(ec.sprite.position.x - entry.x)
            : Math.abs(ec.sprite.position.y - entry.y);
        if (d < _AI_MIN_GAP) return false;
    }

    try {
        var c = new GTA.GameObjectPosition();
        c.addCar(game, lane.carType, 64, 64, 128, 0);
        c.sprite.position.x = entry.x;
        c.sprite.position.y = entry.y;
        c.sprite.position.z = 128 + GTA.aiCarsPath.length * 2;
        c.sprite.rotation.z = lane.rotZ;
        game.scene.add(c.sprite);
        c._path = {
            axis:         lane.axis,
            lanePos:      lane.lanePos,
            dir:          lane.dir,
            speed:        lane.speed,
            _dmgCooldown: 0,
            _disabled:    false
        };
        GTA.aiCarsPath.push(c);
        return true;
    } catch (e) {
        GTA.Log('AI spawn error: ' + e.message);
        return false;
    }
}

// Chamado uma vez por spawnAIPedestrians apÃ³s os pedestres serem criados
GTA.spawnAICars = function(game) {
    // Spawn inicial: 1 carro por lane, jÃ¡ posicionado na borda de entrada
    // (fora da tela). Eles entram naturalmente nas primeiras travessias.
    var b = _aiGetBounds(512, -192);   // posiÃ§Ã£o inicial do player
    var n = 0;
    _AI_LANES.forEach(function(lane) {
        if (_aiSpawn(lane, b, game)) n++;
    });
    GTA.Log('AI: spawnAICars (' + n + ' carros iniciais)');
};

// Chamado a cada frame por core.js
GTA.updateAICars = function(delta) {
    var _game = window._gtaGame;
    if (!_game || !_game.scene) return;

    // CÃ¢mera segue o player â usa posiÃ§Ã£o do player como centro da visÃ£o
    var camX = (_game.player && _game.player.position) ? _game.player.position.x : 512;
    var camY = (_game.player && _game.player.position) ? _game.player.position.y : -192;
    var b = _aiGetBounds(camX, camY);

    // ââ 1. Mover carros e despawnar os que saÃ­ram da tela âââââ
    for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) {
        var car = GTA.aiCarsPath[i];
        var p   = car._path;
        if (!p || p._disabled) continue;

        // Move na direÃ§Ã£o da lane
        if (p.axis === 'x') {
            car.sprite.position.x += p.dir * p.speed * delta;
        } else {
            car.sprite.position.y += p.dir * p.speed * delta;
        }

        // Remove quando sair do bounds (fora da tela + margem)
        if (_aiExited(car, b)) {
            if (car.sprite.parent) car.sprite.parent.remove(car.sprite);
            GTA.aiCarsPath.splice(i, 1);
        }
    }

    // ââ 2. Spawn periÃ³dico para manter o pool âââââââââââââââââ
    GTA._aiSpawnTimer += delta;
    if (GTA._aiSpawnTimer >= _AI_SPAWN_INTERVAL) {
        GTA._aiSpawnTimer = 0;
        if (GTA.aiCarsPath.length < _AI_MAX_CARS) {
            // Tenta lanes em ordem aleatÃ³ria; para na primeira que aceitar
            var order = _AI_LANES.slice().sort(function() { return Math.random() - 0.5; });
            for (var k = 0; k < order.length; k++) {
                if (_aiSpawn(order[k], b, _game)) break;
            }
        }
    }

    // ââ 3. ColisÃ£o/dano ao player a pÃ© âââââââââââââââââââââââ
    if (_game.player && !_game.player.inCar) {
        var _pl = _game.player;
        for (var m = 0; m < GTA.aiCarsPath.length; m++) {
            var ac = GTA.aiCarsPath[m];
            if (!ac._path || ac._path._disabled) continue;
            var _cx = _pl.position.x - ac.sprite.position.x;
            var _cy = _pl.position.y - ac.sprite.position.y;
            if (Math.sqrt(_cx*_cx + _cy*_cy) < 50) {
                if (!ac._path._dmgCooldown || ac._path._dmgCooldown <= 0) {
                    if (typeof window.GTA_health !== 'undefined') {
                        window.GTA_health = Math.max(0, window.GTA_health - 1);
                        GTA.Log('Atropelado! Vida: ' + window.GTA_health);
                    }
                    ac._path._dmgCooldown = 1.5;
                }
            }
            if (ac._path._dmgCooldown > 0) ac._path._dmgCooldown -= delta;
        }
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


// === BATIDAS: carro do player colide com o transito (adicionado por cima) ===
(function () {
    if (GTA._batidaOn) return; GTA._batidaOn = true;
    // garante que entrar no carro nunca quebre se player.js chamar disableAICar
    if (typeof GTA.disableAICar !== 'function') {
        GTA.disableAICar = function (car) { var i = GTA.aiCarsPath.indexOf(car); if (i >= 0) GTA.aiCarsPath.splice(i, 1); };
    }
    GTA._aiToPhysics = function (car, game) {
        if (!car || car.physics || typeof car.initPhysics !== 'function' || !car.sprite) return false;
        try {
            car.x = car.sprite.position.x + 64; car.y = 64 - car.sprite.position.y;
            car.z = 128; car.rotation = car.sprite.rotation.z;
            car.initPhysics(game);
            GTA.allCars = GTA.allCars || [];
            if (GTA.allCars.indexOf(car) < 0) GTA.allCars.push(car);
            return true;
        } catch (e) { return false; }
    };
    GTA._aiCarCollisions = function () {
        var g = window._gtaGame; if (!g || !g.player) return;
        var pl = g.player; if (!pl.inCar || !pl.currentCar || !pl.currentCar.sprite) return;
        var pc = pl.currentCar, pcx = pc.sprite.position.x, pcy = pc.sprite.position.y;
        for (var i = GTA.aiCarsPath.length - 1; i >= 0; i--) {
            var car = GTA.aiCarsPath[i]; if (!car || !car.sprite) continue;
            var dx = car.sprite.position.x - pcx, dy = car.sprite.position.y - pcy;
            if (dx*dx + dy*dy < 3364) {
                var stack = false, all = GTA.allCars || [];
                for (var a = 0; a < all.length; a++) { var ac = all[a]; if (ac === pc || !ac.sprite) continue; var ax = ac.sprite.position.x - car.sprite.position.x, ay = ac.sprite.position.y - car.sprite.position.y; if (ax*ax + ay*ay < 2500) { stack = true; break; } }
                if (stack) continue;
                GTA._aiToPhysics(car, g);
                GTA.aiCarsPath.splice(i, 1);
            }
        }
    };
    var _orig = GTA.updateAICars;
    GTA.updateAICars = function (delta) {
        if (typeof _orig === 'function') _orig(delta);
        try { GTA._aiCarCollisions(); } catch (e) {}
    };
})();
