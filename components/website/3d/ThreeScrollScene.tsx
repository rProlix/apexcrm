'use client'

// components/website/3d/ThreeScrollScene.tsx
// Real-time 3D scene (Three.js / React Three Fiber) driven by scroll progress.
//
// Reads the smoothed scroll progress from progressRef (0..1) inside useFrame so
// React does not re-render every frame. Supports scroll-linked rotation,
// position, scale, camera movement/zoom, lighting, material opacity and staged
// scene reveals (named groups like stage_foundation … stage_finished).
//
// Falls back to a premium primitive "demo" object when no model is supplied or
// when a model fails to load, so the builder preview never looks broken.
//
// This file is heavy (WebGL) and is ALWAYS dynamically imported with ssr:false
// from the client wrapper — never from a Server Component.

import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment } from '@react-three/drei'
import * as THREE from 'three'
import {
  LIGHTING_PRESETS,
  ENVIRONMENT_DREI_PRESET,
  STAGE_GROUP_NAMES,
} from '@/lib/website/premium3d/presets'
import type { Premium3DScrollHeroContent } from '@/lib/website/premium3d/types'
import { ScrollHeroErrorBoundary } from './ScrollHeroErrorBoundary'

interface Props {
  content:     Premium3DScrollHeroContent
  progressRef: React.RefObject<number>
  active:      boolean
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// ── Camera rig ────────────────────────────────────────────────────────────────

function CameraRig({ content, progressRef }: { content: Premium3DScrollHeroContent; progressRef: React.RefObject<number> }) {
  const { camera } = useThree()
  const baseZ = 5 / (content.cameraZoom || 1)

  useFrame(() => {
    const p = progressRef.current ?? 0
    switch (content.cameraPath) {
      case 'orbit': {
        const angle = lerp(-0.5, 0.5, p)
        camera.position.x = Math.sin(angle) * baseZ
        camera.position.z = Math.cos(angle) * baseZ
        camera.position.y = lerp(0.6, 1.2, p)
        break
      }
      case 'dollyIn':
        camera.position.set(0, 0.6, lerp(baseZ * 1.6, baseZ * 0.8, p))
        break
      case 'craneUp':
        camera.position.set(0, lerp(-0.4, 1.6, p), baseZ)
        break
      case 'arc':
        camera.position.set(lerp(-baseZ * 0.6, baseZ * 0.6, p), lerp(0.4, 1.2, p), baseZ * 0.9)
        break
      case 'static':
      default:
        camera.position.set(0, 0.5, baseZ)
        break
    }
    camera.lookAt(0, 0.2, 0)
  })

  return null
}

// ── Lighting ──────────────────────────────────────────────────────────────────

function SceneLighting({ content }: { content: Premium3DScrollHeroContent }) {
  const cfg = LIGHTING_PRESETS[content.lightingPreset ?? 'studioSoftbox']
  const shadow = content.shadowIntensity ?? 0.6
  return (
    <>
      <ambientLight intensity={cfg.ambient} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={cfg.key}
        color={cfg.keyColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-5, 2, -2]} intensity={cfg.fill} color={cfg.keyColor} />
      <directionalLight position={[0, 3, -6]} intensity={cfg.rim * (0.5 + shadow)} color={cfg.rimColor} />
    </>
  )
}

// ── Loaded GLB/GLTF model ──────────────────────────────────────────────────────

function Model({ content, progressRef }: { content: Premium3DScrollHeroContent; progressRef: React.RefObject<number> }) {
  const url = content.modelUrl as string
  const gltf = useGLTF(url)
  const root = useRef<THREE.Group>(null)

  // Clone so the same cached GLTF can be reused safely.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  // Find named stage groups for staged reveals (construction-style).
  const stages = useMemo(() => {
    const found: THREE.Object3D[] = []
    for (const name of STAGE_GROUP_NAMES) {
      const obj = scene.getObjectByName(name)
      if (obj) found.push(obj)
    }
    return found
  }, [scene])

  // Ensure materials can fade.
  useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && mesh.material) {
        const mat = mesh.material as THREE.Material
        mat.transparent = true
      }
    })
  }, [scene])

  const ir = content.initialRotation ?? { x: 0, y: 0, z: 0 }
  const tr = content.targetRotation ?? { x: 0, y: Math.PI * 2, z: 0 }
  const scale = content.modelScale ?? 1

  useFrame(() => {
    const g = root.current
    if (!g) return
    const p = progressRef.current ?? 0

    g.rotation.x = lerp(ir.x, tr.x, p)
    g.rotation.y = lerp(ir.y, tr.y, p)
    g.rotation.z = lerp(ir.z, tr.z, p)

    // Subtle scale-in for a premium feel.
    const s = scale * lerp(0.92, 1, Math.min(1, p * 2))
    g.scale.setScalar(s)

    // Staged reveals
    if (stages.length > 0 && content.stageRevealMode && content.stageRevealMode !== 'none') {
      const n = stages.length
      stages.forEach((stage, i) => {
        const threshold = i / n
        const localProgress = Math.min(1, Math.max(0, (p - threshold) * n))
        if (content.stageRevealMode === 'crossfade') {
          stage.visible = p >= threshold - 0.05
          stage.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh && mesh.material) {
              ;(mesh.material as THREE.Material).opacity = localProgress
            }
          })
        } else {
          // sequential: hard reveal
          stage.visible = p >= threshold
        }
      })
    }
  })

  return <group ref={root}><primitive object={scene} /></group>
}

// ── Premium demo object (fallback / no model) ──────────────────────────────────

function DemoObject({ content, progressRef }: { content: Premium3DScrollHeroContent; progressRef: React.RefObject<number> }) {
  const ref = useRef<THREE.Mesh>(null)
  const accent = content.palette?.accent ?? '#7c3aed'
  const glow = content.palette?.glow ?? '#a855f7'

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const p = progressRef.current ?? 0
    g.rotation.y = lerp(0, Math.PI * 2, p)
    g.rotation.x = lerp(0, Math.PI * 0.5, p)
    const s = (content.modelScale ?? 1) * lerp(0.9, 1.05, p)
    g.scale.setScalar(s)
  })

  return (
    <mesh ref={ref} castShadow>
      <torusKnotGeometry args={[1, 0.32, 160, 24]} />
      <meshStandardMaterial
        color={accent}
        emissive={glow}
        emissiveIntensity={0.25}
        metalness={0.6}
        roughness={0.25}
      />
    </mesh>
  )
}

// ── Environment (guarded) ──────────────────────────────────────────────────────

function SceneEnvironment({ content }: { content: Premium3DScrollHeroContent }) {
  const preset = ENVIRONMENT_DREI_PRESET[content.environmentPreset ?? 'studio']
  if (!preset) return null
  return (
    <ScrollHeroErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Environment preset={preset as any} />
      </Suspense>
    </ScrollHeroErrorBoundary>
  )
}

// ── Main exported scene ─────────────────────────────────────────────────────────

export default function ThreeScrollScene({ content, progressRef, active }: Props) {
  const hasModel = !!content.modelUrl

  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 1.75]}
      shadows
      camera={{ position: [0, 0.5, 5], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <SceneLighting content={content} />
      <SceneEnvironment content={content} />
      <CameraRig content={content} progressRef={progressRef} />
      <Suspense fallback={<DemoObject content={content} progressRef={progressRef} />}>
        {hasModel ? (
          <ScrollHeroErrorBoundary fallback={<DemoObject content={content} progressRef={progressRef} />}>
            <Model content={content} progressRef={progressRef} />
          </ScrollHeroErrorBoundary>
        ) : (
          <DemoObject content={content} progressRef={progressRef} />
        )}
      </Suspense>
    </Canvas>
  )
}
