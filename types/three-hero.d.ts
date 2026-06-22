// types/three-hero.d.ts
//
// Ambient module declaration for the heavy React-Three-Fiber scene.
//
// WHY THIS EXISTS:
//  @react-three/fiber globally augments `JSX.IntrinsicElements` with all
//  Three.js elements (mesh, group, …). Those elements do not accept DOM props
//  like `className`, so once the augmentation enters the TypeScript program it
//  poisons every generic `React.ElementType` usage across the app (lucide
//  icons, framer-motion, dynamic <Tag/> renderers), collapsing their props to
//  `never`.
//
//  To keep that augmentation contained, the only file that imports
//  @react-three/* (components/website/3d/ThreeScrollScene.tsx) is EXCLUDED from
//  the app tsconfig and imported through the bundler-only alias `@three-hero/*`
//  (configured in next.config.js). TypeScript resolves that specifier to this
//  ambient declaration (typed, but R3F-free), while webpack/SWC bundles the
//  real .tsx at runtime. The scene itself is still compiled — just not type
//  checked as part of the main program.

declare module '@three-hero/ThreeScrollScene' {
  import type { Premium3DScrollHeroContent } from '@/lib/website/premium3d/types'
  import type { ComponentType, RefObject } from 'react'

  interface ThreeScrollSceneProps {
    content:     Premium3DScrollHeroContent
    progressRef: RefObject<number>
    active:      boolean
  }

  const ThreeScrollScene: ComponentType<ThreeScrollSceneProps>
  export default ThreeScrollScene
}
