/* 
 * @author Niklas von Hertzen <niklas at hertzen.com>
 * @created 4.1.2012
 * Enhanced: enter/exit car, drive car, AI pedestrian compat
 */

// Captura update original ANTES de sobrescrever (person.js já rodou)
var _pedOrigUpdate = GTA.Pedestrian.prototype.update;

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
    
    // Marcador de player (para diferenciar de pedestres IA)
    this._isPlayer = true;
    
    // Estado do carro
    this.inCar = false;
    this.currentCar = null;
    
    this.domElement = document;

    var self = this;

    this.onKeyDown = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward   = true;  break;
            case 37: case 65: self.turnLeft      = true;  break;
            case 40: case 83: self.moveBackward  = true;  break;
            case 39: case 68: self.turnRight     = true;  break;
            case 82:          self.moveUp        = true;  break;
            case 70:          self.moveDown      = true;  break;
            case 81:          self.freeze = !self.freeze; break;
            case 13: case 69: self.toggleCar();           break;
        }
    };

    this.onKeyUp = function ( event ) {
        switch( event.keyCode ) {
            case 38: case 87: self.moveForward  = false; break;
            case 37: case 65: self.turnLeft     = false; break;
            case 40: case 83: self.moveBackward = false; break;
            case 39: case 68: self.turnRight    = false; break;
            case 82:          self.moveUp       = false; break;
            case 70:          self.moveDown     = false; break;
        }
    };

    this.domElement.addEventListener( 'keydown', this.onKeyDown, false );
    this.domElement.addEventListener( 'keyup',   this.onKeyUp,   false );

    // Garante foco no canvas para eventos touch
    var canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.setAttribute('tabindex','0');
        canvas.addEventListener('touchstart', function(){canvas.focus();}, {once:true, passive:true});
    }
};

// ── Herança: deve vir ANTES de adicionar os métodos ──────────
GTA.Player.prototype = GTA.Pedestrian.prototype;
GTA.Player.prototype.constructor = GTA.Player;

// ── Entrar / sair do carro ───────────────────────────────────
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

    var nearest   = null;
    var nearestDist = 250; // ~4 blocos de distância
    var px = this.position.x;
    var py = this.position.y;

    for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (!c || !c.sprite) continue;

        // Posição do carro no mundo (atualizada pelo physicsUpdate)
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

        // Para pedestres enquanto no carro
        this.physics.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(0, 0)
        );

        // Esconde sprite do jogador
        if (this.sprite) this.sprite.visible = false;

        GTA.Log('Entrou no carro tipo ' + nearest.type + ' dist=' + Math.round(nearestDist));
    } else {
        GTA.Log('Nenhum carro proximo (range=' + nearestDist + ')');
    }
};

GTA.Player.prototype.exitCar = function () {
    if (!this.inCar || !this.currentCar) return;

    // Para o carro
    if (this.currentCar.physics) {
        this.currentCar.physics.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(0, 0)
        );

        // Reposiciona jogador ao lado do carro
        var carPos = this.currentCar.physics.GetPosition();
        this.physics.SetPosition(
            new Box2D.Common.Math.b2Vec2(carPos.x + 2, carPos.y + 2)
        );
    }

    this.inCar = false;
    this.currentCar = null;

    if (this.sprite) this.sprite.visible = true;

    GTA.Log('Saiu do carro');
};

// ── Direção do carro ─────────────────────────────────────────
GTA.Player.prototype.updateDriving = function ( delta ) {
    var car       = this.currentCar;
    var carPhys   = car.physics;
    var angle     = carPhys.GetAngle();
    var carSpeed  = 8;        // velocidade (unidades física)
    var turnSpeed = 0.055;

    // Acorda o corpo Box2D (pode estar em sleeping state)
    carPhys.SetAwake(true);

    if (this.moveForward) {
        carPhys.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(
                 Math.sin(angle) * carSpeed,
                -Math.cos(angle) * carSpeed
            )
        );
    } else if (this.moveBackward) {
        carPhys.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(
                -Math.sin(angle) * carSpeed * 0.5,
                 Math.cos(angle) * carSpeed * 0.5
            )
        );
    } else {
        // Fricção natural
        var vel = carPhys.GetLinearVelocity();
        carPhys.SetLinearVelocity(
            new Box2D.Common.Math.b2Vec2(vel.x * 0.85, vel.y * 0.85)
        );
    }

    if (this.turnLeft)  carPhys.SetAngle(angle - turnSpeed);
    if (this.turnRight) carPhys.SetAngle(angle + turnSpeed);

    // Player segue posição do carro
    var pos = carPhys.GetPosition();
    this.position.x =  pos.x * GTA.PhysicsScale;
    this.position.y = -pos.y * GTA.PhysicsScale;
};

// ── Update: diferencia player de pedestres IA ────────────────
GTA.Player.prototype.update = function ( delta ) {
    // Pedestres IA (sem _isPlayer) usam update original
    if (!this._isPlayer) {
        _pedOrigUpdate.call(this, delta);
        return;
    }

    // Player dentro do carro
    if (this.inCar && this.currentCar && this.currentCar.physics) {
        this.updateDriving(delta);
        return;
    }

    // Player a pé: usa lógica original
    _pedOrigUpdate.call(this, delta);
};

// Helper legado
function bind( scope, fn ) {
    return function () { fn.apply( scope, arguments ); };
}
