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

        // Player nasce em Three.js (6720, -7616) = loader.js block (105,119)
        // Car initPhysics: physX=(carX-32)/10, physY=(carY-20)/10
        // Three.js sprite: x=physX*10=carX-32, y=-physY*10=-(carY-20)
        // Para Three.js(6720,-7616): carX=6752, carY=7636
        car = new GTA.GameObjectPosition();
        car.addCar(this, 58, 6752, 7636, 255, 400 );
        car.initPhysics( this );
        this.map.addObject( car );
        this.activeObjects.push( car );

        car = new GTA.GameObjectPosition();
        car.addCar(this, 4, 6880, 7572, 255, 764 );
        car.initPhysics( this );
        this.map.addObject( car );
        this.activeObjects.push( car );

        car = new GTA.GameObjectPosition();
        car.addCar(this, 44, 6688, 7828, 255, 300 );
        car.initPhysics( this );
        this.map.addObject( car );
        this.activeObjects.push( car );

        // [type, x, y, z, angle] Three.js: x=X-32, y=-(Y-20)
        var extraCars = [
            [58, 6816, 7604, 255,   0],
            [4,  6944, 7556, 255, 128],
            [44, 6624, 7668, 255,  64],
            [58, 6768, 7700, 255, 192],
            [4,  6848, 7764, 255,   0],
            [44, 6672, 7796, 255, 128],
            [58, 6912, 7828, 255,  64],
            [4,  6752, 7860, 255, 192],
            [44, 6624, 7540, 255, 128],
            [58, 6976, 7668, 255,   0],
            [4,  6848, 7892, 255,  64],
        ];

        extraCars.forEach(function(d) {
            try {
                var c = new GTA.GameObjectPosition();
                c.addCar(this, d[0], d[1], d[2], d[3], d[4]);
                c.initPhysics(this);
                this.map.addObject(c);
                this.activeObjects.push(c);
                GTA.allCars.push(c);
            } catch(e) {
                GTA.Log("Car spawn error type " + d[0] + ": " + e.message);
            }
        }.bind(this));

        GTA.allCars.push(this.activeObjects[0]);
        GTA.allCars.push(this.activeObjects[1]);
        GTA.allCars.push(this.activeObjects[2]);

        if (typeof GTA.spawnAIPedestrians === 'function') {
            GTA.spawnAIPedestrians(this);
        }

        cameraZone = [
            Math.round((this.camera.position.x / 64) / GTA.SectionSize),
            Math.round((-(this.camera.position.y / 64)) / GTA.SectionSize)
        ];
        
        // Player em block(105,119) section y=7, x=6
        // sections[y_sec][x_sec] conforme map.addObject
        var addSec = function(s, y, x) {
            if (s[y] && s[y][x]) scene.add(s[y][x]);
        };
        var scene = this.scene, secs = this.map.sections;
        addSec(secs, 6, 5); addSec(secs, 6, 6); addSec(secs, 6, 7);
        addSec(secs, 7, 5); addSec(secs, 7, 6); addSec(secs, 7, 7);
        addSec(secs, 8, 5); addSec(secs, 8, 6); addSec(secs, 8, 7);

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

            var delta = clock.getDelta();

            _.physics.updateWorld(_, GTA.getBlock(_.player.position.x, _.player.position.y, 2));

            _.physics.world.Step( 1/60, 10, 10 );
            _.physics.world.DrawDebugData();
            _.physics.world.ClearForces();

            if (GTA.aiPedestrians && GTA.aiPedestrians.length > 0) {
                GTA.aiPedestrians.forEach(function(ped) {
                    if (ped && typeof ped.updateAI === 'function') {
                        ped.updateAI(delta);
                    }
                });
            }

            methods.render.call(_, delta);
        },
        render: function(delta) {
            this.player.update( delta );
            
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

GTA.allCars = [];
GTA.aiPedestrians = [];
