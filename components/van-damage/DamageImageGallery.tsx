'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Copy, Eye, EyeOff, ImageIcon, Maximize2 } from 'lucide-react'
import type { DamageImage, DamageItem, ResolvedDamageImage } from './inspection-types'

const DamageLightbox = dynamic(() => import('./DamageLightbox'), { ssr: false })

export function DamageImageGallery({
  images,
  items,
  businessId,
}: {
  images: DamageImage[]
  items: DamageItem[]
  businessId: string
}) {
  const [resolved, setResolved] = useState<ResolvedDamageImage[]>(images.map((image) => ({ ...image, url: null })))
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [overlays, setOverlays] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all(images.map(async (image) => {
      try {
        const response = await fetch(`/api/van-damage/images/${image.id}/signed-url?businessId=${encodeURIComponent(businessId)}`, { signal: controller.signal })
        if (!response.ok) return { ...image, url: null }
        const result = await response.json() as { url: string }
        return { ...image, url: result.url }
      } catch {
        return { ...image, url: null }
      }
    })).then(setResolved)
    return () => controller.abort()
  }, [businessId, images])

  const scrollToImage = useCallback((imageId: string) => {
    document.getElementById(`inspection-image-${imageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const index = images.findIndex((image) => image.id === imageId)
    if (index >= 0) setActiveIndex(index)
  }, [images])

  const copyPermalink = useCallback(async (imageId: string) => {
    await navigator.clipboard?.writeText(`${window.location.href.split('#')[0]}#image-${imageId}`).catch(() => undefined)
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const imageId = (event as CustomEvent<string>).detail
      scrollToImage(imageId)
    }
    window.addEventListener('van-damage:focus-image', handler)
    return () => window.removeEventListener('van-damage:focus-image', handler)
  }, [scrollToImage])

  useEffect(() => {
    const hash = window.location.hash.replace('#image-', '')
    if (hash) scrollToImage(hash)
  }, [scrollToImage])

  if (!images.length) return <div className="flex aspect-[16/5] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-white/35"><ImageIcon className="mr-2 h-5 w-5" />No images recorded</div>

  return <>
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-white">Inspection imagery</h2>
        <p className="mt-1 text-xs text-white/40">{images.length} original photo{images.length === 1 ? '' : 's'} · select an image to inspect</p>
      </div>
      <button onClick={() => setOverlays((value) => !value)} aria-pressed={overlays} className="focus-ring inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">
        {overlays ? <Eye className="mr-2 h-4 w-4 text-amber-300" /> : <EyeOff className="mr-2 h-4 w-4" />}{overlays ? 'Hide overlays' : 'Show overlays'}
      </button>
    </div>
    <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
      {resolved.map((image, index) => {
        const quality = getImageQuality(image)
        return <button key={image.id} onClick={() => setActiveIndex(index)} className="focus-ring relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[.03]">
          {image.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : <ImageIcon className="mx-auto mt-4 h-5 w-5 text-white/25" />}
          {quality !== 'good' && <span className="absolute right-1 top-1 rounded bg-amber-400/90 p-0.5 text-black"><AlertTriangle className="h-2.5 w-2.5" /></span>}
        </button>
      })}
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {resolved.map((image, index) => {
        const imageItems = items.filter((item) => item.image_id === image.id && item.bounding_box)
        const quality = getImageQuality(image)
        return <div id={`inspection-image-${image.id}`} key={image.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-graphite-800 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-panel-lg">
          <div className="relative aspect-[4/3] overflow-hidden bg-white/[0.03]">
            <button
              id={`image-${image.id}`}
              aria-label={`Open inspection image ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              className="focus-ring absolute inset-0 block h-full w-full text-left"
            >
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt={`Inspection image ${index + 1}`} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              ) : <span className="flex h-full items-center justify-center text-white/25"><ImageIcon className="h-8 w-8" /></span>}
              <span className="absolute right-3 top-3 rounded-lg bg-black/55 p-2 text-white/75 opacity-0 backdrop-blur transition group-hover:opacity-100"><Maximize2 className="h-4 w-4" /></span>
              {imageItems.length > 0 && <span className="absolute bottom-3 left-3 rounded-full border border-amber-300/30 bg-black/60 px-2.5 py-1 text-[10px] font-medium text-amber-200 backdrop-blur">{imageItems.length} finding{imageItems.length === 1 ? '' : 's'}</span>}
              {quality !== 'good' && <span className="absolute bottom-3 right-3 inline-flex items-center rounded-full border border-amber-300/30 bg-black/60 px-2.5 py-1 text-[10px] text-amber-100 backdrop-blur"><AlertTriangle className="mr-1 h-3 w-3" />{quality}</span>}
            </button>
            {overlays && imageItems.map((item) => {
              const box = item.bounding_box!
              return <button
                key={item.id}
                aria-label={`Select ${item.damage_type?.replaceAll('_', ' ') || 'damage'} annotation in ${item.vehicle_area?.replaceAll('_', ' ') || 'unknown region'}`}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('van-damage:select-finding', { detail: item.id }))
                }}
                className="focus-ring absolute z-10 border-2 border-amber-300 bg-amber-300/15 shadow-[0_0_12px_rgba(232,195,74,.3)]"
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
              />
            })}
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs capitalize text-white/65">{image.image_role?.replaceAll('_', ' ') || `Photo ${index + 1}`}</span>
            <span className="flex items-center gap-2 text-[10px] text-white/30">{image.width && image.height ? `${image.width}×${image.height}` : image.status}<button onClick={() => copyPermalink(image.id)} className="focus-ring no-print rounded p-1 text-white/35 hover:bg-white/5 hover:text-white" aria-label={`Copy link to image ${index + 1}`}><Copy className="h-3 w-3" /></button></span>
          </div>
        </div>
      })}
    </div>
    {activeIndex != null && <DamageLightbox images={resolved} items={items} initialIndex={activeIndex} overlays={overlays} businessId={businessId} onClose={() => setActiveIndex(null)} onIndexChange={setActiveIndex} />}
  </>
}

function getImageQuality(image: DamageImage) {
  if (image.status === 'failed') return 'failed'
  if (image.width && image.height && Math.min(image.width, image.height) < 700) return 'low resolution'
  if (image.file_size_bytes && image.file_size_bytes < 80 * 1024) return 'small file'
  return 'good'
}
