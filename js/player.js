/*
 * player.js
 * @author Niklas von Hertzen / ATG1
 * Enhanced: movimento GTA2_Unity style (SetLinearVelocity direto),
 *           sistema de armas com muniÃ§Ã£o, ciclar armas
 */

// Captura update original ANTES de sobrescrever (person.js ja rodou)
var _pedOrigUpdate = GTA.Pedestrian.prototype.update;

// Velocidade por tipo de carro (tipo conforme addCar em core.js)
var GTA_CAR_SPEEDS = {
    4:  25,   // esportivo / policia â mais rapido
    44: 20,   // medio
    58: 16,   // normal
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

    this.speed         = 700;
    this.rotationSpeed = 0.1;
    this.weapon        = 0;    // 0 = sem arma, 1 = pistola, 2 = metralhadora
    this.lastframe     = 0;
    this.runningFrames = [];
    this.spriteframe   = 0;
    this._isPlayer     = true;
    this.inCar         = false;
    this.currentCar    = null;
    this.handbrake     = false;

    this.domElement = document;

    var self = this;

    this.onKeyDown = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward   = true;  break;
            case 37: case 65: self.turnLeft      = true;  break;
            case 40: case 83: self.moveBackward  = true;  break;
            case 39: case 68: self.turnRight     = true;  break;
            case 82:          self.moveUp        = true;  break;
            // Q = ciclar arma (como GTA2_Unity: NextWeapon/PreviousWeapon)
            case 81:
                if (typeof window.GTA_cycleWeapon === 'function') window.GTA_cycleWeapon();
                break;
            // F = atirar com teclado
            case 70:
                if (typeof window.GTA_atirarTeclado === 'function') window.GTA_atirarTeclado(true);
                break;
            case 13: case 69: self.toggleCar();           break;
            case 32:          self.handbrake     = true;  break;
        }
    };

    this.onKeyUp = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward  = false; break;
            case 37: case 65: self.turnLeft     = false; break;
            case 40: case 83: self.moveBackward = false; break;
            case 39: case 68: self.turnRight    = false; break;
            case 82:          self.moveUp       = false; break;
            case 70:
                if (typeof window.GTA_atirarTeclado === 'function') window.GTA_atirarTeclado(false);
                break;
            case 32:          self.handbrake    = false; break;
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

// Heranca: deve vir ANTES de adicionar os metodos
GTA.Player.prototype = GTA.Pedestrian.prototype;
GTA.Player.prototype.constructor = GTA.Player;

// ââ Entrar / sair do carro ââââââââââââââââââââââââââââââââââââââââ
GTA.Player.prototype.toggleCar = function () {
    if (this.inCar) {
        this.exitCar();
    } else {
        this.enterNearestCar();
    }
};

GTA.Player.prototype.enterNearestCar = function () {
    var cars = GTA.allCars;
    if (!cars || cars.length === 0) return;

    var nearest     = null;
    var nearestDist = 250;
    var px = this.position.x;
    var py = this.position.y;

    for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (!c || !c.sprite) continue;
        var cx = c.sprite.position.x;
        var cy = c.sprite.position.y;
        var dx = cx - px;
        var dy = cy - py;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = c;
        }
    }

    if (nearest) {
        this.inCar = true;
        this.currentCar = nearest;
        this.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0));
        if (this.sprite) this.sprite.visible = false;
        if (typeof window.GTA_onEnterCar === 'function') window.GTA_onEnterCar(nearest);
        GTA.Log('Entrou no carro tipo ' + nearest.type);
    }
};

GTA.Player.prototype.exitCar = function () {
    if (!this.inCar || !this.currentCar) return;

    if (this.currentCar.physics) {
        this.currentCar.physics.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 0));
        var carPos = this.currentCar.physics.GetPosition();
        this.physics.SetPosition(new Box2D.Common.Math.b2Vec2(carPos.x + 2, carPos.y + 2));
    }

    this.inCar = false;
    this.currentCar = null;
    if (this.sprite) this.sprite.visible = true;
    if (typeof window.GTA_onExitCar === 'function') window.GTA_onExitCar();
    GTA.Log('Saiu do carro');
};

// ââ Dirigir carro (Box2D) âââââââââââââââââââââââââââââââââââââââââ
GTA.Player.prototype.updateDriving = function ( delta ) {
    var car       = this.currentCar;
    var carPhys   = car.physics;
    var angle     = carPhys.GetAngle();
    var carSpeed  = GTA_CAR_SPEEDS[car.type] || 16;
    var turnSpeed = 0.055;

    carPhys.SetAwake(true);

    if (this.handbrake) {
        var vel    = carPhys.GetLinearVelocity();
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

// ââ Movimento a pÃ© â GTA2_Unity style ââââââââââââââââââââââââââââ
// Inspirado em PlayerMovement.cs:
//   rb.velocity = transform.forward * input.y * RunSpeed  (SetLinearVelocity direto)
//   transform.Rotate(rotationY * Time.deltaTime)          (SetAngle direto)
GTA.Player.prototype.updateOnFoot = function ( delta ) {
    try {
        var phys = this.physics;
        if (!phys || typeof phys.GetAngle !== 'function') {
            // Fallback: usa o update original do pedestre
            _pedOrigUpdate.call(this, delta);
            return;
        }

        var scale    = GTA.PhysicsScale || 10;
        var angle    = phys.GetAngle();
        var speed    = 18;   // unidades fisica/s (= 180 world units/s)
        var rotSpeed = 2.8;  // rad/s â CharacterData.RotationSensitivity

        // Rotacao direta (como GTA2_Unity: transform.Rotate)
        if (this.turnLeft)  angle -= rotSpeed * delta;
        if (this.turnRight) angle += rotSpeed * delta;
        phys.SetAngle(angle);

        // Velocidade direta (como GTA2_Unity: rb.velocity = forward * speed)
        var vx = 0, vy = 0;
        if (this.moveForward) {
            vx = -Math.sin(angle) * speed;
            vy =  Math.cos(angle) * speed;
        } else if (this.moveBackward) {
            vx =  Math.sin(angle) * speed * 0.5;
            vy = -Math.cos(angle) * speed * 0.5;
        }
        // Sem movimento: zera velocidade imediatamente (sem inÃ©rcia/deslize)
        phys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vx, vy));
        phys.SetAwake(true);

        // Sincroniza posicao Three.js com Box2D
        var pos = phys.GetPosition();
        this.position.x =  pos.x * scale;
        this.position.y = -pos.y * scale;

        // Rotacao do sprite
        if (this.sprite) {
            this.sprite.rotation.z = -angle;
        }

        // ââ Animacao de sprite (como person.js) ââââââââââââââââ
        // movementSpeed: 0=parado, 1=andando, 2=correndo
        var movementSpeed = 0;
        if (this.moveForward)       movementSpeed = 2;
        else if (this.moveBackward) movementSpeed = 1;

        var spriteID = ((this.weapon || 0) * 3) + movementSpeed;
        var anim = this.animationSprites && this.animationSprites[spriteID];
        if (anim && this.spriteAnimator) {
            if (anim.length <= 2) {
                // Frame estatico (standing / aiming sem movimento)
                this.spriteAnimator.setSprite(anim[0]);
                this.spriteframe = 0;
            } else {
                // Animacao ciclica (walking / running)
                this.lastframe = (this.lastframe || 0) + delta;
                if (this.lastframe > anim[2]) {
                    this.lastframe = 0;
                    this.spriteAnimator.setSprite(anim[0] + this.spriteframe);
                    this.spriteframe = ((this.spriteframe || 0) + 1) % anim[1];
                }
            }
        }

    } catch(e) {
        // Fallback seguro
        try { _pedOrigUpdate.call(this, delta); } catch(e2) {}
    }
};

// ââ Update principal ââââââââââââââââââââââââââââââââââââââââââââââ
GTA.Player.prototype.update = function ( delta ) {
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
