import type { WalletPassDomainModel } from '@/types/rewards'

export interface WalletPassIdentity {
  serialNumber: string
  authenticationToken: string
  updatedAt: string
}

export interface WalletPassProvider {
  readonly provider: 'apple' | 'google'
  generatePass(model: WalletPassDomainModel, identity: WalletPassIdentity): Promise<Buffer>
}
