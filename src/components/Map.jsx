import { useRapier, RigidBody } from "@react-three/rapier";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { TransformControls, useTexture } from "@react-three/drei";
import { FlameEmitter } from "./FlameEmitter";
import { GrassComponent } from "./GrassComponent";
import { AIController } from "./AIController";
import { CharacterController } from "./CharacterController";
import { Vector3 } from "three";
import * as Babel from "@babel/standalone";
import { globalPlayerPosition } from './GlobalPositionStore'; 
import React from "react";
import { targetPosition } from './TargetPosition';
import { Car } from './CarAndWheel';
import { ProceduralRectangularLayout, InstancedFloors } from './ProceduralBuilding';
import { ApartmentRoom } from "./ApartmentRoom";

// e.g., at the top of your component
import { io } from "socket.io-client";
const socket = io("http://localhost:4000"); // your server

// Cache for GLTF models to prevent re-loading
const gltfCache = {};
const loadGLTF = async (name) => {
  if (gltfCache[name]) return gltfCache[name];
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`models/${name}.glb`);
  gltfCache[name] = gltf;
  return gltf;
};


// StoneBox component remains the same
export const StoneBox = React.forwardRef(({
  size = [2, 2, 2],
  tileSize = 1,
  boxColor = 0x7f6e5c,
  scale = [1, 1, 1],
  visible = true

}, ref) => {
  const [width, height, depth] = size;
  const colorMap = useTexture("textures/stone/color.png");

  const groupRef = useRef();
  React.useImperativeHandle(ref, () => groupRef.current);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.userData.isTopLevel = true;
      groupRef.current.userData.modelName = "StoneBox";
    }
  }, []);

  let scaleX, scaleY, scaleZ;

  try {
    if (
      Array.isArray(scale) &&
      scale.length === 3 &&
      scale.every((v) => typeof v === "number" && !isNaN(v))
    ) {
      [scaleX, scaleY, scaleZ] = scale;
    } else {
      throw new Error("Invalid scale values");
    }
  } catch (error) {
    console.error("Error in StoneBox component:", error);
    [scaleX, scaleY, scaleZ] = [1, 1, 1];
  }


  const materials = useMemo(() => {
    const createMaterial = (repeatX, repeatY) => {
      const material = new THREE.MeshStandardMaterial({
        map: colorMap.clone(),
        color: boxColor,
      });
      material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping;
      material.map.repeat.set(repeatX, repeatY);
      return material;
    };

    const topBottomMaterial = createMaterial((width * scaleX) / tileSize, (depth * scaleZ) / tileSize);
    const frontBackMaterial = createMaterial((width * scaleX) / tileSize, (height * scaleY) / tileSize);
    const leftRightMaterial = createMaterial((depth * scaleZ) / tileSize, (height * scaleY) / tileSize);

    return [
      leftRightMaterial, leftRightMaterial,
      topBottomMaterial, topBottomMaterial,
      frontBackMaterial, frontBackMaterial,
    ];
  }, [colorMap, width, height, depth, tileSize, boxColor, scale]);

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={size} />
        {materials.map((material, index) => (
          <meshStandardMaterial
            key={index}
            attach={`material-${index}`}
            map={material.map}
            color={material.color}
            visible={visible}
          />
        ))}
      </mesh>
    </group>
  );
});

/*
// 🔹 Component source strings
const componentSources = {
  StoneBox: `
    import { useTexture } from "@react-three/drei";
    import * as THREE from "three";

    globalThis.StoneBox = React.forwardRef((
      { size = [2, 2, 2], tileSize = 1, boxColor = 0x7f6e5c, scale = [1,1,1] },
      ref
    ) => {
      const [width, height, depth] = size;
      const colorMap = useTexture("textures/stone/color.png");

      const groupRef = React.useRef();
      React.useImperativeHandle(ref, () => groupRef.current);

      React.useEffect(() => {
        if (groupRef.current) {
          groupRef.current.userData.isTopLevel = true;
          groupRef.current.userData.modelName = "StoneBox";
        }
      }, []);

      const [scaleX, scaleY, scaleZ] = scale;

      const materials = React.useMemo(() => {
        const createMaterial = (repeatX, repeatY) => {
          const material = new THREE.MeshStandardMaterial({
            map: colorMap.clone(),
            color: boxColor,
          });
          material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping;
          material.map.repeat.set(repeatX, repeatY);
          return material;
        };

        const topBottom = createMaterial((width * scaleX) / tileSize, (depth * scaleZ) / tileSize);
        const frontBack = createMaterial((width * scaleX) / tileSize, (height * scaleY) / tileSize);
        const leftRight = createMaterial((depth * scaleZ) / tileSize, (height * scaleY) / tileSize);

        return [leftRight, leftRight, topBottom, topBottom, frontBack, frontBack];
      }, [colorMap, width, height, depth, tileSize, boxColor, scale]);

      return (
        <group ref={groupRef}>
          <mesh>
            <boxGeometry args={size} />
            {materials.map((mat, i) => (
              <meshStandardMaterial
                key={i}
                attach={\`material-\${i}\`}
                map={mat.map}
                color={mat.color}
              />
            ))}
          </mesh>
        </group>
      );
    });
  `,
  WoodBox: `
    import * as THREE from "three";

    globalThis.WoodBox = () => (
      <mesh position={[3,0,0]}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="saddlebrown" />
      </mesh>
    );
  `,
};

// 🔹 Dynamic import cache
const dynamicImports = {};

// Load dependency only if missing
async function ensureImport(pkg, globalName) {
  if (!globalThis[globalName]) {
    if (!dynamicImports[pkg]) {
      dynamicImports[pkg] = import(pkg);
    }
    const mod = await dynamicImports[pkg];
    globalThis[globalName] = mod;
  }
  return globalThis[globalName];
}

// 🔹 Compile + install components
async function installComponents(sources) {
  // First, identify and load all unique dependencies
  const requiredGlobals = new Set();
  const loadedGlobals = {};

  for (const src of Object.values(sources)) {
    const importMatches = [...src.matchAll(/import\s+{([^}]+)}\s+from\s+['"](.*?)['"]/g)];
    const namedImportMatches = [...src.matchAll(/import\s+\* as\s+(\w+)\s+from\s+['"](.*?)['"]/g)];

    for (const [, namedExports, pkg] of importMatches) {
        if (pkg === "@react-three/drei") {
            const exports = namedExports.split(',').map(s => s.trim());
            for (const exp of exports) {
                requiredGlobals.add(exp);
            }
        }
    }

    for (const [, alias, pkg] of namedImportMatches) {
        if (pkg === "three") {
            requiredGlobals.add(alias);
        }
    }
  }

  // Now, load the required dependencies
  for (const globalName of requiredGlobals) {
      if (globalName === "useTexture") {
          const drei = await ensureImport("@react-three/drei", "drei");
          loadedGlobals.useTexture = drei.useTexture;
      }
      if (globalName === "THREE") {
          const three = await ensureImport("three", "THREE");
          loadedGlobals.THREE = three;
      }
  }

  // Process each component
  for (const src of Object.values(sources)) {
    // Strip imports from source string
    const importRegex = /import\s+.*?from\s+['"].*?['"];?/g;
    const strippedSrc = src.replace(importRegex, '');

    // Transpile JSX → plain JS
    const { code } = Babel.transform(strippedSrc, { presets: ["react"] });

    // Execute with globals
    const functionArgs = ["React", ...Object.keys(loadedGlobals), code];
    const functionValues = [React, ...Object.values(loadedGlobals)];

    new Function(...functionArgs)(...functionValues);
  }
}

// 🔹 Run installer
installComponents(componentSources);
*/


// RaycastClickHandler component remains the same
const RaycastClickHandler = ({ onSelect, transformControlsRef }) => {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    const handleClick = (event) => {
      if (transformControlsRef.current?.dragging) return;

      const { left, top, width, height } = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - left) / width) * 2 - 1;
      mouse.current.y = -((event.clientY - top) / height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);

      const clickableObjects = [];
      scene.traverse((obj) => {
        if (obj.userData?.isTopLevel) clickableObjects.push(obj);
      });

      const intersects = raycaster.current.intersectObjects(clickableObjects, true);
      if (intersects.length > 0) {
        let root = intersects[0].object;
        while (root.parent) {
          if (root.userData?.isTopLevel) break;
          root = root.parent;
        }
        onSelect?.(root);
      } else {
        onSelect?.(null);
      }
    };

    gl.domElement.addEventListener("click", handleClick);
    return () => gl.domElement.removeEventListener("click", handleClick);
  }, [camera, gl, scene, onSelect, transformControlsRef]);

  return null;
};
export function TwinTowerLayout() {
  
  // --- Configuration Constants (Far Apart Layout) ---
  const TOTAL_FLOORS = 60;
  const FLOOR_HEIGHT = 3.5;
  const CORE_X = 10;
  const CORE_Z = 15;
  const WING_WIDTH = 20;
  const WING_DEPTH = 60;
  const TOWER_OFFSET_X = 20; // Towers are positioned at X = -20 and X = +20
  
  // Calculated gap and slab properties
  const SLAB_THICKNESS = 0.3; 
  const W_GAP = 20;     // Gap width: 20m - (-20m) = 40m center-to-center. 
                        // Inner edge is at -10 and +10, so gap is 20m.
  const D_CONNECT = 20; // Depth of the connector (Adjust to 60 for full depth connection)

  // --- Connector Slab Data Generation ---
  const connectorSlabs = useMemo(() => {
    const slabs = [];
    for (let yi = 0; yi <= TOTAL_FLOORS; yi++) {
      // Y center position: (Floor index * Height) + (Half Slab Thickness)
      const yCenter = (yi * FLOOR_HEIGHT) + (SLAB_THICKNESS / 2);

      slabs.push({
        pos: [0, yCenter, 0], 
        args: [W_GAP, SLAB_THICKNESS, D_CONNECT], 
      });
    }
    return slabs;
  }, [TOTAL_FLOORS, FLOOR_HEIGHT]); // Dependencies ensure recalculation if these change

  // --- Final JSX Structure ---
  return (
    // Base position for the entire structure (lifts the base off the ground plane)
    <group position={[0, 0, 0]}> 
      
      {/* 🌉 Connected Floor Slabs (Renders the 20m-wide connector at every level) */}
      <InstancedFloors items={connectorSlabs} color={"#C0C0C0"} /> 
      
      {/* Left Tower */}
      <group position={[-TOWER_OFFSET_X, 0, 0]}>
        <ProceduralRectangularLayout 
          buildingWidth={WING_WIDTH} 
          buildingDepth={WING_DEPTH} 
          floors={TOTAL_FLOORS}
          floorHeight={FLOOR_HEIGHT}
          core_x_span={CORE_X}
          core_z_span={CORE_Z} 
          core_wall_thickness={0.8}
        />
      </group>

      {/* Right Tower */}
      <group position={[TOWER_OFFSET_X, 0, 0]}>
        <ProceduralRectangularLayout 
          buildingWidth={WING_WIDTH}
          buildingDepth={WING_DEPTH}
          floors={TOTAL_FLOORS}
          floorHeight={FLOOR_HEIGHT}
          core_x_span={CORE_X}
          core_z_span={CORE_Z}
          core_wall_thickness={0.8}
        />
      </group>
    </group>
  );
}
// Helper to compare arrays
function arraysEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const MovableObject = React.memo(({ objectData, onSelect }) => {
  const { id, component, object, options, position, rotation, scale } = objectData;

  const rigidBodyRef = useRef(null);
  const visualObjectRef = useRef(null);
  // State to control if physics is active (and thus, if the object is visible)
  const [isPhysicsActive, setIsPhysicsActive] = useState(true); 
  const [refreshCollider, setRefreshCollider] = useState(false);
  const [lastKnownTransform, setLastKnownTransform] = useState({
    position,
    rotation,
    scale,
  });

  const prevTransformRef = useRef({ position, rotation, scale });

  // Detect changes
  useEffect(() => {
    const prev = prevTransformRef.current;
    const positionChanged = !arraysEqual(prev.position, position);
    const rotationChanged = !arraysEqual(prev.rotation, rotation);
    const scaleChanged = !arraysEqual(prev.scale, scale);

    if (positionChanged || rotationChanged || scaleChanged) {
      console.log(`[MovableObject ${id}] updated`, {
        positionChanged,
        rotationChanged,
        scaleChanged,
        newScale: scale,
      });

      const body = rigidBodyRef.current;
      if (body) {
        if (positionChanged)
          body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        if (rotationChanged)
          body.setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] }, true);
      }

      if (scaleChanged) {
        console.log(`[MovableObject ${id}] refreshing collider for scale`, scale);
        setLastKnownTransform({ position, rotation, scale });
        setRefreshCollider(true);
        setTimeout(() => setRefreshCollider(false), 0);
      }

      prevTransformRef.current = { position, rotation, scale };
    }
  }, [id, position, rotation, scale]);

  /// --- Object Refs (for low GC) ---
    const objectPositionRef = useRef(new THREE.Vector3(...position));
    const objectQuaternion = useMemo(() => new THREE.Quaternion(...rotation || [0, 0, 0, 1]), [rotation]);
    const eulerRotationRef = useRef(new THREE.Euler());
    
    // --- Optimized Euler Calculation ---
    const eulerRotation = useMemo(() => {
        objectPositionRef.current.set(...position);
        
        if (!rotation || rotation.length !== 4) return [0, 0, 0];

        objectQuaternion.set(...rotation);
        return eulerRotationRef.current.setFromQuaternion(objectQuaternion).toArray().slice(0, 3);
    }, [position, rotation, objectQuaternion]); 

  // --- Throttling Refs ---
    const frameCountRef = useRef(0);
    const CULL_CHECK_INTERVAL = 15; // Check every 30 frames
    const CULL_DISTANCE = 200; 
    
// ------------------- Physics & Visual Culling Logic -------------------
    useFrame(() => {
        frameCountRef.current++;

        if (frameCountRef.current % CULL_CHECK_INTERVAL !== 0) {
            return; // Skip most frames
        }
        
        const livePlayerPos = globalPlayerPosition; 
        const objectPosition = objectPositionRef.current; 
        const distance = objectPosition.distanceTo(livePlayerPos);
        const visual = visualObjectRef.current;
        
        if (!visual) return; 

        const shouldBeActive = distance <= CULL_DISTANCE;
        
        if (shouldBeActive !== isPhysicsActive) {
            // Use React state to trigger a re-render and update the RigidBody's 'type' prop
            setIsPhysicsActive(shouldBeActive);
        }
        
        // Always mirror the visibility of the mesh with the physics state
        // This makes sure the visual object disappears the moment physics is disabled
        visual.visible = shouldBeActive;
    });
  // Skip render briefly while collider is rebuilt
  if (refreshCollider) return null;

  // Apply scale to visual mesh
  const content = component ? (
    React.cloneElement(component, { ref: visualObjectRef, scale })
  ) : (
    <primitive object={object} ref={visualObjectRef} scale={scale} />
  );

  return (
    <RigidBody
      ref={rigidBodyRef}
      key={id} // keep same key, avoid resetting everything else
      colliders={options.colliders || "trimesh"}
      type={options.type || "fixed"}
      position={lastKnownTransform.position}
      rotation={eulerRotation}
      scale={lastKnownTransform.scale} // ✅ Pass new scale here!
      enabledRotations={[true, true, true]}
      enabledTranslations={[true, true, true]}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (isPhysicsActive) onSelect(objectData);
      }}
    >
      {content}
    </RigidBody>
  );
});

export const Map = ({ cameraControls, joystickRef, joystickOn }) => {
  const [objects, setObjects] = useState([]);
  const [selectedObjectData, setSelectedObjectData] = useState(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [placementData, setPlacementData] = useState(null);

  const physicsRefs = useRef({});
  const transformControlsRef = useRef();
  const placementObjectRef = useRef(null);
  const { scene } = useThree();
  const hasSpawnedInitialObjects = useRef(false);

  const playerPositionRef = useRef(new Vector3(0, 0, 0)); // Line 1: Needs useRef
  const [worldPlayerPosition, setWorldPlayerPosition] = useState(new Vector3(0, 0, 0)); // Line 2: Needs useState

  const chunkSize = 16;
  const [projectiles, setProjectiles] = useState([]);

  
  // Use useLayoutEffect to update the global variable synchronously
  const lastSpawn = useRef(0); // timestamp of last spawn
  const COOLDOWN = 500; // milliseconds

  const spawnProjectile = (startPos, direction) => {
    const now = Date.now();
    if (now - lastSpawn.current < COOLDOWN) return; // still in cooldown

    lastSpawn.current = now; // update last spawn time
    setProjectiles((prev) => [
      ...prev,
      { key: now, position: startPos.clone(), direction: direction.clone() }
    ]);
  };
    // --- Function to remove a projectile when its lifetime ends ---
  const removeProjectile = (key) => {
    setProjectiles((prev) => prev.filter((p) => p.key !== key));
  };
  const handlePlayerPositionChange = useCallback((newPosition) => {
    playerPositionRef.current.copy(newPosition);
    const currentChunkX = Math.floor(worldPlayerPosition.x / chunkSize);
    const currentChunkZ = Math.floor(worldPlayerPosition.z / chunkSize);
    const newChunkX = Math.floor(newPosition.x / chunkSize);
    const newChunkZ = Math.floor(newPosition.z / chunkSize);
    if (currentChunkX !== newChunkX || currentChunkZ !== newChunkZ) {
      setWorldPlayerPosition(newPosition);
    }
  }, [worldPlayerPosition]);

  const { world } = useRapier();
  console.log("Rerendering Map..");

  // Updated to accept rotation and scale
  // Updated to accept rotation and scale
const spawnStoneBox = useCallback((id, position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], options = {}) => {
  const newId = id || crypto.randomUUID();
  const group = new THREE.Group();
  group.name = "spawned_stone_box_group";
  group.userData.isTopLevel = true;
  group.userData.modelName = "StoneBox";
  group.userData.id = newId;

  // Set the position of the THREE.js group
  group.position.set(...position);

  setObjects((prev) => [
    ...prev,
    {
      id: newId,
      component: <StoneBox size={[2, 2, 2]} boxColor={0x888888} />,
      object: group,
      position,
      rotation,
      scale,
      options: { ...options, rigidBodyActive: true },
      modelName: "StoneBox",
      class: "StoneBox",
    },
  ]);
}, []);

  // Updated to accept rotation and scale
  const spawnMeshObject = useCallback((geometry, material, position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], options = {}) => {
    geometry.center();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = options.name || "CustomMesh";
    mesh.userData.isTopLevel = true;
    mesh.userData.modelName = options.modelName || "CustomMesh";
    mesh.position.set(...position);
    mesh.quaternion.fromArray(rotation);
    mesh.scale.fromArray(scale);
    const component = (
      <mesh
        geometry={geometry}
        material={material}
        position={position}
        castShadow
        receiveShadow
      />
    );
    const newId = crypto.randomUUID();
    setObjects((prev) => [
      ...prev,
      {
        id: newId,
        component,
        object: mesh,
        position,
        rotation, // Use the passed-in rotation
        scale,    // Use the passed-in scale
        options: { ...options, rigidBodyActive: true },
        class: "CustomComponent",
        modelName: options.modelName || "CustomMesh",
      },
    ]);
  }, []);
const spawn = useCallback(async (
  id,
  name,
  initialPosition = [0, 0, 0],
  initialRotation = [0, 0, 0, 1],
  initialScale = [15, 15, 15],
  options = {}
) => {
  try {
    // Step 1: Spawn StoneBox and immediately delete it
    const stoneBoxId = crypto.randomUUID();
    const placeholderGroup = new THREE.Group();
    placeholderGroup.name = "spawned_stone_box_group";
    placeholderGroup.userData.isTopLevel = true;
    placeholderGroup.userData.modelName = "StoneBox";
    placeholderGroup.userData.id = stoneBoxId;
    placeholderGroup.position.set(...initialPosition);
    
    setObjects((prev) => [
      ...prev,
      {
        id: stoneBoxId,
        component: <StoneBox size={[2, 2, 2]} boxColor={0x888888} visible={false} />,
        object: placeholderGroup,
        position: initialPosition,
        rotation: initialRotation,
        scale: initialScale,
        options: { ...options, rigidBodyActive: true },
        modelName: "StoneBox",
        class: "StoneBox",
      },
    ]);

    // Remove placeholder immediately (next tick to avoid batching issues)
    setTimeout(() => {
      setObjects((prev) => prev.filter((obj) => obj.id !== stoneBoxId));
    }, 0);

    // Step 2: Load actual GLTF model
    const gltf = await loadGLTF(name);
    const instance = clone(gltf.scene);
    instance.name = name;
    instance.userData.isTopLevel = true;
    instance.userData.modelName = name;
    instance.userData.id = crypto.randomUUID();

    // Reset transforms so the group controls them
    instance.position.set(0, 0, 0);
    instance.quaternion.set(0, 0, 0, 1);
    instance.scale.set(1, 1, 1);

    // Create top-level group for GLTF
    const group = new THREE.Group();
    group.name = `${name}_group`;
    group.userData.isTopLevel = true;
    group.userData.modelName = name;
    group.position.set(...initialPosition);
    group.quaternion.fromArray(initialRotation);
    group.scale.fromArray(initialScale);
    group.add(instance);

    const component = <primitive object={instance} />;

    setObjects((prev) => [
      ...prev,
      {
        id: id,
        component,
        object: group,
        position: initialPosition,
        rotation: initialRotation,
        scale: initialScale,
        options: { ...options, rigidBodyActive: true },
        modelName: name,
        class: "CustomComponent",
      },
    ]);
  } catch (e) {
    console.error("Failed to spawn GLTF:", name, e);
  }
}, []);



  const handleObjectSelect = useCallback((objData) => {
      setSelectedObjectData(objData);
  }, []);

  const updatePhysicsBodyTransform = useCallback((obj, newPosition, newRotation, newScale) => {
    const physicsBody = physicsRefs.current[obj.id];
    if (physicsBody && physicsBody.current) {
      physicsBody.current.setTranslation({ x: newPosition[0], y: newPosition[1], z: newPosition[2] }, true);
      physicsBody.current.setRotation(new THREE.Quaternion().fromArray(newRotation), true);
    }
  }, []);

useEffect(() => {
    // Detach immediately on mount (scene spawn)
    if (transformControlsRef.current) {
      transformControlsRef.current.detach(); // ensures no object is attached
    }
  }, [transformControlsRef.current]);
// Define your placement boundaries (e.g., a rectangular box from -5 to 5 on X and Z,
// and a height limit between 0.1 and 3 on Y).
const MIN_X = -5;
const MAX_X = 5;
const MIN_Y = 0.1;
const MAX_Y = 3;
const MIN_Z = -5;
const MAX_Z = 5;

// Your Map component's useEffect hook for handling TransformControls changes
useEffect(() => {
    if (selectedObjectData) {
        transformControlsRef.current?.attach(selectedObjectData.object);
    } else {
        transformControlsRef.current?.detach();
    }

    const handleControlsChange = () => {
        if (selectedObjectData) {
            const { object } = selectedObjectData;
            
            // --- Clamping Logic Added Here ---
            
            // 1. Clamp the THREE.js object's position
            //object.position.x = THREE.MathUtils.clamp(object.position.x, MIN_X, MAX_X);
            //object.position.y = THREE.MathUtils.clamp(object.position.y, MIN_Y, MAX_Y);
            //object.position.z = THREE.MathUtils.clamp(object.position.z, MIN_Z, MAX_Z);
            
            // --- End Clamping Logic ---

            // Get the new transform from the THREE.js object (which is now clamped)
            const newPosition = object.position.toArray();
            const newRotation = object.quaternion.toArray();
            const newScale = object.scale.toArray();
            
            // This is the key part: update the physics body directly
            const physicsBody = physicsRefs.current[selectedObjectData.id];
            if (physicsBody && physicsBody.current) { // Use physicsBody.current if it's a ref
                // The setTranslation method expects an object with x, y, z properties or a Vector3.
                // It is critical to use the clamped position here.
                physicsBody.current.setTranslation({ 
                    x: newPosition[0], 
                    y: newPosition[1], 
                    z: newPosition[2] 
                }, true);
                
                // Rotation is not constrained by the bounds, so it stays the same
                physicsBody.current.setRotation(new THREE.Quaternion().fromArray(newRotation), true);
            }

            // Update your state to reflect the new CLAMPED transform
            setObjects(prev => 
                prev.map(o =>
                    o.id === selectedObjectData.id
                        ? { ...o, position: newPosition, rotation: newRotation, scale: newScale }
                        : o
                )
            );
        }
    };

    const controls = transformControlsRef.current;
    if (controls) {
        controls.addEventListener("change", handleControlsChange);
        return () => {
            controls.removeEventListener("change", handleControlsChange);
        };
    }
}, [selectedObjectData, physicsRefs]); // Add physicsRefs to the dependency array


  const cleanupPlacement = useCallback(() => {
    if (placementObjectRef.current) {
      scene.remove(placementObjectRef.current);
      placementObjectRef.current.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
      placementObjectRef.current = null;
    }
    setIsPlacing(false);
    setPlacementData(null);
  }, [scene]);

  useFrame(() => {
    if (isPlacing && placementObjectRef.current) {
      placementObjectRef.current.position.copy(targetPosition);
    }
  });

  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.key === "u") {
        if (!isPlacing) {
            const tempGroup = new THREE.Group();
            const geometry = new THREE.BoxGeometry(2, 2, 2);
            const material = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
            const tempMesh = new THREE.Mesh(geometry, material);
            tempGroup.add(tempMesh);
            tempGroup.position.copy(targetPosition);
            scene.add(tempGroup);
            
            placementObjectRef.current = tempGroup;
            setPlacementData({
              type: "stonebox",
              options: {
                colliders: "cuboid",
                name: "spawned_stone_box",
                modelName: "StoneBox"
              }
            });
            setIsPlacing(true);
        }
      }

      if (e.key === "i") {
        if (!isPlacing) {
          const gltf = await loadGLTF("untitled");
          const tempObject = clone(gltf.scene);
          tempObject.position.copy(targetPosition);
          tempObject.scale.set(150, 150, 150);
          tempObject.traverse((child) => {
            if (child.isMesh) {
              const originalMaterial = child.material;
              const newMaterial = new THREE.MeshBasicMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.5
              });
              child.material = newMaterial;
              child.userData.originalMaterial = originalMaterial;
            }
          });
          scene.add(tempObject);

          placementObjectRef.current = tempObject;
          setPlacementData({
            type: "gltf",
            modelName: "untitled",
            options: {
              colliders: "trimesh",
              name: "untitled",
              modelName: "untitled"
            }
          });
          setIsPlacing(true);
        }
      }

      if (isPlacing && e.key === "Enter") {
        const position = placementObjectRef.current.position.toArray();
        const options = placementData.options;
        const modelName = placementData.modelName;
        const id = crypto.randomUUID();
        if (placementData.type === "gltf") {
            spawn(id, modelName, position, undefined, undefined, options);
            socket.emit("objectSpawned", {
              clientId: myClientId.current,
              object: {
                id: id,
                type: modelName,
                position,
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
              },
            });
        } else if (placementData.type === "stonebox") {
            spawnStoneBox(id, position, undefined, undefined, options);
            socket.emit("objectSpawned", {
              clientId: myClientId.current,
              object: {
                id: id,
                type: 'StoneBox',
                position,
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
              },
            });

        }

        cleanupPlacement();
      }

      if (isPlacing && e.key === "Escape") {
        cleanupPlacement();
      }

      if (!isPlacing) {
        switch (e.key) {
          case "t": transformControlsRef.current?.setMode("translate"); break;
          case "r": transformControlsRef.current?.setMode("rotate"); break;
          case "y": transformControlsRef.current?.setMode("scale"); break;
          case "g":
            const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
            const boxMaterial = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
            spawnMeshObject(boxGeometry, boxMaterial, [Math.random() * 20 - 10, 10, Math.random() * 20 - 10], undefined, undefined, {
              type: "fixed",
              colliders: "cuboid",
              name: "spawned_box",
              modelName: "spawned_box"
            });
            break;
          case "h":
            spawnStoneBox(undefined, position, undefined, undefined, {
              colliders: "cuboid",
              name: "spawned_stone_box",
              modelName: "StoneBox"
            });
            break;
          default: break;
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlacing, scene, cleanupPlacement, spawnMeshObject, spawn, spawnStoneBox]);


  const playerRefs = useRef({});
  const aiRefs = useRef({});

  const allObjectPositionsRef = useRef({});

  // In your Map component, after other useRef declarations
  const previousPositionsRef = useRef({});
  const changedObjectsRef = useRef({});

  function setWorldPositionToZero(obj) {
    if (!obj) return;
    obj.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    obj.matrixWorld.decompose(worldPos, worldQuat, worldScale);
    const newLocalPos = new THREE.Vector3();
    if (obj.parent) {
      obj.parent.updateMatrixWorld(true);
      obj.parent.worldToLocal(newLocalPos.copy(new THREE.Vector3(0, 0, 0)));
    }
    obj.position.copy(newLocalPos);
    obj.updateMatrix();
    obj.updateMatrixWorld(true);
  }

// Give each client a unique ID
const myClientId = useRef(crypto.randomUUID());

// ✅ Listen for broadcasts from server
useEffect(() => {
  socket.on("syncObjects", (msg) => {
    const { clientId, updates } = msg;

    // Skip my own updates
    if (clientId === myClientId.current) return;

    console.log("Received syncObjects:", updates);
    applyChangesToRigidBodies(updates);
  });

  return () => {
    socket.off("syncObjects");
  };
}, []);

useEffect(() => {
  socket.on("syncObjectSpawned", (msg) => {
    const { clientId, object } = msg;
    console.log("Received syncObjectSpawned:", object);
    // Spawn the object in the scene
    
    if (clientId === myClientId.current) return;
    console.log("Spawning object:", object);

    if(object.type === 'StoneBox') {
      spawnStoneBox(object.id, object.position, object.rotation, object.scale, {});
    } else {
      spawn(object.id, object.type, object.position, object.rotation, object.scale, {});
    }
  });

  return () => {
    socket.off("syncObjectSpawned");
  };
}, []);

const applyChangesToRigidBodies = useCallback((updates) => {
  for (const id in updates) {
    const update = updates[id];

    // find the rigidbody whose group has this id
    const rigidBodyRef = physicsRefs.current[id];
    if (!rigidBodyRef) {
      console.warn("No rigidbody found for id", id);
      continue;
    }

    // apply changes to rapier rigidbody
    rigidBodyRef.setTranslation(
      { x: update.position[0], y: update.position[1], z: update.position[2] },
      true
    );
    rigidBodyRef.setRotation(new THREE.Quaternion(...update.rotation), true);
  }
}, []);

  // This is a helper function to check if two arrays of numbers are different.
const areArraysDifferent = (arr1, arr2, epsilon = 0.001) => {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) {
    return true;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (Math.abs(arr1[i] - arr2[i]) > epsilon) {
      return true;
    }
  }
  return false;
};

useFrame(() => {
    // Collect all current object positions, as you're already doing
    const currentPositions = {};
    // Loop through the collected RigidBody references and move them.
    
    Object.keys(physicsRefs.current).forEach((objectId) => {
        const rigidBodyRef = physicsRefs.current[objectId];
        //console.log("useFrame rigidBodyRef", objectId, rigidBodyRef);
        
        if (rigidBodyRef) {
            // This is the key line: call the setTranslation method on the rigid body.
            // This forces the physics engine to move the object to the new position.
            //rigidBodyRef.setTranslation({ x: 0, y: 10, z: 0 }, true);
        }
    });
    
    objects.forEach((obj) => {
        objects.forEach((obj) => {
        if (obj.object) {
          const rigidBodyRef = physicsRefs.current[obj.id]; // 🔑 look it up by your stable id

          currentPositions[obj.id] = {
            type: obj.object.userData.modelName,
            position: obj.object.position.toArray(),
            rotation: obj.object.quaternion.toArray(),
            scale: obj.object.scale.toArray(),
          };

          //console.log(obj, obj.id);
        }
      });
    });
    //console.log(aiRefs);
    Object.values(aiRefs.current).forEach((aiRef) => {
        if (aiRef?.group) {
            const group = aiRef.group;
            const rb = aiRef.rigidbody;

            if (rb?.current) {
                //rb.current.setTranslation({ x: 0, y: 0, z: 0 }, true);
            }

            const id = group.userData.id || crypto.randomUUID();
            currentPositions[id] = {
                type: "AIController",
                name: group.userData.name,
                userData: group.userData,
                position: group.getWorldPosition(new THREE.Vector3()).toArray(),
                rotation: group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
                scale: group.getWorldScale(new THREE.Vector3()).toArray(),
            };
        }
    });

    
    Object.values(playerRefs.current).forEach((playerRef) => {
      //console.log("Player ref");

      // If playerRef is a ref object -> use playerRef.current
      const inst = playerRef?.current ?? playerRef; 

      if (inst?.group) {
          const group = inst.group;
          const id = group.userData.id || crypto.randomUUID();

          const rb = inst.rigidbody;
          if (rb?.current) {
              //rb.current.setTranslation({ x: 0, y: 0, z: 0 }, true);
          }

          currentPositions[id] = {
              type: "Player",
              name: group.userData.name,
              userData: group.userData,
              position: group.getWorldPosition(new THREE.Vector3()).toArray(),
              rotation: group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
              scale: group.getWorldScale(new THREE.Vector3()).toArray(),
          };
      }
  });

    
    
    // Check for changes and populate the changedObjectsRef
    const previousPositions = previousPositionsRef.current;
    
    // Clear the changed objects from the last frame
    changedObjectsRef.current = {};

    for (const id in currentPositions) {
        const current = currentPositions[id];
        const previous = previousPositions[id];

        // If the object is new or its position/rotation/scale has changed, mark it
        if (!previous || 
            areArraysDifferent(current.position, previous.position) ||
            areArraysDifferent(current.rotation, previous.rotation) ||
            areArraysDifferent(current.scale, previous.scale)) {
            
            changedObjectsRef.current[id] = current;
        }
    }

    // Update the previous positions for the next frame's comparison
    previousPositionsRef.current = currentPositions;

    // You can now access changedObjectsRef.current from your synchronization logic
    // For example, in a WebSocket message handler or a REST API call
    //console.log("Changed objects this frame:", changedObjectsRef.current);
    if (Object.keys(changedObjectsRef.current).length > 0) {
      socket.emit("updateObjects", {
        clientId: myClientId.current,
        updates: changedObjectsRef.current,
      });
    }
    // Keep your existing line to support other functionality
    allObjectPositionsRef.current = currentPositions;
});

  useEffect(() => {
    const loadObjectsFromJSON = async () => {
      try {
        const res = await fetch("http://localhost:4000/load-objects");
        const data = await res.json();
        const loadedObjects = data.objects;
        setObjects([]);

        for (const obj of loadedObjects) {
          const { position, rotation, scale, options, class: objClass, modelName } = obj;
          if (objClass === "CustomComponent") {
            await spawn(obj.id, modelName, position, rotation, scale, options);
          } else if (objClass === "StoneBox") {
            spawnStoneBox(obj.id, position, rotation, scale, options);
          } else {
            console.warn("Unknown class in JSON:", objClass);
          }
        }
      } catch (err) {
        console.error("Failed to load objects", err);
      }
    };
    loadObjectsFromJSON();
  }, [spawn]);


  // Inside your Map component, after the useFrame hook
  const saveObjects = useCallback(() => {
      // This function will get the *current* position from the physics bodies
      // and update the `objects` state with that new data.
      const updatedObjects = objects.map(obj => {
          const rigidBodyRef = physicsRefs.current[obj.id];
          if (rigidBodyRef) {
              // Get the current position and rotation from the physics body
              const newPosition = rigidBodyRef.translation();
              const newRotation = rigidBodyRef.rotation();
              
              // Return a new object with the updated position and rotation
              return {
                  ...obj,
                  position: [newPosition.x, newPosition.y, newPosition.z],
                  rotation: [newRotation.x, newRotation.y, newRotation.z, newRotation.w],
              };
          }
          return obj;
      });

      // Update your state to trigger a re-render and ensure the new data is saved
      setObjects(updatedObjects);
      
      // Now the objects state contains the correct positions, so the save will work.
      const serializableObjects = updatedObjects.map(obj => ({
          id: obj.id,
          position: obj.position,
          rotation: obj.rotation,
          scale: obj.scale,
          options: obj.options,
          class: obj.class,
          modelName: obj.modelName,
      }));
      
      // Perform the fetch call here or as a separate effect
      fetch("http://localhost:4000/save-objects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objects: serializableObjects }),
      })
      .then(res => res.json())
      .then(data => console.log("✅ Saved", data))
      .catch(err => console.error("❌ Save failed", err));
  }, [objects]);


useEffect(() => {
    // Call the save function at your desired interval
    const interval = setInterval(saveObjects, 10000);

    return () => clearInterval(interval);
}, [saveObjects]);

// Inside your React component (e.g., GameScene)
const [remotePlayers, setRemotePlayers] = useState({});
const localPlayerRef = useRef(null); // To store the local player's ID and data

useEffect(() => {
  // When the component mounts, tell the server we're ready and send our desired avatar/name
  socket.emit('playerJoined', { name: "MyUsername", avatar: "Midnight Sonata.vrm" });

  // 1. Initial player synchronization (all current players, including us)
  socket.on('currentPlayers', (allPlayers) => {
    const localId = socket.id;
    localPlayerRef.current = allPlayers[localId]; // Store our own data

    // Filter out the local player to get only the remote players
    const remotes = {};
    for (const id in allPlayers) {
      if (id !== localId) {
        remotes[id] = allPlayers[id];
      }
    }
    setRemotePlayers(remotes);
  });

  // 2. A new player joined after we did
  socket.on('playerJoined', (newPlayerData) => {
    setRemotePlayers(prev => ({ ...prev, [newPlayerData.id]: newPlayerData }));
  });
  
  // 3. A player moved
  socket.on('playerMoved', ({ id, position }) => {
    // You would use this event to update the position of the corresponding CharacterController
    // This usually requires a Ref, a state update, or a component update.
    // Easiest way is to update the position in the state, which triggers a re-render.
    setRemotePlayers(prev => {
        const player = prev[id];
        if (player) {
            return { ...prev, [id]: { ...player, position: position } };
        }
        return prev;
    });
  });

  // 4. A player left
  socket.on('playerLeft', (playerId) => {
    setRemotePlayers(prev => {
      const { [playerId]: _, ...rest } = prev;
      return rest;
    });
  });

  // Cleanup
  return () => {
    socket.off('currentPlayers');
    socket.off('playerJoined');
    socket.off('playerMoved');
    socket.off('playerLeft');
  };
}, []);

  const keys = useRef({});

  useEffect(() => {
    const handleKeyDown = e => (keys.current[e.key.toLowerCase()] = true);
    const handleKeyUp = e => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  const controlsRef = useRef();
  const carRef = useRef();


  return (
    <>
      {objects.map((obj) => (
        <MovableObject
          key={obj.id}
          objectData={obj}
          onSelect={handleObjectSelect}
          physicsRef={(el) => (physicsRefs.current[obj.id] = el)}
        />
      ))}

      <RaycastClickHandler 
        onSelect={(obj) => {
          if (obj) {
            const objData = objects.find(o => o.id === obj.userData.id);
            if (objData) {
                handleObjectSelect(objData);
            }
          } else {
              handleObjectSelect(null);
          }
        }} 
        transformControlsRef={transformControlsRef} 
      />
      <TransformControls ref={transformControlsRef} mode="translate" />

      {/* Player */}
      <group position-y={50}>
        {/*<Car ref={carRef} keys={keys} cameraControls={cameraControls} /> */}
        {localPlayerRef.current && (
          <CharacterController
            //key={player.id}
            ref={(el) => (playerRefs.current[socket.id] = el)}
            carRef={carRef}
            //avatar={localPlayerRef.current.avatar}
            avatar={"Tignari.vrm"}
            cameraControls={cameraControls}
            world={world}
            onPlayerPositionChange={(pos) => {}}
            joystick={joystickRef}
            isLocalPlayer={true} // <-- Differentiator!
            onFire={(startPos, direction) => {
            spawnProjectile(startPos, direction);
          }}
          />
        )}
        {!localPlayerRef.current && (
          <CharacterController
            //key={player.id}
            ref={(el) => (playerRefs.current[socket.id] = el) || crypto.randomUUID()}
            carRef={carRef}
            //avatar={localPlayerRef.current.avatar}
            avatar={"Midnight Sonata.vrm"}
            cameraControls={cameraControls}
            world={world}
            onPlayerPositionChange={(pos) => {}}
            joystick={joystickRef}
            isLocalPlayer={true} // <-- Differentiator!
            onFire={(startPos, direction) => {
            spawnProjectile(startPos, direction);
          }}
        />
        )}
        
      {/*
      <CharacterController
        //key={player.id}
        ref={playerRefs.current[0]}
        avatar={"White.vrm"}
        cameraControls={cameraControls}
        world={world}
        onPlayerPositionChange={(pos) => {}}
        joystick={joystickRef}
      />
      
      <CharacterController
        //key={player.id}
        ref={playerRefs.current[1]}
        avatar={"Ineffa.vrm"}
        cameraControls={cameraControls}
        world={world}
        onPlayerPositionChange={(pos) => {}}
        joystick={joystickRef}
        isLocalPlayer={false} // <-- Differentiator!
      />
      */}
    
      {Object.values(remotePlayers).map((player) => (
        <CharacterController
          ref={(el) => (playerRefs.current[player.id] = el)}
          avatar={player.avatar}
          cameraControls={cameraControls}
          world={world}
          onPlayerPositionChange={(pos) => {}}
          joystick={joystickRef}
          isLocalPlayer={false}
        />
      ))}
      
        {projectiles.map((p) => {
          // Schedule removal if not already scheduled
          if (!p._timeoutScheduled) {
            setTimeout(() => removeProjectile(p.key), 3000); // 3 seconds lifetime
            p._timeoutScheduled = true; // temporary property, safe for this render
          }

          // Compute rotation along direction
          const dir = p.direction.clone().normalize();
          const quaternion = new THREE.Quaternion();
          quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

          return (
            <RigidBody
              key={p.key}
              colliders="cuboid"
              mass={0.1}
              position={p.position.toArray()}
              linearVelocity={p.direction.clone().multiplyScalar(60).toArray()}
              rotation={new THREE.Euler().setFromQuaternion(quaternion)}
            >
              <mesh>
                <cylinderGeometry args={[0.01, 0.01, 0.5, 8]} />
                <meshStandardMaterial color="brown" />
              </mesh>
              <mesh position={[0, 0.25, 0]}>
                <coneGeometry args={[0.03, 0.1, 8]} />
                <meshStandardMaterial color="gray" />
              </mesh>
            </RigidBody>
          );
        })}

          
      

      


        {/* AIControllers */}
{/* <group position={[3, 0, 0]}>
          <AIController ref={(el) => (aiRefs.current[0] = el)} avatar={"Skirk.vrm"} cameraControls={cameraControls} world={world} name="Skirk" />
        </group>
        <group position={[6, 0, 0]}>
          <AIController ref={(el) => (aiRefs.current[1] = el)} avatar={"Skirk.vrm"} cameraControls={cameraControls} world={world} name="Escoffier" />
        </group>
        <group position={[9, 0, 0]}>
          <AIController ref={(el) => (aiRefs.current[2] = el)} avatar={"WhiteTwo.vrm"} cameraControls={cameraControls} world={world} name="Furina" />
        </group>
        <group position={[12, 0, 0]}>
          <AIController ref={(el) => (aiRefs.current[4] = el)} avatar={"7667029464206216702.vrm"} cameraControls={cameraControls} world={world} name="Furina" />
        </group>*/}
        
      </group>
    </>
  );
};