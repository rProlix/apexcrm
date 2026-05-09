// lib/email/templates/appointmentConfirmation.ts
// WHITE-LABEL: all appointment emails show the business branding only.
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface AppointmentEmailData {
  customerName?:      string
  businessName:       string
  businessLogoUrl?:   string | null
  businessWebsite?:   string | null
  primaryColor?:      string | null
  appointmentDate:    string
  appointmentTime:    string
  serviceName?:       string
  professionalName?:  string
  location?:          string
  manageUrl?:         string
  reason?:            string   // cancellation reason
}

function appointmentDetailsTable(data: AppointmentEmailData): string {
  const rows = [
    ['Date',         data.appointmentDate],
    ['Time',         data.appointmentTime],
    data.serviceName      ? ['Service',      data.serviceName]      : null,
    data.professionalName ? ['Professional', data.professionalName] : null,
    data.location         ? ['Location',     data.location]         : null,
  ].filter(Boolean) as [string, string][]

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      ${rows.map(([label, value], i) => `
        <tr style="${i > 0 ? 'border-top:1px solid #e5e7eb;' : ''}">
          <td style="padding:10px 16px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;width:120px;">${label}</td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;">${value}</td>
        </tr>`
      ).join('')}
    </table>
  `
}

function appointmentDetailsText(data: AppointmentEmailData): string {
  return [
    `Date:    ${data.appointmentDate}`,
    `Time:    ${data.appointmentTime}`,
    data.serviceName      ? `Service: ${data.serviceName}`     : '',
    data.professionalName ? `With:    ${data.professionalName}` : '',
    data.location         ? `Where:   ${data.location}`         : '',
  ].filter(Boolean).join('\n')
}

export function buildAppointmentConfirmationEmail(data: AppointmentEmailData): TemplateResult {
  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hi there,'

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Appointment confirmed ✓</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      ${greeting} Your appointment with <strong>${data.businessName}</strong> is confirmed.
    </p>
    ${appointmentDetailsTable(data)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Need to reschedule or cancel?
      ${data.manageUrl
        ? `<a href="${data.manageUrl}" style="color:#3b82f6;">Manage your appointment</a>.`
        : `Contact ${data.businessName} directly.`}
    </p>
  `
  const bodyText = `
${greeting} Your appointment with ${data.businessName} is confirmed.

${appointmentDetailsText(data)}
${data.manageUrl ? `\nManage appointment: ${data.manageUrl}` : ''}
  `.trim()

  return {
    subject: `Appointment confirmed with ${data.businessName}`,
    html: renderBaseEmail({
      title:              'Appointment confirmed',
      previewText:        `Your appointment with ${data.businessName} is confirmed`,
      bodyHtml,
      ctaLabel:           data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:             data.manageUrl,
      tenantName:         data.businessName,
      tenantLogoUrl:      data.businessLogoUrl,
      tenantWebsiteUrl:   data.businessWebsite,
      tenantPrimaryColor: data.primaryColor,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:         data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:           data.manageUrl,
      tenantName:       data.businessName,
      tenantWebsiteUrl: data.businessWebsite,
    }),
  }
}

export function buildAppointmentReminderEmail(data: AppointmentEmailData): TemplateResult {
  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hi there,'

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Appointment reminder 🔔</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      ${greeting} Just a reminder about your upcoming appointment with <strong>${data.businessName}</strong>.
    </p>
    ${appointmentDetailsTable(data)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Need to reschedule or cancel?
      ${data.manageUrl
        ? `<a href="${data.manageUrl}" style="color:#3b82f6;">Manage your appointment</a>.`
        : `Contact ${data.businessName} directly.`}
    </p>
  `
  const bodyText = `
${greeting} Reminder: your upcoming appointment with ${data.businessName}.

${appointmentDetailsText(data)}
${data.manageUrl ? `\nManage appointment: ${data.manageUrl}` : ''}
  `.trim()

  return {
    subject: `Reminder: your appointment with ${data.businessName}`,
    html: renderBaseEmail({
      title:              'Appointment reminder',
      previewText:        `Your appointment with ${data.businessName} is coming up`,
      bodyHtml,
      ctaLabel:           data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:             data.manageUrl,
      tenantName:         data.businessName,
      tenantLogoUrl:      data.businessLogoUrl,
      tenantWebsiteUrl:   data.businessWebsite,
      tenantPrimaryColor: data.primaryColor,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:         data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:           data.manageUrl,
      tenantName:       data.businessName,
      tenantWebsiteUrl: data.businessWebsite,
    }),
  }
}

export function buildAppointmentCancelledEmail(data: AppointmentEmailData): TemplateResult {
  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hi there,'

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Appointment cancelled</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      ${greeting} Your appointment with <strong>${data.businessName}</strong> has been cancelled.
    </p>
    ${data.reason ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;margin-bottom:20px;">
      <p style="color:#991b1b;font-size:13px;margin:0;"><strong>Reason:</strong> ${data.reason}</p>
    </div>` : ''}
    ${appointmentDetailsTable(data)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#4b5563;font-size:13px;margin:0;">
      Would you like to book again? Contact <strong>${data.businessName}</strong> directly
      ${data.businessWebsite ? `or <a href="${data.businessWebsite}" style="color:#3b82f6;">visit their website</a>` : ''}.
    </p>
  `
  const bodyText = `
${greeting} Your appointment with ${data.businessName} has been cancelled.
${data.reason ? `\nReason: ${data.reason}` : ''}

Cancelled appointment details:
${appointmentDetailsText(data)}
${data.businessWebsite ? `\nBook again: ${data.businessWebsite}` : ''}
  `.trim()

  return {
    subject: `Appointment cancelled — ${data.businessName}`,
    html: renderBaseEmail({
      title:              'Appointment cancelled',
      previewText:        `Your appointment with ${data.businessName} has been cancelled`,
      bodyHtml,
      tenantName:         data.businessName,
      tenantLogoUrl:      data.businessLogoUrl,
      tenantWebsiteUrl:   data.businessWebsite,
      tenantPrimaryColor: data.primaryColor,
    }),
    text: renderBasePlainText({
      bodyText,
      tenantName:       data.businessName,
      tenantWebsiteUrl: data.businessWebsite,
    }),
  }
}
