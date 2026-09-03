import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, FileText } from 'lucide-react'
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENT_ORDER,
  LEGAL_DOCUMENTS,
  PRIVACY_CONTACT_EMAIL,
} from '@/lib/legal/policies'

export const metadata: Metadata = {
  title: 'Legal and Trust Center | NexoraNow',
  description:
    'NexoraNow terms, privacy disclosures, acceptable use rules, AI transparency, and data processing terms.',
}

export default function LegalIndexPage() {
  return (
    <div className="pb-12">
      <div className="max-w-3xl">
        <p className="mb-3 text-sm font-medium text-gold-400">Legal and Trust Center</p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
          Clear terms for responsible business software.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/55">
          Review how NexoraNow handles data, AI-assisted workflows, platform use, and business
          processing responsibilities.
        </p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {LEGAL_DOCUMENT_ORDER.map((key) => {
          const document = LEGAL_DOCUMENTS[key]
          return (
            <Link
              key={key}
              href={`/legal/${key}`}
              className="group flex min-h-40 flex-col justify-between rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-gold-400/25 hover:bg-white/[0.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <div className="flex items-start justify-between gap-5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-white/55">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <ArrowUpRight
                  className="h-4 w-4 text-white/25 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold-400"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-7">
                <h2 className="text-sm font-semibold text-white">{document.title}</h2>
                <p className="mt-1.5 text-xs leading-5 text-white/40">{document.description}</p>
              </div>
            </Link>
          )
        })}
      </div>

      <section className="mt-12 rounded-2xl border border-white/[0.08] bg-graphite-900/65 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-white">Questions or requests</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
          Contact the appropriate team and include the workspace name connected to your request when
          relevant.
        </p>
        <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:gap-8">
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-gold-400 hover:text-gold-300">
            {LEGAL_CONTACT_EMAIL}
          </a>
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-gold-400 hover:text-gold-300">
            {PRIVACY_CONTACT_EMAIL}
          </a>
        </div>
      </section>
    </div>
  )
}
