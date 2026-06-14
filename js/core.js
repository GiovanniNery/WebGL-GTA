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

        car = new GTA.GameObjectPosition();  
        car.addCar(this, 58, 328, 193, 255, 400 );
        car.initPhysics( this );
        this.map.addObject( car );
        this.activeObjects.push( car );
        
        car = new GTA.GameObjectPosition();  
        car.addCar(this, 4, 242, 225, 255, 764 );
        car.initPhysics( this );
        this.map.addObject( car );
        this.activeObjects.push( car );
        
        car = new GTA.GameObjectPosition();  
        car.addCar(this, 44, 281, 297, 255, 300 );
        car.initPhysics( this );
        this.map.addObject( car );
        this.activeObjects.push( car );

        var extraCars = [
            [0,  170, 165, 255, 200],
            [1,  205, 178, 255, 512],
            [5,  255, 195, 255, 100],
            [10, 295, 215, 255, 700],
            [15, 335, 235, 255, 350],
            [20, 218, 258, 255, 600],
            [25, 268, 278, 255, 200],
            [30, 308, 298, 255, 900],
            [35, 258, 318, 255, 100],
            [40, 198, 308, 255, 450],
            [2,  175, 285, 255, 800],
            [6,  183, 245, 255, 250],
            [8,  348, 205, 255, 300],
            [12, 368, 245, 255, 100],
            [16, 378, 282, 255, 720],
            [18, 358, 312, 255, 400],
            [22, 288, 342, 255, 200],
            [26, 228, 352, 255, 650],
            [32, 168, 332, 255, 300],
            [36, 152, 292, 255, 800],
            [42, 230, 170, 255, 500],
            [48, 310, 175, 255, 100],
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
        
        this.scene.add( this.map.sections [ 0 ][ 0 ] );
        this.scene.add( this.map.sections [ 0 ][ 1 ] );
        this.scene.add( this.map.sections [ 1 ][ 1 ] );
        this.scene.add( this.map.sections [ 1 ][ 2 ] );
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
            
            _.physics.updateWorld(_, GTA.getBlock(_.player.position.x, _.player.position.y, 2));
            
            _.physics.world.Step( 1/60, 10, 10 );
            _.physics.world.DrawDebugData();
            _.physics.world.ClearForces();

            if (GTA.aiPedestrians && GTA.aiPedestrians.length > 0) {
                var delta = clock.getDelta();
                GTA.aiPedestrians.forEach(function(ped) {
                    if (ped && typeof ped.updateAI === 'function') {
                        ped.updateAI(delta);
                    }
                });
            }
            
            methods.render.call(_);
        },
        render: function() {
            this.player.update( clock.getDelta() );
            
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
