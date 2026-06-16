/* 
 * @author Niklas von Hertzen <niklas at hertzen.com>
 * @created 30.12.2011 
 * @website http://hertzen.com
 * Enhanced: more cars + AI pedestrians + enter car support
 */

var mouseX = 0, mouseY = 0;
var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

function onDocumentMouseMove(event) {
    mouseX = ( event.clientX - windowHalfX );
    mouseY = ( event.clientY - windowHalfY );
}

if ( !window.requestAnimationFrame ) {
    window.requestAnimationFrame = ( function() {
        return window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function( callback, element ) {
            window.setTimeout( callback, 1000 / 60 );
        };
    } )();
}

var clock = new THREE.Clock();
var GTA = GTA || {};
var controls;

window.URL = window.webkitURL;
window.BlobBuilder = window.WebKitBlobBuilder || window.MozBlobBuilder;
window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;

GTA.Game = function ( ) {
    
    document.addEventListener( 'mousemove', onDocumentMouseMove, false );
    this.scene = new THREE.Scene();
    
    var methods;
    
    this.supports = {
        FileSystem: (window.requestFileSystem) ? true : false
    };
    
    if ( this.supports.FileSystem ) {
        this.filesystem = new GTA.FileSystem( this );
    } else {
        this.filesystem = null;
        GTA.loader.call( this );
    }

    this.tileMaterials;
    
    this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 1500 );
    this.camera.position.z = 400;
    this.camera.position.x =  105*64;
    this.camera.position.y =  -119*64;
    this.scene.add( this.camera );

    controls = new THREE.FirstPersonControls( this.camera );
    controls.movementSpeed = 1000;
    controls.lookSpeed = 0.025;
    controls.lookVertical = true;
    controls.constrainVertical = false;
    controls.verticalMin = 1.1;
    controls.verticalMax = 2.2;
   
    this.loaded = function () {

        var i, car;

        // ââ 8 carros estratÃ©gicos ââââââââââââââââââââââââââââââ
        // Player nasce em Three.js (512, -192) [GTA.Debug.startPosition=[8,3,2]]
        // Formula: carX = Three.js_x + 32
        //          tipo58/4 (h=64): carY = 32 - Three.js_y
        //          tipo44  (h=124): carY = 62 - Three.js_y
        // [tipo, carX, carY, z, angulo]
        var carData = [
            [58,  544,  224, 128,   0],  // normal  â junto ao player
            [4,   608,  224, 128,  64],  // policia â leste
            [58,  672,  224, 128, 128],  // normal  â leste afastado
            [44,  480,  254, 128, 192],  // medio   â oeste
            [4,   416,  224, 128,   0],  // policia â oeste afastado
            [58,  544,  288, 128,  64],  // normal  â sul
            [44,  608,  318, 128, 128],  // medio   â sul-leste
            [44,  480,  318, 128,   0],  // medio   â sul-oeste
        ];

        carData.forEach(function(d) {
            try {
                var c = new GTA.GameObjectPosition();
                c.addCar(this, d[0], d[1], d[2], d[3], d[4]);
                c.initPhysics(this);
                this.map.addObject(c);
                // Fix z: map.addObject coloca z=2 (abaixo do chao z=32); forcar z=128 (nivel do player)
                if (c.sprite) c.sprite.position.z = 128;
                this.activeObjects.push(c);
                GTA.allCars.push(c);
            } catch(e) {
                GTA.Log("Car spawn error tipo " + d[0] + ": " + e.message);
            }
        }.bind(this));

        // ââ Pedestres IA âââââââââââââââââââââââââââââââââââââ
        if (typeof GTA.spawnAIPedestrians === 'function') {
            GTA.spawnAIPedestrians(this);
        }

        cameraZone = [
            Math.round((this.camera.position.x / 64) / GTA.SectionSize),
            Math.round((-(this.camera.position.y / 64)) / GTA.SectionSize)
        ];
        
        // Player em block(105,119) â section y=7, x=6
        // sections[y_sec][x_sec] conforme map.addObject
        var addSec = function(s, y, x) {
            if (s[y] && s[y][x]) scene.add(s[y][x]);
        };
        var scene = this.scene, secs = this.map.sections;
        // Secoes originais (area da camera inicial)
        addSec(secs, 6, 5); addSec(secs, 6, 6); addSec(secs, 6, 7);
        addSec(secs, 7, 5); addSec(secs, 7, 6); addSec(secs, 7, 7);
        addSec(secs, 8, 5); addSec(secs, 8, 6); addSec(secs, 8, 7);
        // Secoes perto do spawn do player (block 8,3 -> secao 0,0)
        addSec(secs, 0, 0); addSec(secs, 0, 1); addSec(secs, 0, 2);
        addSec(secs, 1, 0); addSec(secs, 1, 1); addSec(secs, 1, 2);
        addSec(secs, 2, 0); addSec(secs, 2, 1); addSec(secs, 2, 2);

        // Esconde tela de carregamento
        var loadEl = document.getElementById('_loading');
        if (loadEl) loadEl.style.display = 'none';

        methods.animate();
    };
   
    this.cars = {};
    this.activeObjects = [];
    this.sprites = [];
    this.map = new GTA.Map( this.scene );
    this.physics = new GTA.Physics( this );
    this.missions = {};
    this.mission = null;
    this.gameobjects = [];
  
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.renderer.setClearColorHex( 0x000000, 0 );
    this.renderer.sortObjects = false;
        
    console.log(this);
    window.document.body.appendChild( this.renderer.domElement );
    
    var _ = this,
    cameraZone;
    
    methods = {
        animate: function() {
            requestAnimationFrame( methods.animate );
            try {
                var delta = clock.getDelta();

                _.physics.updateWorld(_, GTA.getBlock(_.player.position.x, _.player.position.y, 2));
                _.physics.world.Step( 1/60, 10, 10 );
                _.physics.world.ClearForces();

                // Atualiza pedestres IA
                if (GTA.aiPedestrians && GTA.aiPedestrians.length > 0) {
                    GTA.aiPedestrians.forEach(function(ped) {
                        if (ped && typeof ped.updateAI === 'function') {
                            try { ped.updateAI(delta); } catch(e) {}
                        }
                    });
                }

                methods.render.call(_, delta);
            } catch(e) {
                GTA.Log('animate error: ' + e.message);
            }
        },
        render: function(delta) {
            this.player.update( delta );

            // Sincroniza posicao Three.js dos carros com Box2D
            var _scale = GTA.PhysicsScale || 10;
            GTA.allCars.forEach(function(car) {
                try {
                    if (car.physics && car.sprite) {
                        var pos = car.physics.GetPosition();
                        car.sprite.position.x =  pos.x * _scale - 32;
                        car.sprite.position.y = -pos.y * _scale + 32;
                        car.sprite.position.z = 128;
                        car.sprite.rotation.z = car.physics.GetAngle();
                    }
                } catch(e) {}
            });

            this.camera.position.x = this.player.position.x;
            this.camera.position.y = this.player.position.y;
            
            var x = Math.round((this.camera.position.x / 64) / GTA.SectionSize),
            y = Math.round((-(this.camera.position.y / 64)) / GTA.SectionSize);
            
            if ( x !== cameraZone[ 0 ] || y !== cameraZone[ 1 ] ) {
                (function(game, x, y){})(this, x, y);
                cameraZone[ 0 ] = x;
                cameraZone[ 1 ] = y;
            }
            
            if (GTA.Debug.enabled && GTA.Debug.positionData) {
                GTA.Debug.updatePositionData.call( this );
            }
            
            this.renderer.render( this.scene, this.camera );
        }
    };
};

GTA.getBlock = function ( x, y, z ) {
    return [ Math.round(x / 64), - Math.round(y / 64), Math.round(z / 64) ];
};

GTA.getBlockItem = function ( game, blockArray ) {
    return game.map.base[ blockArray[ 0 ] ][ (blockArray[ 1 ]) ].blocks[ blockArray [ 2 ] ];
};

GTA.Logging = true;

GTA.Log = function ( message ) {
    if (GTA.Logging && window.console !== undefined) {
        window.console.log( message );
    }
};

GTA.Error = function ( error ) {
    throw new Error( error );
};

GTA.Rotation = function ( gtaAngle ) {
    return ((gtaAngle / 256) * 90) * (Math.PI / 180);
};

GTA.SectionSize = 16;
GTA.Blocks = [];
GTA.Base = [];

// Lista global de carros para o sistema de entrar no carro
GTA.allCars = [];
// Lista global de pedestres IA
GTA.aiPedestrians = [];
