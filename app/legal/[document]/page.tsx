import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  LEGAL_DOCUMENT_ORDER,
  getLegalDocument,
} from '@/lib/legal/policies'

interface Props {
  params: Promise<{ document: string }>
}

export function generateStaticParams() {
  return LEGAL_DOCUMENT_ORDER.map((document) => ({ document }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { document: key } = await params
  const document = getLegalDocument(key)
  if (!document) return {}

  return {
    title: `${document.title} | NexoraNow`,
    description: document.description,
  }
}

export default async function LegalDocumentPage({ params }: Props) {
  const { document: key } = await params
  const document = getLegalDocument(key)
  if (!document) notFound()

  return (
    <article className="mx-auto max-w-3xl pb-16">
      <header className="border-b border-white/[0.08] pb-8">
        <p className="text-sm font-medium text-gold-400">NexoraNow legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
          {document.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/55">
          {document.description}
        </p>
        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-xs">
          <div>
            <dt className="text-white/30">Effective date</dt>
            <dd className="mt-1 font-medium text-white/65">{document.effectiveDate}</dd>
          </div>
          <div>
            <dt className="text-white/30">Version</dt>
            <dd className="mt-1 font-mono font-medium text-white/65">{document.version}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-10 space-y-10">
        {document.sections.map((section) => (
          <section key={section.heading} className="scroll-mt-24">
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-white">
              {section.heading}
            </h2>

            {section.paragraphs && (
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-white/58">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {section.items && (
              <ul className="mt-4 space-y-3 pl-5">
                {section.items.map((item) => (
                  <li key={item} className="list-disc pl-1 text-sm leading-7 text-white/58 marker:text-gold-400/65">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
