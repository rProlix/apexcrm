import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageUrl = new URL(
  '../../../app/(dashboard)/dashboard/damage-ai/inspections/[inspectionId]/page.tsx',
  import.meta.url
)
const componentUrl = new URL(
  '../../../components/van-damage/InspectionExperience.tsx',
  import.meta.url
)
const metadataApiUrl = new URL(
  '../../../app/api/van-damage/inspections/[inspectionId]/metadata/route.ts',
  import.meta.url
)
const lightboxUrl = new URL('../../../components/van-damage/DamageLightbox.tsx', import.meta.url)

test('inspection report prioritizes operational status, vehicle, critical findings, evidence, and timeline', async () => {
  const component = await readFile(componentUrl, 'utf8')
  for (const section of [
    'inspection-summary',
    'vehicle-profile',
    'critical-findings',
    'vehicle-damage-map',
    'inspection-images',
    'damage-findings',
    'inspection-timeline',
  ]) {
    assert.match(component, new RegExp(section))
  }
  assert.match(component, /Level 3 damage/)
  assert.match(component, /Human review required/)
  assert.match(component, /Uploaded by/)
  assert.match(component, /Reporter information identifies who submitted/)
  assert.match(component, /View evidence/)
  assert.doesNotMatch(component, /Vehicle details unavailable/)
})

test('inspection metadata is server-resolved owner-only and never sent as raw props', async () => {
  const [page, component, endpoint] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(componentUrl, 'utf8'),
    readFile(metadataApiUrl, 'utf8'),
  ])
  assert.match(page, /canViewMetadata=\{scope\.ctx\.role === 'owner'\}/)
  assert.match(page, /safeInspectionMetadata\(inspection\.metadata\)/)
  assert.match(page, /scope\.ctx\.role === 'owner'\s*\?\s*'id,status,input_summary/)
  assert.match(component, /props\.canViewMetadata && props\.ownerMetadata/)
  assert.match(component, /className="no-print/)
  assert.match(endpoint, /resolvePlatformOwnerAccess/)
  assert.doesNotMatch(endpoint, /\['owner', 'admin'\]/)
  assert.doesNotMatch(component, /input_summary|workerVersion.*payload/)
})

test('inspection client payload is provider-neutral and omits internal model identifiers', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.doesNotMatch(component.toLowerCase(), /gemini|google generative ai/)
  assert.doesNotMatch(component, /ai_model|prompt_version/)
  assert.match(component, /Automated analysis|AI damage summary|Analysis has not completed yet/)
})

test('fullscreen inspection image viewer gives the evidence frame explicit dimensions', async () => {
  const source = await readFile(lightboxUrl, 'utf8')
  assert.match(source, /className="relative h-full w-full will-change-transform/)
  assert.doesNotMatch(source, /className="relative max-h-full max-w-full transition-transform/)
})

test('fullscreen inspection viewer escapes transformed page stacking contexts through a body portal', async () => {
  const source = await readFile(lightboxUrl, 'utf8')
  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /return createPortal\(/)
  assert.match(source, /document\.body/)
})

test('fullscreen pan uses motion values without a lagging CSS transform transition', async () => {
  const source = await readFile(lightboxUrl, 'utf8')
  assert.match(
    source,
    /useMotionTemplate`translate3d\(\$\{panX\}px, \$\{panY\}px, 0\) scale\(\$\{zoomValue\}\)`/
  )
  assert.match(source, /panX\.set\(/)
  assert.match(source, /panY\.set\(/)
  assert.doesNotMatch(source, /setOffset\(/)
  assert.doesNotMatch(source, /transition-transform duration-150/)
})

test('fullscreen inspection viewer supports native pointer-based pinch zoom on touch screens', async () => {
  const source = await readFile(lightboxUrl, 'utf8')
  assert.match(source, /activePointers = useRef\(new Map/)
  assert.match(source, /pointerDistance\(points\[0\], points\[1\]\)/)
  assert.match(source, /pinchStart\.current\.zoom/)
  assert.match(source, /style=\{\{ touchAction: 'none' \}\}/)
  assert.match(source, /useBodyScrollLock\(true\)/)
})
