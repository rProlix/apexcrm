import 'server-only'

export interface AppleWalletConfigurationStatus {
  passTypeId: boolean
  teamId: boolean
  certificate: boolean
  privateKey: boolean
  wwdrCertificate: boolean
  webServiceUrl: boolean
  tokenEncryptionKey: boolean
  configured: boolean
}

export function getAppleWalletConfigurationStatus(): AppleWalletConfigurationStatus {
  const status = {
    passTypeId: Boolean(process.env.APPLE_WALLET_PASS_TYPE_ID?.trim()),
    teamId: Boolean(process.env.APPLE_WALLET_TEAM_ID?.trim()),
    certificate: Boolean(process.env.APPLE_WALLET_CERTIFICATE_BASE64?.trim()),
    privateKey: Boolean(process.env.APPLE_WALLET_PRIVATE_KEY_BASE64?.trim()),
    wwdrCertificate: Boolean(process.env.APPLE_WALLET_WWDR_CERTIFICATE_BASE64?.trim()),
    webServiceUrl: Boolean(process.env.APPLE_WALLET_WEB_SERVICE_URL?.trim()),
    tokenEncryptionKey: Boolean(process.env.REWARDS_TOKEN_ENCRYPTION_KEY?.trim()),
  }
  return { ...status, configured: Object.values(status).every(Boolean) }
}

function decodeBase64Env(name: string): Buffer {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return Buffer.from(value, 'base64')
}

export function getAppleWalletSigningConfiguration() {
  const status = getAppleWalletConfigurationStatus()
  if (!status.configured) throw new Error('Apple Wallet signing is not configured')
  return {
    passTypeIdentifier: process.env.APPLE_WALLET_PASS_TYPE_ID!.trim(),
    teamIdentifier: process.env.APPLE_WALLET_TEAM_ID!.trim(),
    webServiceURL: process.env.APPLE_WALLET_WEB_SERVICE_URL!.replace(/\/$/, ''),
    certificates: {
      wwdr: decodeBase64Env('APPLE_WALLET_WWDR_CERTIFICATE_BASE64'),
      signerCert: decodeBase64Env('APPLE_WALLET_CERTIFICATE_BASE64'),
      signerKey: decodeBase64Env('APPLE_WALLET_PRIVATE_KEY_BASE64'),
      signerKeyPassphrase: process.env.APPLE_WALLET_CERTIFICATE_PASSWORD,
    },
  }
}
