// lib/email/templates/appointmentConfirmation.ts
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface AppointmentEmailData {
  customerName?:     string
  businessName:      string
  appointmentDate:   string
  appointmentTime:   string
  serviceName?:      string
  professionalName?: string
  location?:         string
  manageUrl?:        string
  reason?:           string   // only for cancellation
}

function appointmentDetails(data: AppointmentEmailData): string {
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
          <td style="padding:10px 16px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;width:120px;">
            ${label}
          </td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;">
            ${value}
          </td>
        </tr>`
      ).join('')}
    </table>
  `
}

function appointmentText(data: AppointmentEmailData): string {
  const lines = [
    `Date:    ${data.appointmentDate}`,
    `Time:    ${data.appointmentTime}`,
    data.serviceName      ? `Service: ${data.serviceName}`           : '',
    data.professionalName ? `With:    ${data.professionalName}`       : '',
    data.location         ? `Where:   ${data.location}`               : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function buildAppointmentConfirmationEmail(data: AppointmentEmailData): TemplateResult {
  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hi there,'

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Appointment confirmed ✓</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      ${greeting} Your appointment with <strong>${data.businessName}</strong> is confirmed.
    </p>
    ${appointmentDetails(data)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Need to reschedule or cancel? ${data.manageUrl
        ? `<a href="${data.manageUrl}" style="color:#3b82f6;">Manage your appointment</a>.`
        : 'Contact us directly.'}
    </p>
  `

  const bodyText = `
${greeting} Your appointment with ${data.businessName} is confirmed.

${appointmentText(data)}
${data.manageUrl ? `\nManage appointment: ${data.manageUrl}` : ''}
  `.trim()

  return {
    subject: `Appointment confirmed with ${data.businessName}`,
    html:    renderBaseEmail({
      title:       'Appointment confirmed',
      previewText: `Your appointment with ${data.businessName} is confirmed`,
      bodyHtml,
      ctaLabel:   data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:     data.manageUrl,
      tenantName: data.businessName,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:   data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:     data.manageUrl,
      tenantName: data.businessName,
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
    ${appointmentDetails(data)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Need to reschedule or cancel? ${data.manageUrl
        ? `<a href="${data.manageUrl}" style="color:#3b82f6;">Manage your appointment</a>.`
        : 'Contact us directly.'}
    </p>
  `

  const bodyText = `
${greeting} Reminder: your upcoming appointment with ${data.businessName}.

${appointmentText(data)}
${data.manageUrl ? `\nManage appointment: ${data.manageUrl}` : ''}
  `.trim()

  return {
    subject: `Reminder: your appointment with ${data.businessName}`,
    html:    renderBaseEmail({
      title:       'Appointment reminder',
      previewText: `Your appointment with ${data.businessName} is coming up`,
      bodyHtml,
      ctaLabel:   data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:     data.manageUrl,
      tenantName: data.businessName,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:   data.manageUrl ? 'View appointment' : undefined,
      ctaUrl:     data.manageUrl,
      tenantName: data.businessName,
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
    ${appointmentDetails(data)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#4b5563;font-size:13px;margin:0;">
      Would you like to book a new appointment? Contact ${data.businessName} directly or
      ${data.manageUrl
        ? `<a href="${data.manageUrl}" style="color:#3b82f6;">visit your portal</a>.`
        : 'visit their website.'}
    </p>
  `

  const bodyText = `
${greeting} Your appointment with ${data.businessName} has been cancelled.
${data.reason ? `\nReason: ${data.reason}` : ''}

Cancelled appointment details:
${appointmentText(data)}
${data.manageUrl ? `\nBook a new appointment: ${data.manageUrl}` : ''}
  `.trim()

  return {
    subject: `Appointment cancelled with ${data.businessName}`,
    html:    renderBaseEmail({
      title:       'Appointment cancelled',
      previewText: `Your appointment with ${data.businessName} has been cancelled`,
      bodyHtml,
      tenantName: data.businessName,
    }),
    text: renderBasePlainText({
      bodyText,
      tenantName: data.businessName,
    }),
  }
}
