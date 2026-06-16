/*
 * player.js
 * @author Niklas von Hertzen / ATG1
 * Enhanced: movimento GTA2_Unity style (SetLinearVelocity direto),
 *           sistema de armas com municao, ciclar armas
 */

var _pedOrigUpdate = GTA.Pedestrian.prototype.update;

var GTA_CAR_SPEEDS = {
    4:  25,
    44: 20,
    58: 16,
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
    this.weapon        = 0;
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
            case 81: if (typeof window.GTA_cycleWeapon === 'function') window.GTA_cycleWeapon(); break;
            case 70: if (typeof window.GTA_atirarTeclado === 'function') window.GTA_atirarTeclado(true); break;
            case 13: case 69: self.toggleCar(); break;
            case 32: self.handbrake = true; break;
        }
    };
    this.onKeyUp = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward  = false; break;
            case 37: case 65: self.turnLeft     = false; break;
            case 40: case 83: self.moveBackward = false; break;
            case 39: case 68: self.turnRight    = false; break;
            case 82:          self.moveUp       = false; break;
            case 70: if (typeof window.GTA_atirarTeclado === 'function') window.GTA_atirarTeclado(false); break;
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

GTA.Player.prototype.toggleCar = function () {
    if (this.inCar) { this.exitCar(); } else { this.enterNearestCar(); }
};

GTA.Player.prototype.enterNearestCar = function () {
    var cars = GTA.allCars;
    if (!cars || cars.length === 0) return;
    var nearest = null, nearestDist = 250;
    var px = this.position.x, py = this.position.y;
    for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (!c || !c.sprite) continue;
        var dx = c.sprite.position.x - px, dy = c.sprite.position.y - py;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < nearestDist) { nearestDist = dist; nearest = c; }
    }
    if (nearest) {
        this.inCar = true; this.currentCar = nearest;
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
    this.inCar = false; this.currentCar = null;
    if (this.sprite) this.sprite.visible = true;
    if (typeof window.GTA_onExitCar === 'function') window.GTA_onExitCar();
    GTA.Log('Saiu do carro');
};

GTA.Player.prototype.updateDriving = function ( delta ) {
    var car = this.currentCar, carPhys = car.physics;
    var angle = carPhys.GetAngle();
    var carSpeed = GTA_CAR_SPEEDS[car.type] || 16, turnSpeed = 0.055;
    carPhys.SetAwake(true);
    if (this.handbrake) {
        var vel = carPhys.GetLinearVelocity(), atrito = this.moveForward ? 0.97 : 0.84;
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vel.x*atrito, vel.y*atrito));
        if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed*2.8);
        if (this.turnRight) carPhys.SetAngle(angle + turnSpeed*2.8);
    } else if (this.moveForward) {
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(-Math.sin(angle)*carSpeed, Math.cos(angle)*carSpeed));
        if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed);
        if (this.turnRight) carPhys.SetAngle(angle + turnSpeed);
    } else if (this.moveBackward) {
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(Math.sin(angle)*carSpeed*0.5, -Math.cos(angle)*carSpeed*0.5));
        if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed);
        if (this.turnRight) carPhys.SetAngle(angle + turnSpeed);
    } else {
        var vel = carPhys.GetLinearVelocity();
        carPhys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vel.x*0.85, vel.y*0.85));
    }
    var pos = carPhys.GetPosition();
    this.position.x =  pos.x * GTA.PhysicsScale;
    this.position.y = -pos.y * GTA.PhysicsScale;
};

// GTA2_Unity: rb.velocity = forward * RunSpeed (SetLinearVelocity direto, sem inercia)
GTA.Player.prototype.updateOnFoot = function ( delta ) {
    try {
        var phys = this.physics;
        if (!phys || typeof phys.GetAngle !== 'function') { _pedOrigUpdate.call(this, delta); return; }
        var scale = GTA.PhysicsScale || 10;
        var angle = phys.GetAngle();
        var speed = 18, rotSpeed = 2.8;
        if (this.turnLeft)  angle -= rotSpeed * delta;
        if (this.turnRight) angle += rotSpeed * delta;
        phys.SetAngle(angle);
        var vx = 0, vy = 0;
        if (this.moveForward)       { vx = -Math.sin(angle)*speed;     vy =  Math.cos(angle)*speed; }
        else if (this.moveBackward) { vx =  Math.sin(angle)*speed*0.5; vy = -Math.cos(angle)*speed*0.5; }
        phys.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(vx, vy));
        phys.SetAwake(true);
        var pos = phys.GetPosition();
        this.position.x =  pos.x * scale;
        this.position.y = -pos.y * scale;
        if (this.sprite) this.sprite.rotation.z = -angle;
    } catch(e) {
        try { _pedOrigUpdate.call(this, delta); } catch(e2) {}
    }
};

GTA.Player.prototype.update = function ( delta ) {
    if (!this._isPlayer) { _pedOrigUpdate.call(this, delta); return; }
    if (this.inCar && this.currentCar && this.currentCar.physics) { this.updateDriving(delta); return; }
    this.updateOnFoot(delta);
};

function bind( scope, fn ) { return function () { fn.apply( scope, arguments ); }; }
