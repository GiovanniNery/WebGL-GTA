/*
* player.js
* @author Niklas von Hertzen / ATG1
* Enhanced: movimento GTA2_Unity style (SetLinearVelocity direto),
* sistema de armas com municao, ciclar armas
*/

// Captura update original ANTES de sobrescrever (person.js ja rodou)
var _pedOrigUpdate = GTA.Pedestrian.prototype.update;

// Velocidade por tipo de carro (tipo conforme addCar em core.js)
var GTA_CAR_SPEEDS = {
    4: 25,  // esportivo / policia â mais rapido
    44: 20, // medio
    58: 16, // normal
};

GTA.Player = function ( game, x, y, z ) {

    this.position.x = x;
    this.position.y = y;
    this.position.z = z;

    this.registerAnimations( game.spriteNumbers.offset.PED );
    this.initPhysics( game );

    var geom = THREE.GeometryUtils.clone( game.sprites[ this.animationSprites[0][0] ].sprite.geometry );
    this.sprite = new THREE.Mesh( geom, game.sprites[ this.animationSprites[0][0] ].sprite.material );
    this.sprite.geometry.dynamic = true;

    this.spriteAnimator = new GTA.SpriteAnimation( game, this.animationSprites[0][0], this.sprite );
    this.game = game;
    this.add( this.sprite );

    this.speed = 700;
    this.rotationSpeed = 0.1;
    this.weapon = 0;
    this.lastframe = 0;
    this.runningFrames = [];
    this.spriteframe = 0;
    this._isPlayer = true;
    this.inCar = false;
    this.currentCar = null;
    this.handbrake = false;

    this.domElement = document;

    var self = this;

    this.onKeyDown = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward = true; break;
            case 37: case 65: self.turnLeft = true; break;
            case 40: case 83: self.moveBackward = true; break;
            case 39: case 68: self.turnRight = true; break;
            case 82: self.moveUp = true; break;
            case 81:
                if (typeof window.GTA_cycleWeapon === 'function') window.GTA_cycleWeapon();
                break;
            case 70:
                if (typeof window.GTA_atirarTeclado === 'function') window.GTA_atirarTeclado(true);
                break;
            case 13: case 69: self.toggleCar(); break;
            case 32: self.handbrake = true; break;
        }
    };

    this.onKeyUp = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward = false; break;
            case 37: case 65: self.turnLeft = false; break;
            case 40: case 83: self.moveBackward = false; break;
            case 39: case 68: self.turnRight = false; break;
            case 82: self.moveUp = false; break;
            case 70:
                if (typeof window.GTA_atirarTeclado === 'function') window.GTA_atirarTeclado(false);
                break;
            case 32: self.handbrake = false; break;
        }
    };

    this.domElement.addEventListener( 'keydown', this.onKeyDown, false );
    this.domElement.addEventListener( 'keyup',   this.onKeyUp,   false );

    var canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.setAttribute('tabindex','0');
        canvas.addEventListener('touchstart', function(){canvas.focus();}, {once:true, passive:true});
    }
};

GTA.Player.prototype = GTA.Pedestrian.prototype;
GTA.Player.prototype.constructor = GTA.Player;

// ââ Entrar / sair do carro ââââââââââââââââââââââââââââââââââââ
GTA.Player.prototype.toggleCar = function () {
    if (this.inCar) {
        this.exitCar();
    } else {
        this.enterNearestCar();
    }
};

// Ponto da PORTA do motorista no mundo (doors[0].rpx do .G24: lado + offset reais do modelo).
GTA.Player.prototype._doorPoint = function ( c ) {
    var doorOff = 22, doorSide = -1;
    try {
        var mdl = window._gtaGame.cars[c.type];
        if (mdl && mdl.doors && mdl.doors.length) {
            var dr = mdl.doors[0];
            if (dr && typeof dr.rpx === 'number' && dr.rpx !== 0) { doorSide = dr.rpx < 0 ? -1 : 1; doorOff = Math.max(16, Math.abs(dr.rpx) + 6); }
        }
    } catch (e) {}
    var sp = c.sprite, h = sp ? (sp.rotation.z - Math.PI / 2) : 0;
    return { x: sp.position.x - Math.sin(h) * doorOff * doorSide, y: sp.position.y + Math.cos(h) * doorOff * doorSide };
};

GTA.Player.prototype.enterNearestCar = function () {
    var cars = (GTA.allCars || []).concat(GTA.aiCarsPath || []);
    if (!cars || cars.length === 0) return;

    var nearest = null, nearestDoor = null;
    var nearestDist = 60; // tem que estar PERTO DA PORTA (nao mais do centro a 100px)
    var px = this.position.x;
    var py = this.position.y;

    for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (!c || !c.sprite || c._destroyed) continue; // nao entra em carcaca/destroco
        var dp = this._doorPoint(c);
        var dx = dp.x - px;
        var dy = dp.y - py;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = c;
            nearestDoor = dp;
        }
    }

    if (nearest) {
        var wasAI = !nearest.physics; // carro de trafego IA = tem motorista dentro
        if (wasAI && typeof GTA.disableAICar === 'function') GTA.disableAICar(nearest);
        this.inCar = true;
        this.currentCar = nearest;
        this.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0));
        if (this.sprite) this.sprite.visible = false;

        // Desativa IA do carro roubado (agora e o player que dirige)
        if (typeof GTA.disableAICar === 'function') {
            GTA.disableAICar(nearest);
        }

        // CARJACK estilo GTA1: o MOTORISTA e arrancado pela porta e sai correndo
        // (vira um pedestre normal na porta; a IA de fuga dele ja corre do player).
        if (wasAI && nearestDoor) {
            try {
                var g = window._gtaGame, off = g.spriteNumbers.offset.PED;
                var drv = new GTA.AIPedestrian(g, nearestDoor.x, nearestDoor.y, off);
                drv.speed = (drv.speed || 2) * 1.8; // sai em panico
                GTA.aiPedestrians.push(drv);
            } catch (e) {}
        }

        if (typeof window.GTA_onEnterCar === 'function') window.GTA_onEnterCar(nearest);
        GTA.Log('Entrou no carro tipo ' + nearest.type + (wasAI ? ' (motorista ejetado)' : ''));
    }
};

GTA.Player.prototype.exitCar = function () {
    if (!this.inCar || !this.currentCar) return;

    if (this.currentCar.physics) {
        this.currentCar.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0));
        // Sai pela PORTA real do modelo (doors[0].rpx do .G24): offset lateral no lado da porta,
        // perpendicular ao heading do carro. Fallback: lado esquerdo a 22px.
        var doorOff = 22, doorSide = -1;
        try {
            var mdl = window._gtaGame.cars[this.currentCar.type];
            if (mdl && mdl.doors && mdl.doors.length) {
                var dr = mdl.doors[0];
                if (dr && typeof dr.rpx === 'number' && dr.rpx !== 0) { doorSide = dr.rpx < 0 ? -1 : 1; doorOff = Math.max(18, Math.abs(dr.rpx) + 10); }
            }
        } catch (e) {}
        var sp = this.currentCar.sprite, heading = sp ? (sp.rotation.z - Math.PI / 2) : 0;
        var lx = -Math.sin(heading) * doorOff * doorSide, ly = Math.cos(heading) * doorOff * doorSide;
        var wx = (sp ? sp.position.x : 0) + lx, wy = (sp ? sp.position.y : 0) + ly;
        this.physics.SetPosition(new Box2D.Common.Math.b2Vec2((wx + 32) / (GTA.PhysicsScale || 10), (32 - wy) / (GTA.PhysicsScale || 10)));
    }

    this.inCar = false;
    this.currentCar = null;
    if (this.sprite) this.sprite.visible = true;
    if (typeof window.GTA_onExitCar === 'function') window.GTA_onExitCar();
    GTA.Log('Saiu do carro');
};

// ââ Dirigir carro (Box2D) âââââââââââââââââââââââââââââââââââââ
GTA.Player.prototype.updateDriving = function ( delta ) {
    var car = this.currentCar;
    var carPhys = car.physics;
    var angle = carPhys.GetAngle();
    var carSpeed = GTA_CAR_SPEEDS[car.type] || 16;
    var turnSpeed = 0.055;

    carPhys.SetAwake(true);

    if (this.handbrake) {
        var vel = carPhys.GetLinearVelocity();
        var atrito = this.moveForward ? 0.97 : 0.84;
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vel.x * atrito, vel.y * atrito));
        if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed * 2.8);
        if (this.turnRight) carPhys.SetAngle(angle + turnSpeed * 2.8);

    } else if (this.moveForward) {
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(
            -Math.sin(angle) * carSpeed,
             Math.cos(angle) * carSpeed
        ));
        if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed);
        if (this.turnRight) carPhys.SetAngle(angle + turnSpeed);

    } else if (this.moveBackward) {
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(
             Math.sin(angle) * carSpeed * 0.5,
            -Math.cos(angle) * carSpeed * 0.5
        ));
        if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed);
        if (this.turnRight) carPhys.SetAngle(angle + turnSpeed);

    } else {
        var vel = carPhys.GetLinearVelocity();
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vel.x * 0.85, vel.y * 0.85));
    }

    var pos = carPhys.GetPosition();
    this.position.x =  pos.x * GTA.PhysicsScale;
    this.position.y = -pos.y * GTA.PhysicsScale;
};

// ââ Movimento a pe â GTA2_Unity style ââââââââââââââââââââââââ
GTA.Player.prototype.updateOnFoot = function ( delta ) {
    try {
        var phys = this.physics;
        if (!phys || typeof phys.GetAngle !== 'function') {
            _pedOrigUpdate.call(this, delta);
            return;
        }

        var scale = GTA.PhysicsScale || 10;
        var angle = phys.GetAngle();
        var speed    = 18;
        var rotSpeed = 2.8;

        if (this.turnLeft)  angle -= rotSpeed * delta;
        if (this.turnRight) angle += rotSpeed * delta;
        phys.SetAngle(angle);

        var vx = 0, vy = 0;
        if (this.moveForward) {
            vx = -Math.sin(angle) * speed;
            vy =  Math.cos(angle) * speed;
        } else if (this.moveBackward) {
            vx =  Math.sin(angle) * speed * 0.5;
            vy = -Math.cos(angle) * speed * 0.5;
        }
        phys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vx, vy));
        phys.SetAwake(true);

        var pos = phys.GetPosition();
        this.position.x =  pos.x * scale;
        this.position.y = -pos.y * scale;

        if (this.sprite) {
            this.sprite.rotation.z = -angle;
        }

        var movementSpeed = 0;
        if (this.moveForward)  movementSpeed = 2;
        else if (this.moveBackward) movementSpeed = 1;

        var spriteID = ((this.weapon || 0) * 3) + movementSpeed;
        var anim = this.animationSprites && this.animationSprites[spriteID];
        if (anim && this.spriteAnimator) {
            if (anim.length <= 2) {
                this.spriteAnimator.setSprite(anim[0]);
                this.spriteframe = 0;
            } else {
                this.lastframe = (this.lastframe || 0) + delta;
                if (this.lastframe > anim[2]) {
                    this.lastframe = 0;
                    this.spriteAnimator.setSprite(anim[0] + this.spriteframe);
                    this.spriteframe = ((this.spriteframe || 0) + 1) % anim[1];
                }
            }
        }

    } catch(e) {
        try { _pedOrigUpdate.call(this, delta); } catch(e2) {}
    }
};

// ââ Update principal ââââââââââââââââââââââââââââââââââââââââââ
GTA.Player.prototype.update = function ( delta ) {
    if (this._dead) return; // morto: corpo fica parado no chao
    if (!this._isPlayer) {
        _pedOrigUpdate.call(this, delta);
        return;
    }
    if (this.inCar && this.currentCar && this.currentCar.physics) {
        this.updateDriving(delta);
        return;
    }
    this.updateOnFoot(delta);
};

function bind( scope, fn ) {
    return function () { fn.apply( scope, arguments ); };
}
