import 'server-only'

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { PKPass } from 'passkit-generator'
import type { WalletPassDomainModel } from '@/types/rewards'
import type { WalletPassIdentity, WalletPassProvider } from './provider'
import { getAppleWalletSigningConfiguration } from './config'

function rgb(value: string, fallback: string): string {
  const match = /^#([\da-f]{6})$/i.exec(value)
  if (!match) return fallback
  const hex = match[1]
  return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`
}

function icon(size: number, background: string, foreground: string, label: string): Buffer {
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')
  context.fillStyle = background
  context.fillRect(0, 0, size, size)
  context.fillStyle = foreground
  context.font = `700 ${Math.round(size * 0.44)}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label.slice(0, 1).toUpperCase() || 'R', size / 2, size / 2)
  return canvas.toBuffer('image/png')
}

async function logo(
  size: number,
  background: string,
  foreground: string,
  label: string,
  logoUrl: string | null
): Promise<Buffer> {
  const fallback = () => icon(size, background, foreground, label)
  if (!logoUrl) return fallback()
  try {
    const url = new URL(logoUrl)
    const trustedHost = /(?:^|\.)(?:supabase\.co|supabase\.in|vercel\.app)$/i.test(url.hostname)
    if (url.protocol !== 'https:' || !trustedHost) return fallback()
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000), cache: 'force-cache' })
    const length = Number(response.headers.get('content-length') ?? 0)
    if (!response.ok || (length > 0 && length > 1_000_000)) return fallback()
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > 1_000_000) return fallback()
    const source = await loadImage(bytes)
    const canvas = createCanvas(size, size)
    const context = canvas.getContext('2d')
    context.fillStyle = background
    context.fillRect(0, 0, size, size)
    const scale = Math.min((size * 0.84) / source.width, (size * 0.84) / source.height)
    const width = source.width * scale
    const height = source.height * scale
    context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height)
    return canvas.toBuffer('image/png')
  } catch {
    return fallback()
  }
}

export class AppleWalletProvider implements WalletPassProvider {
  readonly provider = 'apple' as const

  async generatePass(model: WalletPassDomainModel, identity: WalletPassIdentity): Promise<Buffer> {
    const config = getAppleWalletSigningConfiguration()
    const background = rgb(model.brandColors.background, 'rgb(18, 18, 20)')
    const foreground = rgb(model.brandColors.foreground, 'rgb(255, 255, 255)')
    const label = rgb(model.brandColors.label, 'rgb(214, 178, 83)')
    const mark = model.membershipName.trim().slice(0, 1) || 'R'
    const [logo1x, logo2x] = await Promise.all([
      logo(80, background, foreground, mark, model.logoUrl),
      logo(160, background, foreground, mark, model.logoUrl),
    ])

    const pass = new PKPass(
      {
        'icon.png': icon(29, background, foreground, mark),
        'icon@2x.png': icon(58, background, foreground, mark),
        'icon@3x.png': icon(87, background, foreground, mark),
        'logo.png': logo1x,
        'logo@2x.png': logo2x,
      },
      config.certificates,
      {
        formatVersion: 1,
        passTypeIdentifier: config.passTypeIdentifier,
        teamIdentifier: config.teamIdentifier,
        serialNumber: identity.serialNumber,
        organizationName: model.membershipName,
        description: `${model.membershipName} loyalty card`,
        logoText: model.membershipName,
        backgroundColor: background,
        foregroundColor: foreground,
        labelColor: label,
        webServiceURL: config.webServiceURL,
        authenticationToken: identity.authenticationToken,
        sharingProhibited: true,
      }
    )

    pass.type = 'storeCard'
    pass.headerFields.push({
      key: 'points',
      label: model.pointsLabel.toUpperCase(),
      value: model.pointsBalance,
      numberStyle: 'PKNumberStyleDecimal',
      changeMessage: `Your ${model.pointsLabel} balance is now %@.`,
    })
    pass.primaryFields.push({
      key: 'member',
      label: model.tier ? `${model.tier.toUpperCase()} MEMBER` : 'MEMBER',
      value: model.customerDisplayName,
    })
    if (model.punchProgress) {
      pass.secondaryFields.push({
        key: 'punches',
        label: model.punchProgress.label.toUpperCase(),
        value: `${model.punchProgress.current} / ${model.punchProgress.target}`,
        changeMessage: 'Your punch progress is now %@.',
      })
    }
    if (model.nextReward) {
      pass.auxiliaryFields.push({
        key: 'nextReward',
        label: 'NEXT REWARD',
        value: model.nextReward,
      })
    }
    pass.backFields.push(
      { key: 'membership', label: 'Membership', value: model.membershipNumber },
      {
        key: 'updated',
        label: 'Last updated',
        value: identity.updatedAt,
        dateStyle: 'PKDateStyleMedium',
      }
    )
    if (model.terms) pass.backFields.push({ key: 'terms', label: 'Terms', value: model.terms })
    if (model.supportUrl) {
      pass.backFields.push({
        key: 'support',
        label: 'Support',
        value: model.supportUrl,
        dataDetectorTypes: ['PKDataDetectorTypeLink'],
      })
    }
    pass.setBarcodes({
      format: 'PKBarcodeFormatQR',
      message: model.barcodeToken,
      messageEncoding: 'iso-8859-1',
      altText: model.membershipNumber,
    })

    return pass.getAsBuffer()
  }
}
