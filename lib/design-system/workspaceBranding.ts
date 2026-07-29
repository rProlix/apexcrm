export function getBrandInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)

  if (words.length === 0) return 'WS'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words.at(-1)?.[0] ?? ''}`.toUpperCase()
}

export function hasValidLogoSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value
    )
  }
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeType === 'image/webp') {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    )
  }
  return false
}
