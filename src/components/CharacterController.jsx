import { Billboard, CameraControls, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useRapier,
  CapsuleCollider,
  RigidBody,
  vec3,
} from "@react-three/rapier";
import { VRMAvatar } from "./VRMAvatar";
import * as THREE from "three";
import { screenshotEventEmitter } from "../utils/eventEmitter";
import { isPianoOpen, setPianoStateOpen } from "./UIStates";
import { SoundEmitter } from "./SoundEmitter";
import React, { useEffect, useRef, useState, useImperativeHandle, useMemo } from "react";
import { globalPlayerPosition } from './GlobalPositionStore';
import { useGLTF } from "@react-three/drei";


const MOVEMENT_SPEED = 3; // Base movement speed
const JUMP_FORCE = 5; // Adjust this for jump height

// New: Movement Modifiers
const SPRINT_SPEED_MULTIPLIER = 1.8; // How much faster sprinting is
const CROUCH_SPEED_MULTIPLIER = 0.5; // How much slower crouching is

// Character dimensions for collider
const STAND_CAPSULE_HEIGHT = 1.5; // Total character height when standing (capsule height + radius * 2)
const STAND_CAPSULE_RADIUS = 0.3;
const CROUCH_CAPSULE_HEIGHT = 0.8; // Total character height when crouching
const CROUCH_CAPSULE_RADIUS = 0.3;

const PLAYER_EYE_HEIGHT_STAND = 1.3; // Camera height when standing
const PLAYER_EYE_HEIGHT_CROUCH = 0.8; // Camera height when crouching

// Define fixed step snap parameters here for clarity
const SNAP_STEP_DISTANCE = 0.4; // Raycast distance for step detection
const SNAP_STEP_HEIGHT = 0.4; // How high a step the character can take

// === DEBUG SETTINGS ===
const DEBUG_STEP_RAYS = true; // Set to true to visualize step snap rays
const DEBUG_MOUSE_HOVER = true; // New debug setting for mouse hover

// New Aiming Camera Offsets (Adjust these values)
const AIMING_OFFSET_Z = -0.5; // How far in front of the player
const AIMING_OFFSET_Y = 0.5;  // How high above the ground
const AIMING_DISTANCE = 4.0; // The fixed distance from the player to the camera
const AIMING_POLAR_ANGLE = Math.PI * 0.45; // Slightly above horizontal view
const canvas = document.querySelector("canvas"); // if you only have one canvas

export const CharacterController = React.forwardRef(({
  carRef,
  avatar,
  cameraControls,
  world,
  onPlayerPositionChange,
  joystick,
  cameraSensitivity = 0.0001,
  isLocalPlayer = true,
  onFire,
  ...props
}, ref) => {
  const group = useRef();
  const character = useRef(); // This ref might not be strictly needed unless you're animating directly on it
  const rigidbody = useRef();
  const keys = useRef({});
  const [isMoving, setIsMoving] = useState(false);
  const [isGrounded, setIsGrounded] = useState(true);
  const [isCrouching, setIsCrouching] = useState(false); // New: State for crouching
  const [isSprinting, setIsSprinting] = useState(false);
  const [isBowCharging, setIsBowCharging] = useState(false);
  const [isBowCharged, setIsBowCharged] = useState(false);

  const audioRef = useRef();
  // New State for Aiming
  const [isAiming, setIsAiming] = useState(false); // New state
  const [isJumping, setIsJumping] = useState(false); // New state for jumping

  const [isAI, setAI] = useState(false);
  const [steerDir, setSteer] = useState("stop");

  //const [currentWorldPosition, setCurrentWorldPosition] = useState(new THREE.Vector3());

  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    get rigidbody() {
      return rigidbody;
    },
    get userData() {
      return group.current?.userData;
    }
  }));
  

  // Set userData after mount
  useEffect(() => {
    if (group.current) {
      group.current.userData.name = "Player";
      group.current.userData.isTopLevel = true;
      group.current.userData.id = crypto.randomUUID();

    }
  }, []);

  const firstPersonCamera = useRef(
    new THREE.PerspectiveCamera(
      160,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
  );
  const { gl, scene } = useThree();
  const { rapier } = useRapier();
  //console.log("Camera params", cameraControls);
  // Optimized: Frame counter for throttling step snap checks
  const stepFrameCounter = useRef(0);
  const STEP_UPDATE_INTERVAL = 5; // Check for step snapping every 5 frames

  const allObjects = useRef([]);
  // Get a list of all renderable meshes in the scene
  useEffect(() => {
    // This is a simple way to get all meshes. For a large scene, you might want a more targeted approach.
    scene.traverse((object) => {
      if (object.isMesh && object.visible) {
        allObjects.current.push(object);
      }
    });
  }, [scene]);


  // Handle key presses
  useEffect(() => {

const handleKeyDown = (e) => {
  keys.current[e.key.toLowerCase()] = true;

  if (!isPianoOpen() && e.key.toLowerCase() === "c") {
    setIsCrouching((prev) => !prev);
  }

  if (!isPianoOpen() && e.key.toLowerCase() === "z" && isLocalPlayer) {
    setIsAiming((prev) => {
      const newAiming = !prev;
      setIsBowCharged(false);
      setIsBowCharging(false);
      const canvas = document.querySelector("canvas");
      if (!canvas) return newAiming;

      // Pointer lock
      if (newAiming && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      } else if (!newAiming && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }

      // --- Add or remove crosshair ---
      const existing = document.getElementById("crosshair");
      if (newAiming && !existing) {
        const cross = document.createElement("div");
        cross.id = "crosshair";
        cross.style.position = "absolute";
        cross.style.top = "50%";
        cross.style.left = "50%";
        cross.style.width = "10px";
        cross.style.height = "10px";
        cross.style.marginLeft = "-5px";
        cross.style.marginTop = "-5px";
        cross.style.pointerEvents = "none";
        cross.style.zIndex = "1000";

        const vert = document.createElement("div");
        vert.style.position = "absolute";
        vert.style.backgroundColor = "white";
        vert.style.width = "2px";
        vert.style.height = "10px";
        vert.style.top = "0";
        vert.style.left = "50%";
        vert.style.transform = "translateX(-50%)";

        const horiz = document.createElement("div");
        horiz.style.position = "absolute";
        horiz.style.backgroundColor = "white";
        horiz.style.width = "10px";
        horiz.style.height = "2px";
        horiz.style.top = "50%";
        horiz.style.left = "0";
        horiz.style.transform = "translateY(-50%)";

        cross.appendChild(vert);
        cross.appendChild(horiz);
        document.body.appendChild(cross);
      } else if (!newAiming && existing) {
        existing.remove();
      }

      return newAiming;
    });
  }
};



  const handleKeyUp = (e) => {
    keys.current[e.key.toLowerCase()] = false;
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
  }, []);

  useEffect(() => {
    const listener = new THREE.AudioListener();
    if (cameraControls.current.camera) {
      console.log("CameraControls instance for AI ready:", cameraControls.current);
      // now you can access .camera, .dampingFactor, etc.
      cameraControls.current.camera.add(listener); // attach to camera for 3D audio

    const sound = new THREE.PositionalAudio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load("/videos/hello-483.mp3", (buffer) => {
      sound.setBuffer(buffer);
      sound.setRefDistance(3); // how far the sound travels
      sound.setLoop(true);
      sound.setVolume(1);
      sound.play();
    });


    if (group.current) {
      group.current.add(sound);
      audioRef.current = sound;
    }

    return () => {
      sound.stop();
      cameraControls.current.camera.remove(listener);
    };
    }
  }, [cameraControls]);

const colormapJet = (t) => {
  t = Math.min(Math.max(t, 0), 1);
  const r = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 3.0), 0), 1);
  const g = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 2.0), 0), 1);
  const b = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 1.0), 0), 1);
  return [r * 255, g * 255, b * 255];
};

const takeDepthMap = () => {
  firstPersonCamera.current.fov = 80; // your desired FOV
  firstPersonCamera.current.updateProjectionMatrix();

  const width = 800;
  const height = 600;

  // --- Camera setup ---
  // Assuming THREE, rigidbody, etc., are defined in the scope
  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();
  const baseEye = new THREE.Vector3(
    position.x,
    position.y + (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
    position.z
  );
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
  const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));
  firstPersonCamera.current.position.copy(eye);
  firstPersonCamera.current.lookAt(baseEye.clone().add(direction));
  
  // *** CRITICAL STEP: Update the camera's matrices *before* using them ***
  firstPersonCamera.current.updateMatrixWorld();
  const inverseProjectionMatrix = firstPersonCamera.current.projectionMatrixInverse;
  const inverseViewMatrix = firstPersonCamera.current.matrixWorld;

  // --- Render depth texture (rest of the first half is the same) ---
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  renderTarget.depthTexture = new THREE.DepthTexture();
  renderTarget.depthTexture.type = THREE.UnsignedShortType;

  gl.setRenderTarget(renderTarget);
  gl.render(scene, firstPersonCamera.current);
  gl.setRenderTarget(null);

  // --- Shader to linearize depth --- (Same as before)
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDepth: { value: renderTarget.depthTexture },
      cameraNear: { value: firstPersonCamera.current.near },
      cameraFar: { value: firstPersonCamera.current.far },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      uniform sampler2D tDepth;
      uniform float cameraNear;
      uniform float cameraFar;
      varying vec2 vUv;

      float getLinearDepth(float z_b) {
        float z_n = z_b * 2.0 - 1.0;
        return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
      }

      void main() {
        float depth = texture2D(tDepth, vUv).x;
        float linearDepth = getLinearDepth(depth);
        float normalized = linearDepth / cameraFar;
        gl_FragColor = vec4(vec3(normalized), 1.0);
      }
    `,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
  quadScene.add(quad);

  const depthCanvasTarget = new THREE.WebGLRenderTarget(width, height);
  gl.setRenderTarget(depthCanvasTarget);
  gl.render(quadScene, quadCamera);
  gl.setRenderTarget(null);

  // --- Read pixels from GPU --- (Same as before)
  const pixels = new Uint8Array(width * height * 4);
  gl.readRenderTargetPixels(depthCanvasTarget, 0, 0, width, height, pixels);

  // --- Create final side-by-side canvas ---
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");

  // --- Perspective depth (left) --- (Same as before)
  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const j = ((height - 1 - y) * width + x) * 4; // flip vertically
      const value = pixels[j] / 255; // normalized 0..1
      const [r, g, b] = colormapJet(value);
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
// ----------------------------------------------------------------------
// --- CORRECTED: Top-down XZ map (right) ---
// ----------------------------------------------------------------------
  const tdImageData = ctx.createImageData(width, height);
  
  // Helper objects for geometric unprojection
  const normalizedDepth = new THREE.Vector4();
  const worldPosition = new THREE.Vector4();
  const origin = new THREE.Vector3(firstPersonCamera.current.position.x, firstPersonCamera.current.position.y, firstPersonCamera.current.position.z);
  
  // Define the extent of the XZ map. This is an arbitrary value that defines 
  // how much of the world the right canvas will show.
  const mapExtent = firstPersonCamera.current.far * 0.4; 
  const centerX = width / 2;
  const centerZ = height / 2;
  
  // We need the linear depth data, which is stored in the R channel of 'pixels'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Index into the depth data (flipped vertically)
      const depthDataIdx = ((height - 1 - y) * width + x) * 4; 
      
      const normalizedLinearDepth = pixels[depthDataIdx] / 255.0; // 0..1 normalized linear depth
      const depthValue = normalizedLinearDepth * firstPersonCamera.current.far; // Get the actual distance in world units
      
      // 1. Calculate Normalized Device Coordinates (NDC)
      // NDC range is [-1, 1]
      const x_ndc = (x / width) * 2 - 1;
      const y_ndc = (y / height) * 2 - 1;
      
      // 2. Unproject to View Space
      // The Z coordinate in NDC is based on the Z-buffer's value (depth map).
      // We need a ray direction vector in view space for unprojection.
      // Easiest way is to unproject a point on the far plane.
      
      normalizedDepth.set(x_ndc, y_ndc, 1.0, 1.0);
      normalizedDepth.applyMatrix4(inverseProjectionMatrix);
      
      // ray is a vector pointing from camera to a point on the far plane in view space
      const ray = new THREE.Vector3(normalizedDepth.x, normalizedDepth.y, -1.0).normalize();
      
      // 3. Scale the ray by the linear depth value to get the View Space position
      const viewPosition = ray.clone().multiplyScalar(depthValue);
      
      // 4. Transform to World Space
      worldPosition.set(viewPosition.x, viewPosition.y, viewPosition.z, 1.0);
      worldPosition.applyMatrix4(inverseViewMatrix);

      // 5. Project World XZ onto the canvas
      
      // Calculate world coordinates relative to the camera's XZ position
      const relX = worldPosition.x - origin.x;
      const relZ = worldPosition.z - origin.z;
      
      // Map the relative XZ coordinates (which are in world units) to canvas pixels
      // The mapExtent defines the width/height of the world shown on the canvas.
      const tdX = Math.floor((relX / mapExtent + 0.5) * width);
      // We flip Z/Y here so that points far from the camera appear at the bottom
      const tdZ = Math.floor(height - ((relZ / mapExtent + 0.5) * height)); 

      // Boundary check and coloring
      if (tdX >= 0 && tdX < width && tdZ >= 0 && tdZ < height) {
        const tdIdx = (tdZ * width + tdX) * 4;
        
        // Use the original color-mapped value for the perspective view
        const i_left = (y * width + x) * 4; // Index into the left-side data
        const value = imageData.data[i_left] / 255;
        const [r, g, b] = colormapJet(value);
        
        tdImageData.data[tdIdx] = r;
        tdImageData.data[tdIdx + 1] = g;
        tdImageData.data[tdIdx + 2] = b;
        tdImageData.data[tdIdx + 3] = 255;
      }
    }
  }
  ctx.putImageData(tdImageData, width, 0);


  // --- 3️⃣ Slope segmentation map (first-person) ---
let slopeImage = ctx.createImageData(width, height);

// --- Depth accessor ---
let getDepth = (x, y) => {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  return pixels[((height - 1 - y) * width + x) * 4] / 255;
};

// --- Create depth map array ---
const depthMap = new Float32Array(width * height);

// --- Compute slope and depth ---
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dC = getDepth(x, y);
    const dR = getDepth(x + 1, y);
    const dD = getDepth(x, y + 1);

    // Compute slope in screen space
    let slope = Math.sqrt((dR - dC) ** 2 + (dD - dC) ** 2);
    slope /= Math.max(dC, 0.03); // perspective compensation

    const threshold = 0.2; // floor slope threshold
    slope = slope > threshold ? slope * 50 : 0; // scale for visualization

    const [r, g, b] = colormapJet(slope);
    const i = (y * width + x) * 4;
    slopeImage.data[i] = r * 255;
    slopeImage.data[i + 1] = g * 255;
    slopeImage.data[i + 2] = b * 255;
    slopeImage.data[i + 3] = 255;

    // store depth
    depthMap[y * width + x] = dC;
  }
}
function drawTriangleInImageSmooth(image, width, height, v, p1, p2, color, depthMap, maxNearDistance = 0.1, slopeThreshold = 0.2) {
    const [r0, g0, b0, a0] = color;

    const area = (p1, p2, p3) =>
        (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2;
    const Area = Math.abs(area(p1, p2, v));

    const minX = Math.max(0, Math.floor(Math.min(p1.x, p2.x, v.x)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(p1.x, p2.x, v.x)));
    const minY = Math.max(0, Math.floor(Math.min(p1.y, p2.y, v.y)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(p1.y, p2.y, v.y)));

    // Detection flags
    let leftNear = false, rightNear = false;
    let leftSteep = false, rightSteep = false;

    const middleX = width / 2;

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const P = { x, y };
            const A1 = Math.abs(area(P, p2, v));
            const A2 = Math.abs(area(p1, P, v));
            const A3 = Math.abs(area(p1, p2, P));

            if (Math.abs(Area - (A1 + A2 + A3)) < 0.5) {
                const i = (y * width + x) * 4;

                const slopeR = image.data[i] / 255;
                const depth = depthMap[y * width + x];
                const nearG = depth < maxNearDistance ? 1 - depth / maxNearDistance : 0;

                const R = Math.min(1, slopeR) * 255;
                const G = Math.min(1, nearG) * 255;
                const B = b0;
                const A = a0;

                image.data[i] = R;
                image.data[i + 1] = G;
                image.data[i + 2] = B;
                image.data[i + 3] = A;

                // Detection thresholds
                if (x < middleX) {
                    if (depth < 0.003) leftNear = true;
                    if (slopeR > slopeThreshold) leftSteep = true;
                } else {
                    if (depth < 0.003) rightNear = true;
                    if (slopeR > slopeThreshold) rightSteep = true;
                }
            }
        }
    }

    return { leftNear, rightNear, leftSteep, rightSteep };
}

// --- 🟦 Band analysis (two triangles combined) ---
function analyzeBand(image, width, height, topLeft, topRight, bottomLeft, bottomRight, color, depthMap) {
    const t1 = drawTriangleInImageSmooth(image, width, height, topLeft, topRight, bottomRight, color, depthMap);
    const t2 = drawTriangleInImageSmooth(image, width, height, topLeft, bottomLeft, bottomRight, color, depthMap);

    // Merge both triangles' detections
    const leftNear = t1.leftNear || t2.leftNear;
    const rightNear = t1.rightNear || t2.rightNear;
    const leftSteep = t1.leftSteep || t2.leftSteep;
    const rightSteep = t1.rightSteep || t2.rightSteep;

    // --- 🚗 Steering decision logic ---
    let steer = "forward";

    if ((leftNear || leftSteep) && !(rightNear || rightSteep)) {
        steer = "right";
    } else if ((rightNear || rightSteep) && !(leftNear || leftSteep)) {
        steer = "left";
    } else if ((leftNear || leftSteep) && (rightNear || rightSteep)) {
        // Instead of stopping, choose the direction with more free space
        steer = Math.random() < 0.5 ? "left" : "right";
    }
    else if (!(leftNear || leftSteep) && !(rightNear || rightSteep)) {
        steer = "forward";
    }

    console.log("Steer:", steer, "| Left near:", leftNear, "steep:", leftSteep, "| Right near:", rightNear, "steep:", rightSteep);
    return steer;
}

// --- 🟦 Create and cut the triangle band ---
let vanishing = { x: width / 2, y: height / 2 - 20 };
let p1 = { x: width * 2 / 8, y: height - 1 };
let p2 = { x: (width * 6) / 8, y: height - 1 };

function interpolate(p1, p2, t) {
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

let topFrac = 0.4;
let bottomFrac = 0.7;

let topLeft = interpolate(vanishing, p1, topFrac);
let topRight = interpolate(vanishing, p2, topFrac);
let bottomLeft = interpolate(vanishing, p1, bottomFrac);
let bottomRight = interpolate(vanishing, p2, bottomFrac);

// --- 🔵 Analyze band and decide steering ---
const steer = analyzeBand(slopeImage, width, height, topLeft, topRight, bottomLeft, bottomRight, [0,0,255,180], depthMap);
console.log("Steer:", steer);
setSteer(steer);


// --- 🖼️ Display result ---
ctx.putImageData(slopeImage, 0, height);

// --- 4️⃣ Object-aware slope map ---
slopeImage = ctx.createImageData(width, height);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dC = getDepth(x, y);
    const dR = getDepth(x + 1, y);
    const dD = getDepth(x, y + 1);

    // Compute slope in screen space
    let slope = Math.sqrt((dR - dC) ** 2 + (dD - dC) ** 2);

    // Optional: reduce effect of far-away points (perspective compensation)
    slope /= Math.max(dC, 0.035); // ignore extremely small depths

    // Apply threshold: only mark objects steeper than typical floor
    const threshold = 0.2; // tweak this
    slope = slope > threshold ? slope * 50 : 0; // scale for visualization

    const [r, g, b] = colormapJet(slope);
    const i = (y * width + x) * 4;
    slopeImage.data[i] = r * 255;
    slopeImage.data[i + 1] = g * 255;
    slopeImage.data[i + 2] = b * 255;
    slopeImage.data[i + 3] = 255;
  }
}

ctx.putImageData(slopeImage, width, height);
  
// ----------------------------------------------------------------------
// --- NEW: Normal Map Calculation and Rendering (4th Panel) ---
// ----------------------------------------------------------------------

// *** New Shader for Normal Calculation ***
const normalQuadMaterial = new THREE.ShaderMaterial({
    uniforms: {
        tDepth: { value: renderTarget.depthTexture }, // Depth Texture from first render
        cameraNear: { value: firstPersonCamera.current.near },
        cameraFar: { value: firstPersonCamera.current.far },
        // Use the matrices calculated earlier
        inverseProjectionMatrix: { value: inverseProjectionMatrix }, 
        inverseViewMatrix: { value: inverseViewMatrix } 
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform mat4 inverseProjectionMatrix;
        uniform mat4 inverseViewMatrix;
        varying vec2 vUv;
        
        // Function to convert non-linear Z-buffer value (z_b) to linear view-space depth
        float getLinearDepth(float z_b) {
            float z_n = z_b * 2.0 - 1.0;
            return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
        }

        // Reconstruct World Position from UV and Depth
        vec3 getWorldPosition(float depth, vec2 uv) {
            // 1. Normalized Device Coordinates (NDC)
            vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0); // Z=1.0 for point on far plane
            
            // 2. Unproject to View Space (before division by W)
            vec4 view = inverseProjectionMatrix * ndc;
            view.z = -1.0; // Ensure ray points forward in view space
            view.w = 0.0; // It's a direction vector

            // 3. Normalize the ray
            vec3 ray = normalize(view.xyz);

            // 4. Scale by linear depth to get View Space Position
            vec3 viewPosition = ray * depth;

            // 5. Transform to World Space Position
            vec4 worldPos = inverseViewMatrix * vec4(viewPosition, 1.0);
            return worldPos.xyz;
        }

        void main() {
            vec2 texelSize = 1.0 / vec2(${width}.0, ${height}.0); // Size of one pixel in UV space
            
            // 1. Get Depth for current pixel and its neighbors
            float dC = texture2D(tDepth, vUv).x;
            float dR = texture2D(tDepth, vUv + vec2(texelSize.x, 0.0)).x;
            float dD = texture2D(tDepth, vUv + vec2(0.0, texelSize.y)).x;

            // Handle non-rendered (far/skybox) pixels - use 1.0 (far plane)
            if (dC == 1.0) {
                 gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black for sky/far background
                 return;
            }

            // 2. Convert non-linear depth to linear depth (World Distance)
            float linearDepthC = getLinearDepth(dC);
            float linearDepthR = getLinearDepth(dR);
            float linearDepthD = getLinearDepth(dD);

            // 3. Reconstruct World Positions for current pixel (C) and neighbors (R=Right, D=Down)
            vec3 pC = getWorldPosition(linearDepthC, vUv);
            vec3 pR = getWorldPosition(linearDepthR, vUv + vec2(texelSize.x, 0.0));
            vec3 pD = getWorldPosition(linearDepthD, vUv + vec2(0.0, texelSize.y));
            
            // 4. Calculate Vectors (derivatives)
            vec3 dPdx = pR - pC;
            vec3 dPdy = pD - pC;

            // 5. Calculate Normal (Cross Product of derivatives)
            vec3 normal = normalize(cross(dPdy, dPdx)); // dy x dx for right-handed coordinate system

            // 6. Output Normal (remap [-1, 1] to [0, 1] for RGB output)
            // Normal.xyz maps to gl_FragColor.rgb
            gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); 
        }
    `,
});

const normalQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), normalQuadMaterial);
const normalQuadScene = new THREE.Scene();
normalQuadScene.add(normalQuad);

const normalTarget = new THREE.WebGLRenderTarget(width, height);
gl.setRenderTarget(normalTarget);
gl.render(normalQuadScene, quadCamera); // Reuse quadCamera
gl.setRenderTarget(null);

// --- Read pixels from GPU for Normal Map ---
const normalPixels = new Uint8Array(width * height * 4);
gl.readRenderTargetPixels(normalTarget, 0, 0, width, height, normalPixels);


// --- Create final Normal Map canvas (4th panel: bottom right) ---
const normalImageData = ctx.createImageData(width, height);

// Define the segmentation parameters
const MAX_WALKABLE_SLOPE_DEGREES = 110; // Max angle from horizontal (e.g., 45 degrees)
const MIN_DOT_PRODUCT = Math.cos(MAX_WALKABLE_SLOPE_DEGREES * (Math.PI / 180)); // ~0.707 for 45 deg

// The World Up vector (Y-axis)
const worldUp = new THREE.Vector3(0, 1, 0); 

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const j = ((height - 1 - y) * width + x) * 4; // Flip vertically

        // The normal vector N is stored in normalPixels as [N.x, N.y, N.z] mapped from [-1, 1] to [0, 255]
        
        // 1. Un-normalize the Normal vector components back to [-1, 1] range
        const nx = (normalPixels[j] / 255.0) * 2.0 - 1.0;
        const ny = (normalPixels[j + 1] / 255.0) * 2.0 - 1.0;
        const nz = (normalPixels[j + 2] / 255.0) * 2.0 - 1.0;

        const surfaceNormal = new THREE.Vector3(nx, ny, nz);
        
        // 2. Calculate the dot product (cosine of the angle between Normal and World Up)
        const dotProduct = surfaceNormal.dot(worldUp); 
        // Note: The normal is already normalized in the shader, so the dot product is the cosine of the angle.

        let R, G, B;
        
        // 3. Segment based on walkability threshold
        if (dotProduct >= MIN_DOT_PRODUCT) {
            // **WALKABLE**: The surface is relatively flat (slope <= 45 deg)
            R = 255; 
            G = 0; 
            B = 0; // RED
        } else {
            // **NON-WALKABLE**: The surface is too steep (slope > 45 deg)
            R = 0; 
            G = 255; 
            B = 255; // CYAN (or any non-red color to indicate non-walkable)
        }

        // Apply colors to the ImageData
        normalImageData.data[i] = R; 
        normalImageData.data[i + 1] = G; 
        normalImageData.data[i + 2] = B; 
        normalImageData.data[i + 3] = 255;
    }
}
ctx.putImageData(normalImageData, width, height); // Position: (width, height) - bottom right

  // --- Display in new tab ---
  const dataUrl = canvas.toDataURL("image/png");
  
  const newTab = window.open();
  newTab.document.write(`
    <html>
      <head>
        <style>
          html, body { margin: 0; padding: 0; overflow: hidden; background: black; }
          img { display: block; width: 100vw; height: 100vh; object-fit: contain; }
        </style>
      </head>
      <body><img src="${dataUrl}" /></body>
    </html>
  `);
  newTab.document.close();
  
};

const takeDepthMapFast = () => {
    // --- Configure camera ---
    firstPersonCamera.current.fov = 80;
    firstPersonCamera.current.updateProjectionMatrix();

    const width = 800, height = 600;
    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();

    const baseEye = new THREE.Vector3(
        position.x,
        position.y + (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
        position.z
    );
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));

    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));
    firstPersonCamera.current.updateMatrixWorld();

    // --- Render depth to texture ---
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
    });
    renderTarget.depthTexture = new THREE.DepthTexture();
    renderTarget.depthTexture.type = THREE.UnsignedShortType;

    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    // --- Calculate View and Projection Matrices for Shader Use ---
    const inverseProjectionMatrix = firstPersonCamera.current.projectionMatrix.clone().invert();
    const inverseViewMatrix = firstPersonCamera.current.matrixWorld.clone(); 

    // --- Skip depth map linearization (since we won't use the depth map data) ---
    // The depth map steps are kept ONLY to fulfill previous requirements 
    // and provide the full context, but are unnecessary for the new steering logic.
    
    // --- Read linearized depth data (UNNECESSARY FOR NEW LOGIC, KEPT FOR STRUCTURE) ---
    const pixels = new Uint8Array(width * height * 4);
    // gl.readRenderTargetPixels(depthCanvasTarget, 0, 0, width, height, pixels); 

    // --- Precompute depth map (UNNECESSARY FOR NEW LOGIC, KEPT FOR STRUCTURE) ---
    const depthMap = new Float32Array(width * height);
    // ... depth map population logic skipped ...


    // ----------------------------------------------------------------------
    // **Normal Map Calculation and Reading**
    // ----------------------------------------------------------------------

    // *** New Shader for Normal Calculation ***
    const normalQuadMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tDepth: { value: renderTarget.depthTexture }, // Depth Texture from first render
            cameraNear: { value: firstPersonCamera.current.near },
            cameraFar: { value: firstPersonCamera.current.far },
            inverseProjectionMatrix: { value: inverseProjectionMatrix },
            inverseViewMatrix: { value: inverseViewMatrix }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: `
            uniform sampler2D tDepth;
            uniform float cameraNear;
            uniform float cameraFar;
            uniform mat4 inverseProjectionMatrix;
            uniform mat4 inverseViewMatrix;
            varying vec2 vUv;
            
            float getLinearDepth(float z_b) {
                float z_n = z_b * 2.0 - 1.0;
                return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
            }

            vec3 getWorldPosition(float depth, vec2 uv) {
                vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
                vec4 view = inverseProjectionMatrix * ndc;
                view.z = -1.0;
                view.w = 0.0;
                vec3 ray = normalize(view.xyz);
                vec3 viewPosition = ray * depth;
                vec4 worldPos = inverseViewMatrix * vec4(viewPosition, 1.0);
                return worldPos.xyz;
            }

            void main() {
                vec2 texelSize = 1.0 / vec2(${width}.0, ${height}.0);
                
                float dC = texture2D(tDepth, vUv).x;
                float dR = texture2D(tDepth, vUv + vec2(texelSize.x, 0.0)).x;
                float dD = texture2D(tDepth, vUv + vec2(0.0, texelSize.y)).x;

                // Black out far/unrendered pixels to avoid spurious normals
                if (dC == 1.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                }

                float linearDepthC = getLinearDepth(dC);
                float linearDepthR = getLinearDepth(dR);
                float linearDepthD = getLinearDepth(dD);

                vec3 pC = getWorldPosition(linearDepthC, vUv);
                vec3 pR = getWorldPosition(linearDepthR, vUv + vec2(texelSize.x, 0.0));
                vec3 pD = getWorldPosition(linearDepthD, vUv + vec2(0.0, texelSize.y));
                
                vec3 dPdx = pR - pC;
                vec3 dPdy = pD - pC;

                vec3 normal = normalize(cross(dPdy, dPdx)); 

                // Outputs normal normalized to [0, 1]: R=X, G=Y, B=Z
                gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); 
            }
        `,
    });
    const quadScene = new THREE.Scene();
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const normalQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), normalQuadMaterial);
    const normalQuadScene = new THREE.Scene();
    normalQuadScene.add(normalQuad);

    const normalTarget = new THREE.WebGLRenderTarget(width, height);
    gl.setRenderTarget(normalTarget);
    gl.render(normalQuadScene, quadCamera); // Reuse quadCamera
    gl.setRenderTarget(null);

    // --- Read pixels from GPU for Normal Map ---
    const normalPixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(normalTarget, 0, 0, width, height, normalPixels);

    // ----------------------------------------------------------------------
    // **MODIFIED: Obstacle Check Logic (Red Channel Only)**
    // ----------------------------------------------------------------------

    // Threshold for "strong red component" (Normal X-component is very high/positive)
    const RED_CHANNEL_OBSTACLE_THRESHOLD = 0.9; 

    /**
     * Checks if a pixel at (x, y) contains a "red thing" (strong R-channel component) 
     * in the normal map.
     * @param {number} x - The x-coordinate of the pixel.
     * @param {number} y - The y-coordinate of the pixel.
     * @returns {boolean} True if the red channel is above the threshold (obstacle detected), false otherwise.
     */
    const getObstacle = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;

        // The normal map data is stored flipped vertically on the GPU read
        const j = ((height - 1 - y) * width + x) * 4;

        // Get the Red (R) component of the normal map pixel (R=X component of Normal)
        const nx_normalized = normalPixels[j] / 255.0;

        // An X normal of 1.0 (fully red) means the surface faces directly right in world space.
        return nx_normalized > RED_CHANNEL_OBSTACLE_THRESHOLD;
    };

    // ----------------------------------------------------------------------
    // **MODIFIED: Triangle drawing + detection (Normal Map ONLY)**
    // ----------------------------------------------------------------------

    // NOTE: Removed 'depthMap' from arguments as it's no longer used for checks.
    function drawTriangleInImageSmooth(width, height, v, p1, p2) { 
        const area = (p1, p2, p3) =>
            (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2;
        const Area = Math.abs(area(p1, p2, v));

        const minX = Math.max(0, Math.floor(Math.min(p1.x, p2.x, v.x)));
        const maxX = Math.min(width - 1, Math.ceil(Math.max(p1.x, p2.x, v.x)));
        const minY = Math.max(0, Math.floor(Math.min(p1.y, p2.y, v.y)));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(p1.y, p2.y, v.y)));

        let leftObstacle = false, rightObstacle = false;
        const middleX = width / 2;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const P = { x, y };
                const A1 = Math.abs(area(P, p2, v));
                const A2 = Math.abs(area(p1, P, v));
                const A3 = Math.abs(area(p1, p2, P));

                // Check if the pixel is inside the triangle
                if (Math.abs(Area - (A1 + A2 + A3)) < 0.5) {
                    
                    const isObstacle = getObstacle(x, y);

                    if (x < middleX) {
                        if (isObstacle) leftObstacle = true;
                    } else {
                        if (isObstacle) rightObstacle = true;
                    }
                }
            }
        }

        // Return the obstacle flags using the existing variable names (leftSteep/rightSteep)
        // for compatibility with the analyzeBand logic, and remove 'Near' checks entirely.
        return { leftSteep: leftObstacle, rightSteep: rightObstacle };
    }

    // NOTE: Removed 'depthMap' from arguments as it's no longer used.
    function analyzeBand(width, height, topLeft, topRight, bottomLeft, bottomRight) { 

        const t1 = drawTriangleInImageSmooth(width, height, topLeft, topRight, bottomRight);
        const t2 = drawTriangleInImageSmooth(width, height, topLeft, bottomLeft, bottomRight);

        // Logic now relies ONLY on the 'Steep' flags (which are the 'Red Thing' obstacle flags)
        const leftObstacle = t1.leftSteep || t2.leftSteep;
        const rightObstacle = t1.rightSteep || t2.rightSteep;

        // Steering logic:
        if (!leftObstacle && rightObstacle) return "right"; // Default turn right when blocked both sides
        if (leftObstacle && !rightObstacle) return "right"; // Default turn right when blocked both sides
        if (leftObstacle && rightObstacle) return "right"; // Default turn right when blocked both sides

        return "forward";
    }

    // --- Define band points ---
    // --- 🟦 Create and cut the triangle band ---
    let vanishing = { x: width / 2, y: height / 2 - 20 };
    let p1 = { x: width * 1 / 8, y: height - 1 };
    let p2 = { x: (width * 7) / 8, y: height - 1 };

    const interpolate = (p1, p2, t) => ({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
    });

    let topFrac = 0.4;
    let bottomFrac = 0.7;

    let topLeft = interpolate(vanishing, p1, topFrac);
    let topRight = interpolate(vanishing, p2, topFrac);
    let bottomLeft = interpolate(vanishing, p1, bottomFrac);
    let bottomRight = interpolate(vanishing, p2, bottomFrac);


    // Calling analyzeBand without depthMap
    const steer = analyzeBand(width, height, topLeft, topRight, bottomLeft, bottomRight);
    console.log("Steer:", steer);
    setSteer(steer);

    return steer;
};

  // Screenshot functions (unchanged from your original code)
  const takeFirstPersonScreenshot = () => {
    if (!rigidbody.current) return;
    // Update FOV before rendering
    firstPersonCamera.current.fov = 80; // your desired FOV
    firstPersonCamera.current.updateProjectionMatrix();

    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();

    const baseEye = new THREE.Vector3(
      position.x,
      position.y +
        (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
      position.z
    );
    const direction = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(rotation)
      .normalize();
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));

    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    const renderTarget = new THREE.WebGLRenderTarget(800, 600);
    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(800, 600);

    const brightnessFactor = 1.2;
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 800; x++) {
        const i = (y * 800 + x) * 4;
        const j = ((599 - y) * 800 + x) * 4;
        let r = pixels[j];
        let g = pixels[j + 1];
        let b = pixels[j + 2];
        r = Math.min(255, r * brightnessFactor);
        g = Math.min(255, g * brightnessFactor);
        b = Math.min(255, b * brightnessFactor);
        imageData.data[i] = r;
        imageData.data[i + 1] = g;
        imageData.data[i + 2] = b;
        imageData.data[i + 3] = pixels[j + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const newTab = window.open();
    newTab.document.write(`
        <html>
            <head>
                <style>
                    html, body { margin: 0; padding: 0; overflow: hidden; background: black; }
                    img { display: block; width: 100vw; height: 100vh; object-fit: contain; }
                </style>
            </head>
            <body>
                <img src="${dataUrl}" />
            </body>
        </html>
        `);
    newTab.document.close();
  };

  // --- Preallocated objects for performance ---
const renderTarget = new THREE.WebGLRenderTarget(800, 600);
const pixels = new Uint8Array(800 * 600 * 4);
const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const imageData = ctx.createImageData(800, 600);
const brightnessFactor = 1.2;

let lastSent = 0; // optional FPS limiter

const takeFirstPersonScreenshotFast = () => {
  if (!rigidbody.current) return;

  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();

  const baseEye = new THREE.Vector3(
    position.x,
    position.y +
      (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
    position.z
  );
  const direction = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(rotation)
    .normalize();
  const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));

  firstPersonCamera.current.position.copy(eye);
  firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

  gl.setRenderTarget(renderTarget);
  gl.render(scene, firstPersonCamera.current);
  gl.setRenderTarget(null);

  gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

  const data = imageData.data;
  let i = 0;
  for (let y = 0; y < 600; y++) {
    const row = (599 - y) * 800 * 4;
    for (let x = 0; x < 800; x++, i += 4) {
      const j = row + x * 4;
      data[i] = Math.min(255, pixels[j] * brightnessFactor);
      data[i + 1] = Math.min(255, pixels[j + 1] * brightnessFactor);
      data[i + 2] = Math.min(255, pixels[j + 2] * brightnessFactor);
      data[i + 3] = pixels[j + 3];
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Optional: Limit send rate to 30 FPS
  const now = performance.now();
  if (now - lastSent < 33) return;
  lastSent = now;

  // --- Convert to blob and send directly to Flask ---
  canvas.toBlob((blob) => {
    if (!blob) return;
    const formData = new FormData();
    formData.append("frame", blob, "frame.jpg");

    fetch("http://localhost:5000/upload_frame", {
      method: "POST",
      body: formData,
      keepalive: true, // ✅ allows sending even if frame drops
    }).catch(() => {});
  }, "image/jpeg", 0.6);
};

  const takeFirstPersonScreenshotEvent = () => {
    if (!rigidbody.current) return;

    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();

    const baseEye = new THREE.Vector3(
      position.x,
      position.y +
        (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
      position.z
    );
    const direction = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(rotation)
      .normalize();
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.01));

    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    const renderTarget = new THREE.WebGLRenderTarget(800, 600);
    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(800, 600);

    const brightnessFactor = 1.2;
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 800; x++) {
        const i = (y * 800 + x) * 4;
        const j = ((599 - y) * 800 + x) * 4;
        let r = pixels[j];
        let g = pixels[j + 1];
        let b = pixels[j + 2];
        r = Math.min(255, r * brightnessFactor);
        g = Math.min(255, g * brightnessFactor);
        b = Math.min(255, b * brightnessFactor);
        imageData.data[i] = r;
        imageData.data[i + 1] = g;
        imageData.data[i + 2] = b;
        imageData.data[i + 3] = pixels[j + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    screenshotEventEmitter.dispatchEvent(
      new CustomEvent("screenshotTaken", { detail: { imageData: dataUrl } })
    );
  };

  // Effect to listen for the screenshot request event
  useEffect(() => {
    const handleRequestScreenshot = () => {
      console.log("Screenshot request received. Taking screenshot...");
      takeFirstPersonScreenshotEvent();
    };

    screenshotEventEmitter.addEventListener(
      "requestScreenshot",
      handleRequestScreenshot
    );

    return () => {
      screenshotEventEmitter.removeEventListener(
        "requestScreenshot",
        handleRequestScreenshot
      );
    };
  }, [rigidbody, firstPersonCamera, gl, scene, isCrouching]); // Added isCrouching to dependencies

  // Check if the character is grounded

// New: Grounding Raycast Parameters
const GROUND_CHECK_RAY_LENGTH = 0.75; // How far down to check for ground
const GROUND_CHECK_OFFSET = -0.15; // Offset from the character's base

// Check if the character is grounded
const checkGrounded = (moveVec) => {
  if (!rigidbody.current) return;

  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();
  const radius = isCrouching ? CROUCH_CAPSULE_RADIUS : STAND_CAPSULE_RADIUS;

  // 1. Define the Ray Origin
  // Cast from the very bottom of the capsule collider + a tiny offset
  const rayOrigin = new rapier.Vector3(
    position.x + 0.5,
    position.y + 0.04,
    position.z + 0.5
  );
  
  
  // 2. Define the Ray Direction (Straight down)
  const rayDirection = new rapier.Vector3(0, -1, 0);

  // 3. Create the Rapier Ray
  const ray = new rapier.Ray(rayOrigin, rayDirection);

  // 4. Cast the Ray
  // The 'true' argument means we exclude the collider of the character itself from the hit results.
  const hit = world.castRay(ray, GROUND_CHECK_RAY_LENGTH, true);

  // 5. Determine Grounded Status
  // If the ray hits something within the defined length, the character is grounded.
  const isCurrentlyGrounded = !!hit && hit.collider.parent()?.handle !== rigidbody.current.handle;
  setIsGrounded(isCurrentlyGrounded);

  // Optional: Debug drawing for the grounded ray
  if (DEBUG_STEP_RAYS) { // Reusing your existing debug flag
      const start = new THREE.Vector3().copy(rayOrigin);
      const end = new THREE.Vector3(
        rayOrigin.x,
        rayOrigin.y - GROUND_CHECK_RAY_LENGTH,
        rayOrigin.z
      );
      const geometry = new THREE.BufferGeometry().setFromPoints([
          start,
          end,
      ]);
      const material = new THREE.LineBasicMaterial({ color: isCurrentlyGrounded ? 0x00ff00 : 0xff0000 });
      const debugLine = new THREE.Line(geometry, material);
      scene.add(debugLine);
      setTimeout(() => scene.remove(debugLine), 100);
  }

  //console.log("isGrounded:", isCurrentlyGrounded);

};

  // --- Raycast references (minor optimization, avoiding re-creation) ---
  // Initialize with actual Rapier.Vector3 objects
  // --- Raycast references (minor optimization, avoiding re-creation) ---
  // Initialize with actual Rapier.Vector3 objects
  const forwardRayOrigin = useRef(new rapier.Vector3(0, 0, 0));
  const forwardRayDir = useRef(new rapier.Vector3(0, 0, 0));
  const upperRayOrigin = useRef(new rapier.Vector3(0, 0, 0));
  const downwardRayDir = useRef(new rapier.Vector3(0, -1, 0)); // Fixed downward direction
  // Handle movement, jumping, and rotation each frame
  
  // --- Keep track of yaw/pitch ---
const yaw = useRef(0);   // horizontal rotation
const pitch = useRef(0); // vertical rotation

// --- Mouse move listener ---
const onMouseMove = (event) => {
  if (!isAiming) return;

  const sensitivity = 0.0001; // adjust to taste
  yaw.current   -= event.movementX * sensitivity;
  pitch.current -= event.movementY * sensitivity;

  // Clamp pitch to avoid flipping
  const maxPitch = Math.PI / 2 - 0.1;
  const minPitch = -Math.PI / 2 + 0.1;
  pitch.current = Math.max(minPitch, Math.min(maxPitch, pitch.current));
};

window.addEventListener("mousemove", onMouseMove);
  let cameraForward = new THREE.Vector3();
// At the top of your component

  useFrame(() => {
    if (!cameraControls?.current || !rigidbody.current) return;
    

    const camera = cameraControls.current.camera;
    let direction = new THREE.Vector3();
    if (!isAiming){
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
    }
    
    
    // Determine current speed based on sprinting and crouching
    let currentSpeed = MOVEMENT_SPEED;
    const isSprintingKeyboard = keys.current["shift"];
    const isSprintingJoystick = joystick?.current && joystick.current.y < -0.8; // Example: Push joystick far forward to sprint
    const isCurrentlySprinting = isSprintingKeyboard || isSprintingJoystick && !isCrouching;

    setIsSprinting(isCurrentlySprinting); // Update sprint state

    if (isCurrentlySprinting) {
      currentSpeed *= SPRINT_SPEED_MULTIPLIER;
    }
    if (isCrouching) {
      currentSpeed *= CROUCH_SPEED_MULTIPLIER;
    }
    if (rigidbody.current && carRef){
      //rigidbody.current.setTranslation({x: carRef.current.translation().x, y: carRef.current.translation().y + 1, z: carRef.current.translation().z}, true);
    }
    // Movement vector accumulator
    const moveVec = new THREE.Vector3();
    
    
    // Get the current velocity, so we can preserve the Y component
    const velocity = rigidbody.current.linvel();

    // --- JOYSTICK INPUT ---
    // It's possible for joystick.current to be null/undefined for a few frames
    if (joystick && joystick.current && isLocalPlayer) {

      // Toggle crouch via joystick button if available
      if (
        joystick.current.crouchButton &&
        !joystick.current.crouchButtonHandled
      ) {
        // Assuming a flag to prevent multiple toggles on one press
        setIsCrouching((prev) => !prev);
        joystick.current.crouchButtonHandled = true; // Set flag to true after handling
      } else if (!joystick.current.crouchButton) {
        joystick.current.crouchButtonHandled = false; // Reset flag when button is released
      }

      if (joystick.current.x !== 0 || joystick.current.y !== 0) {
        // If joystick is active, prioritize its input for movement direction
        moveVec.set(0, 0, 0); // Clear keyboard input if joystick is moving
        const forwardJoystick = direction
          .clone()
          .multiplyScalar(-joystick.current.y);
        const rightJoystick = new THREE.Vector3(-direction.z, 0, direction.x)
          .normalize()
          .multiplyScalar(joystick.current.x);
        moveVec.add(forwardJoystick).add(rightJoystick);
      }

      // Conceptual: Apply joystick right stick for camera rotation
      // This assumes your joystick provides 'lookX' and 'lookY' values from a right stick
      // You would need to pass these from your joystick component.
      /*
          if (joystick.current.lookX !== 0) {
              cameraControls.current.azimuthAngle -= joystick.current.lookX * cameraSensitivity;
          }
          if (joystick.current.lookY !== 0) {
              cameraControls.current.polarAngle += joystick.current.lookY * cameraSensitivity;
              // Clamp polar angle to prevent camera going upside down
              cameraControls.current.polarAngle = Math.max(0.1, Math.min(Math.PI - 0.1, cameraControls.current.polarAngle));
          }
          */
    }
    

    
    // --- JUMPING ---
    // You might want to prevent jumping while crouching or adjust jump force
    if (!isPianoOpen()){
      
        if (keys.current[" "] && isGrounded && !isCrouching) {
          // Start jump
          setIsJumping(true); // start jump animation/state

          // Reset jumping state after a short delay (e.g., 3 seconds)
          setTimeout(() => {
            setIsJumping(false);

            // Apply jump velocity immediately
            rigidbody.current.setLinvel(
              {
                x: velocity.x,
                y: JUMP_FORCE,
                z: velocity.z,
              },
              true
            );
          }, 200);
        }
    }
    //console.log("isJump:", joystick.current.isJump);

    if (joystick.current.isJump) {
      if (isGrounded) {
        // Start jump
        setIsJumping(true); // start jump animation/state

        // Reset jumping state after a short delay (e.g., 3 seconds)
        setTimeout(() => {
          setIsJumping(false);

          // Apply jump velocity immediately
          rigidbody.current.setLinvel(
            {
              x: velocity.x,
              y: JUMP_FORCE,
              z: velocity.z,
            },
            true
          );
        }, 200);
      }
    }
    // Get the current world position of the rigidbody
    const currentWorldPosition = rigidbody.current.translation();
    //setCurrentWorldPosition(rigidbody.current.translation());
    if (isLocalPlayer) {
      // Update the global player position
      globalPlayerPosition.set(currentWorldPosition.x, currentWorldPosition.y, currentWorldPosition.z);
    }

    // --- CAMERA FOLLOW ---
    if (isLocalPlayer) {
    const position = rigidbody.current.translation();
    const offset = new THREE.Vector3();
    camera.getWorldPosition(offset);
    offset.sub(cameraControls.current._target);

    // Adjust camera target based on crouching state
    const targetY =
      position.y +
      (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND);

    // Set the camera target at player position
    cameraControls.current._target.set(position.x, targetY, position.z);

      //console.log("offset", offset);

      // If the player is aiming, lock the camera behind them
// --- In your aiming camera update ---

if (isAiming) {
  // Compute direction from yaw/pitch
  cameraForward = new THREE.Vector3(
    Math.sin(yaw.current) * Math.cos(pitch.current),
    Math.sin(pitch.current),
    Math.cos(yaw.current) * Math.cos(pitch.current)
  ).normalize();

  direction = cameraForward;

  // Right vector
  const cameraRight = new THREE.Vector3();
  cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();

  // Distance offsets
  const backwardDistance = offset.length();
  const rightOffset = 0.25;
  const heightOffset = 1;

  // Camera position relative to player
  const cameraPos = new THREE.Vector3()
    .copy(position)
    .addScaledVector(cameraForward, -backwardDistance)
    .addScaledVector(cameraRight, rightOffset);
  cameraPos.y += heightOffset;

  camera.position.copy(cameraPos);

  // Optional: make camera look at player head
  const lookAtPos = new THREE.Vector3().copy(position);
  lookAtPos.addScaledVector(cameraRight, rightOffset);

  lookAtPos.y += heightOffset;

  camera.lookAt(lookAtPos);

  // Rotate player horizontally
  const horizontalForward = cameraForward.clone();
  horizontalForward.y = 0;
  horizontalForward.normalize();
  const angle = Math.atan2(horizontalForward.x, horizontalForward.z);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
  rigidbody.current.setRotation(q, true);
}

else {
  // Normal third-person follow mode
  camera.position.copy(cameraControls.current._target).add(offset);
}


    if (!isPianoOpen() && isLocalPlayer){
      if(!isAI){
        // --- KEYBOARD INPUT ---
        if (keys.current["w"]) {
          moveVec.add(direction);
        }
        if (keys.current["s"]) {
          moveVec.sub(direction);
        }
        if (keys.current["a"]) {
          const left = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
          moveVec.add(left);
        }
        if (keys.current["d"]) {
          const right = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
          moveVec.add(right);
        }
      }
      else {
        // --- AI INPUT ---
        if (steerDir === "left") {
          moveVec.add(direction);
          const left = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
          moveVec.add(left);
        }
        if (steerDir === "right") {
          moveVec.add(direction);
          const right = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
          moveVec.add(right);
        }
        if (steerDir === "forward") {
          moveVec.add(direction);
        }
        if (steerDir === "backward") {
          moveVec.sub(direction);
        }
      }
    }
    // --- Determine if Character is Moving ---
    const currentIsMoving = moveVec.lengthSq() > 0.01;
    setIsMoving(currentIsMoving);
    
    
    stepFrameCounter.current++; // Increment counter every frame
    checkGrounded(moveVec);

    if (stepFrameCounter.current % 2 === 0) {
      //takeFirstPersonScreenshotFast();
      if (isAI){
        takeDepthMapFast();
      }

    }
    if (currentIsMoving) {
      // 🔄 Rotate the character toward movement direction
      const angle = Math.atan2(moveVec.x, moveVec.z);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, angle, 0)
      );
      rigidbody.current.setRotation(q, true);

      // === OPTIMIZED STEP SNAP LOGIC ===
      
      if (stepFrameCounter.current % STEP_UPDATE_INTERVAL === 0) {
        const pos = rigidbody.current.translation();
        const forwardOffset = 0.5; // How far ahead to raycast for steps

        // Update ray origin and direction for the forward ray
        // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
        forwardRayOrigin.current = new rapier.Vector3(
          pos.x + moveVec.x * forwardOffset,
          pos.y + 0.04, // Slightly above ground
          pos.z + moveVec.z * forwardOffset
        );
        // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
        forwardRayDir.current = new rapier.Vector3(moveVec.x, 0, moveVec.z); // Normalized movement direction
        const forwardRay = new rapier.Ray(
          forwardRayOrigin.current,
          forwardRayDir.current
        );

        // Optional: Debug draw forward ray
        if (DEBUG_STEP_RAYS) {
          const start = new THREE.Vector3(
            forwardRayOrigin.current.x,
            forwardRayOrigin.current.y,
            forwardRayOrigin.current.z
          );
          const end = new THREE.Vector3(
            forwardRayOrigin.current.x +
              forwardRayDir.current.x * SNAP_STEP_DISTANCE,
            forwardRayOrigin.current.y +
              forwardRayDir.current.y * SNAP_STEP_DISTANCE,
            forwardRayOrigin.current.z +
              forwardRayDir.current.z * SNAP_STEP_DISTANCE
          );
          const geometry = new THREE.BufferGeometry().setFromPoints([
            start,
            end,
          ]);
          const material = new THREE.LineBasicMaterial({ color: 0xff00ff });
          const debugLine = new THREE.Line(geometry, material);
          scene.add(debugLine);
          setTimeout(() => scene.remove(debugLine), 100);
        }

        const hit = world.castRay(forwardRay, SNAP_STEP_DISTANCE, true);

        if (hit && hit.timeOfImpact < SNAP_STEP_DISTANCE) {
          const stepPoint = forwardRay.pointAt(hit.timeOfImpact);
          //console.log("Stepping Up");
          // Update ray origin for the upper ray
          // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
          upperRayOrigin.current = new rapier.Vector3(
            stepPoint.x,
            stepPoint.y + SNAP_STEP_HEIGHT,
            stepPoint.z
          );
          const upperRay = new rapier.Ray(
            upperRayOrigin.current,
            downwardRayDir.current
          ); // Raycast downwards from above step

          // Optional: Debug draw upper ray
          if (DEBUG_STEP_RAYS) {
            const upStart = new THREE.Vector3(
              upperRayOrigin.current.x,
              upperRayOrigin.current.y,
              upperRayOrigin.current.z
            );
            const upEnd = new THREE.Vector3(
              upperRayOrigin.current.x +
                downwardRayDir.current.x * SNAP_STEP_HEIGHT,
              upperRayOrigin.current.y +
                downwardRayDir.current.y * SNAP_STEP_HEIGHT,
              upperRayOrigin.current.z +
                downwardRayDir.current.z * SNAP_STEP_HEIGHT
            );
            const upGeom = new THREE.BufferGeometry().setFromPoints([
              upStart,
              upEnd,
            ]);
            const upLine = new THREE.Line(
              upGeom,
              new THREE.LineBasicMaterial({ color: 0x00ffff })
            );
            scene.add(upLine);
            setTimeout(() => scene.remove(upLine), 100);
          }

          const upperHit = world.castRay(upperRay, SNAP_STEP_HEIGHT, true); // Cast downwards
          
          // If no obstacle directly above the step, or it's low enough to step over
          if (!upperHit) {
            const pos = rigidbody.current.translation();
            // No collision directly above the step height
            // ✅ Snap up to the step point's Y plus a tiny buffer
            rigidbody.current.setTranslation(
              {
                x: pos.x, // Keep XZ movement continuous through physics
                y: stepPoint.y + 0.05, // Snap to step height + buffer
                z: pos.z,
              },
              true
            );
            console.log("Stepping Up");
          }
        }
      }

      // Instead of applying impulse, set the linear velocity directly.
      // This provides more stable movement that doesn't fight gravity.
      rigidbody.current.setLinvel(
        {
          x: moveVec.x * currentSpeed,
          y: velocity.y, // Preserve the current vertical velocity
          z: moveVec.z * currentSpeed,
        },
        true
      );

    } else {
      // If not moving, set horizontal velocity to zero, but keep vertical velocity.
      rigidbody.current.setLinvel(
        {
          x: 0,
          y: velocity.y,
          z: 0,
        },
        true
      );
    }

  }
    // Screenshot logic - only runs once per 'p' press
    if (!isPianoOpen()){
      if (keys.current["p"]) {
      takeFirstPersonScreenshot();
      keys.current["p"] = false;
    }
    if (keys.current["l"]){
      takeDepthMap();
      keys.current["l"] = false;
    }
    if (keys.current["j"]){
      takeDepthMap();
      //takeFirstPersonScreenshotFast();
      keys.current["j"] = false;
    }
    if (keys.current["k"]){
      setAI(!isAI);
      keys.current["k"] = false;
    }

    }
  });
  

  

  // Determine collider height and offset based on crouching state
  const capsuleHeight = isCrouching
    ? CROUCH_CAPSULE_HEIGHT
    : STAND_CAPSULE_HEIGHT;
  const capsuleRadius = isCrouching
    ? CROUCH_CAPSULE_RADIUS
    : STAND_CAPSULE_RADIUS;
  // Position the capsule so its base is at y=0, and its center is at half its height
  const capsuleOffset = capsuleHeight / 2 + capsuleRadius;

  // Adjust position when changing from stand to crouch and vice-versa
  useEffect(() => {
    if (!rigidbody.current) return;
    const currentTranslation = rigidbody.current.translation();
    // Calculate new Y position to smoothly transition collider
    const newY = isCrouching
      ? currentTranslation.y -
        (STAND_CAPSULE_HEIGHT - CROUCH_CAPSULE_HEIGHT) / 2
      : currentTranslation.y +
        (STAND_CAPSULE_HEIGHT - CROUCH_CAPSULE_HEIGHT) / 2;

    rigidbody.current.setTranslation(
      { x: currentTranslation.x, y: newY, z: currentTranslation.z },
      true
    );
  }, [isCrouching]); // Re-run effect when isCrouching changes


  const mouseDownTime = useRef(null);

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (!isLocalPlayer || !isAiming) return;
      if (e.button !== 0) return; // left click only
      mouseDownTime.current = Date.now(); // record when button was pressed

      setIsBowCharging(true); // start charging
      
      setTimeout(() => {
        setIsBowCharging(false); // charging animation done / initial flag off
        if(!isBowCharged)setIsBowCharged(true);     // now considered fully charged
      }, 600); // 0.5 seconds delay
    };

    const handleMouseUp = (e) => {
      setIsBowCharging(false);
      setIsBowCharged(false);
      if (!isLocalPlayer || !isAiming) return;
      if (e.button !== 0) return; // left click only
      
      if (!mouseDownTime.current) return;
      const heldDuration = Date.now() - mouseDownTime.current;
      console.log(heldDuration);
      if (heldDuration >= 800) {
        console.log("Firing");
        // --- Compute forward vector from yaw/pitch (for aiming) ---
        const cameraForward = new THREE.Vector3(
          Math.sin(yaw.current) * Math.cos(pitch.current),
          Math.sin(pitch.current),
          Math.cos(yaw.current) * Math.cos(pitch.current)
        ).normalize();
        setIsBowCharging(false);
        setIsBowCharged(false);
        
        // --- Right vector (perpendicular to forward and up) ---
        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();

        // --- Projectile direction ---
        const projectileDirection = cameraForward.clone();

        // --- Spawn position: beside the player ---
        const projectileStart = new THREE.Vector3()
          .copy(rigidbody.current.translation())
          .addScaledVector(cameraRight, 0.25)
          .add(new THREE.Vector3(0, -50 + 1, 0)); // height offset

        // --- Fire projectile ---
        if (onFire) onFire(projectileStart, projectileDirection);
      }

      mouseDownTime.current = null; // reset
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isLocalPlayer, isAiming, rigidbody]);

    // 2. Load the second GLB (the prop) and rename the destructured variable to avoid conflict
  return (
    <RigidBody
      ref={rigidbody}
      colliders={false}
      type="dynamic"
      friction={0.2}
      linearDamping={0.1}
      angularDamping={0.1}
      lockRotations
      {...props}
    >
      <group ref={group}>
        {/* Pass isSprinting and isCrouching to VRMAvatar for animation */}
        <VRMAvatar
          avatar={avatar}
          isMoving={isMoving}
          isSprinting={isSprinting}
          isCrouching={isCrouching}
          isAiming={isAiming}
          isGrounded={isGrounded}
          isJumping={isJumping}
          isBowCharging={isBowCharging}
          isBowCharged={isBowCharged}
          rigidbody={rigidbody}
        />
      </group>
      

      {isAI && (
          <Billboard position={[0, 2, 0]} follow>
            <Text
              fontSize={0.1}
              color="white"
              anchorX="center"
              anchorY="bottom"
              outlineColor="black"
              outlineWidth={0.03}
            >
              {`AI Mode: ${steerDir}`}
            </Text>
          </Billboard>
      )}

      {/* Collider dimensions should match VRMAvatar scale and adjust with crouching */}
      <CapsuleCollider args={[0.75, 0.3]} position={[0, 0.75, 0]} />
    </RigidBody>
  );
});