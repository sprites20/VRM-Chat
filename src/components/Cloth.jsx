import React, { useMemo, useRef, useEffect } from "react";
import { RigidBody, useImpulseJoint } from "@react-three/rapier";
import * as THREE from "three";

function JointBetween({ bodyA, bodyB, anchors, enabled }) {
  if (!enabled || !bodyA?.current || !bodyB?.current) return null;

  useImpulseJoint(bodyA.current, bodyB.current, [
    "spring",
    {
      anchors,
      stiffness: 50,     // Higher = less stretch
      damping: 1,        // Controls spring oscillation
    },
  ]);

  return null;
}

export function Cloth({ width = 10, height = 10, spacing = 0.2, position = [0, 0, 0] }) {
  const origin = useMemo(() => new THREE.Vector3(...position), [position]);

  const nodes = useMemo(() => {
    const arr = [];
    for (let y = 0; y < height; y++) {
      arr.push([]);
      for (let x = 0; x < width; x++) {
        arr[y].push(React.createRef());
      }
    }
    return arr;
  }, [width, height]);

  // Track how many balls are spawned
  const ballCountRef = useRef(0);

  useEffect(() => {
    console.log("Total balls spawned:", ballCountRef.current);
  }, []);

  return (
    <>
      {/* Create grid of RigidBodies (cloth points) */}
      {nodes.map((row, y) =>
        row.map((ref, x) => {
          const isTopEdge = y === height - 1;
          ballCountRef.current += 1;
          console.log(`Spawning ball at (${x}, ${y})`);

          return (
            <RigidBody
              key={`node-${x}-${y}`}
              ref={ref}
              type={isTopEdge ? "fixed" : "dynamic"}
              colliders="ball"
              position={[
                origin.x + x * spacing,
                origin.y + y * spacing,
                origin.z,
              ]}
              linearDamping={0.5}
              angularDamping={0.7}
              mass={0.1}
            >
              <mesh>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="skyblue" />
              </mesh>
            </RigidBody>
          );
        })
      )}

      {/* Create joints between neighbors (horizontal, vertical, and diagonal) */}
      {nodes.map((row, y) =>
        row.map((ref, x) => {
          const joints = [];

          // Horizontal to the right
          if (x < width - 1) {
            joints.push(
              <JointBetween
                key={`joint-h-${x}-${y}`}
                bodyA={ref}
                bodyB={nodes[y][x + 1]}
                anchors={[
                  [spacing / 2, 0, 0],
                  [-spacing / 2, 0, 0],
                ]}
              />
            );
          }

          // Vertical downward
          if (y < height - 1) {
            joints.push(
              <JointBetween
                key={`joint-v-${x}-${y}`}
                bodyA={ref}
                bodyB={nodes[y + 1][x]}
                anchors={[
                  [0, -spacing / 2, 0],
                  [0, spacing / 2, 0],
                ]}
              />
            );
          }

          // Diagonal (down-right)
          if (x < width - 1 && y < height - 1) {
            joints.push(
              <JointBetween
                key={`joint-dr-${x}-${y}`}
                bodyA={ref}
                bodyB={nodes[y + 1][x + 1]}
                anchors={[
                  [spacing / 2, -spacing / 2, 0],
                  [-spacing / 2, spacing / 2, 0],
                ]}
              />
            );
          }

          // Diagonal (down-left)
          if (x > 0 && y < height - 1) {
            joints.push(
              <JointBetween
                key={`joint-dl-${x}-${y}`}
                bodyA={ref}
                bodyB={nodes[y + 1][x - 1]}
                anchors={[
                  [-spacing / 2, -spacing / 2, 0],
                  [spacing / 2, spacing / 2, 0],
                ]}
              />
            );
          }

          return joints;
        })
      )}
    </>
  );
}
