// lib/email/index.ts
// Central re-export for the Nexora email system.
// Server-only — never import this barrel in client components.
export { resolveEmailBranding, buildEmailBrandingFromTenant, PLATFORM_BRANDING } from './branding'
export type { ResolvedEmailBranding, EmailBrandingMode, TenantBrandingData } from './branding'

export { sendEmail }          from './sendEmail'
export { sendBatchEmail }     from './sendBatchEmail'
export { getEmailConfig, getProviderStatus, assertProviderConfigured } from './config'

// URL helpers
export {
  getAppUrl,
  getRootDomain,
  buildLoginUrl,
  buildSignupUrl,
  buildPasswordResetUrl,
  buildCustomerInviteUrl,
  buildBusinessInviteUrl,
  buildTenantSiteUrl,
  buildAppointmentUrl,
  buildRewardsUrl,
  buildOrderUrl,
} from './urls'

// Templates
export { buildAccountConfirmationEmail } from './templates/accountConfirmation'
export { buildPasswordResetEmail }       from './templates/passwordReset'
export { buildCustomerInviteEmail }      from './templates/customerInvite'
export { buildBusinessInviteEmail }      from './templates/businessInvite'
export {
  buildAppointmentConfirmationEmail,
  buildAppointmentReminderEmail,
  buildAppointmentCancelledEmail,
} from './templates/appointmentConfirmation'
export { buildTransactionReceiptEmail }  from './templates/transactionReceipt'
export { buildOrderConfirmationEmail }   from './templates/orderConfirmation'
export { buildRewardNotificationEmail }  from './templates/rewardNotification'
export { buildMarketingCampaignEmail }   from './templates/marketingCampaign'

// Types
export type {
  EmailPayload,
  EmailResult,
  EmailProvider,
  EmailCategory,
  TemplateResult,
  EmailConfig,
} from './types'
