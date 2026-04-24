// app/(customer)/portal/payments/[id]/page.tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerInvoiceById } from '@/lib/payments/getCustomerTransactions'
import { InvoiceDetail } from '@/components/payments/InvoiceDetail'
import { ArrowLeft, ExternalLink, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/payments/formatCurrency'

export const metadata = { title: 'Invoice — Customer Portal' }

export default async function CustomerInvoicePage({ params }: { params: { id: string } }) {
  const host = (await headers()).get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const invoice = await getCustomerInvoiceById(ctx.tenant_id, ctx.customer_id, params.id)

  if (!invoice) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await import('@/lib/supabase/server')).getSupabaseServerClient() as any

  // Get active payment link for this invoice
  const { data: links } = await supabase
    .from('payment_links')
    .select('id, url, status, provider_key')
    .eq('tenant_id', ctx.tenant_id)
    .eq('invoice_id', invoice.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  const paymentLink = links?.[0] ?? null
  const canPay = invoice.status === 'pending' && paymentLink?.url

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/portal/payments"
        className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Payments
      </Link>

      {/* Invoice detail */}
      <InvoiceDetail invoice={invoice as Parameters<typeof InvoiceDetail>[0]['invoice']} />

      {/* Pay / status */}
      {canPay ? (
        <a
          href={paymentLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-gold-gradient text-graphite-900 font-semibold text-sm hover:shadow-glow-gold transition-shadow"
        >
          Pay {formatCurrency(Number(invoice.amount), invoice.currency)}
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : invoice.status === 'paid' ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-400/8 border border-emerald-400/20">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Payment received</p>
            <p className="text-xs text-white/40 mt-0.5">Thank you — this invoice has been paid in full</p>
          </div>
        </div>
      ) : invoice.status === 'pending' && !paymentLink ? (
        <div className="p-4 rounded-2xl bg-yellow-400/6 border border-yellow-400/20 text-sm text-yellow-400/80">
          A payment link is being prepared. Please check back shortly or contact the business.
        </div>
      ) : null}
    </div>
  )
}
