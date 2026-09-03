export type LegalDocumentKey =
  | 'terms'
  | 'privacy'
  | 'acceptable-use'
  | 'ai-notice'
  | 'data-processing-addendum'
  | 'cookie-policy'

export interface LegalSection {
  heading: string
  paragraphs?: string[]
  items?: string[]
}

export interface LegalDocument {
  key: LegalDocumentKey
  shortTitle: string
  title: string
  description: string
  version: string
  effectiveDate: string
  sections: LegalSection[]
}

export const LEGAL_EFFECTIVE_DATE = 'July 26, 2026'
export const LEGAL_VERSION = '2026-07-26'
export const LEGAL_CONTACT_EMAIL = 'legal@nexoranow.com'
export const PRIVACY_CONTACT_EMAIL = 'privacy@nexoranow.com'

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  terms: {
    key: 'terms',
    shortTitle: 'Terms',
    title: 'Terms of Use',
    description: 'The contract governing access to and use of NexoraNow services.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: '1. Agreement and authority',
        paragraphs: [
          'These Terms of Use form a binding agreement between you and NexoraNow for access to the NexoraNow platform, websites, applications, APIs, AI features, and related services (collectively, the "Services"). By creating an account, accepting an invitation, or using the Services, you agree to these Terms.',
          'If you use the Services for a company or other organization, you represent that you have authority to bind that organization. In that case, "Customer" and "you" include that organization and its authorized users.',
          'You must be at least 18 years old and legally able to enter into this agreement. If you do not agree, do not create an account or use the Services.',
        ],
      },
      {
        heading: '2. Accounts and authorized users',
        items: [
          'Provide accurate, current account and business information.',
          'Keep login credentials confidential and use reasonable safeguards, including multi-factor authentication when available.',
          'Limit each account to its assigned user and promptly remove access for people who no longer need it.',
          'Notify us promptly if you suspect unauthorized access, credential compromise, or misuse.',
          'Remain responsible for activity performed through your accounts and for the conduct of your authorized users.',
        ],
      },
      {
        heading: '3. The Services',
        paragraphs: [
          'NexoraNow provides a modular business platform that may include customer management, fleet operations, maintenance, messaging, websites, commerce, appointments, payments, reporting, automation, AI-assisted tools, and third-party integrations. Available modules and usage limits depend on your plan and the modules enabled for your business.',
          'We may improve, update, or replace features over time. We will not materially reduce paid core functionality during a current subscription term without reasonable notice, except when needed for security, legal compliance, third-party platform changes, or prevention of harm.',
        ],
      },
      {
        heading: '4. Customer data and instructions',
        paragraphs: [
          'Customer retains ownership of data, files, images, messages, business records, and other content submitted to the Services ("Customer Data"). Customer grants NexoraNow a limited right to host, copy, transmit, process, display, and otherwise use Customer Data only as necessary to provide, secure, support, and improve the Services, comply with law, and follow documented customer instructions.',
          'Customer is responsible for having all permissions, notices, consents, and lawful bases needed to collect and submit Customer Data, including employee, driver, customer, Slack, vehicle, image, and communications data. Customer must not direct NexoraNow to process data unlawfully.',
          'Where NexoraNow processes personal data on Customer’s behalf, the Data Processing Addendum is incorporated into these Terms.',
        ],
      },
      {
        heading: '5. Acceptable use',
        paragraphs: [
          'You must comply with the Acceptable Use Policy, which is incorporated into these Terms. You may not use the Services to break the law, violate another person’s rights, compromise security, distribute harmful content, evade usage limits, or create unreasonable risk for NexoraNow, our providers, or other users.',
        ],
      },
      {
        heading: '6. AI-assisted features',
        paragraphs: [
          'Some Services use artificial intelligence to generate, classify, summarize, extract, recommend, or analyze content. AI output can be incomplete, inaccurate, or unsuitable for a particular purpose. You must review output before relying on it, especially for vehicle safety, damage, maintenance, financial, employment, legal, medical, or other consequential decisions.',
          'AI output is decision support, not a warranty, professional opinion, final safety determination, or substitute for qualified human inspection. The AI Transparency Notice provides more detail and is incorporated into these Terms.',
        ],
      },
      {
        heading: '7. Third-party services',
        paragraphs: [
          'The Services may connect to third-party products such as Slack, Google AI services, payment processors, email providers, cloud infrastructure, and other integrations selected by Customer. Third-party products are governed by their own terms and privacy practices. Customer authorizes NexoraNow to exchange Customer Data with an enabled integration as needed to provide the requested functionality.',
          'NexoraNow is not responsible for third-party products, their availability, or changes they make to their APIs or services. We will use reasonable efforts to maintain supported integrations.',
        ],
      },
      {
        heading: '8. Fees, trials, and taxes',
        paragraphs: [
          'Paid plans are billed according to the order, checkout, or plan selection presented to Customer. Unless stated otherwise, subscriptions renew automatically for the same billing period until canceled. Customer authorizes charges to the selected payment method.',
          'Trials may be limited or changed and may convert to a paid subscription only when pricing and authorization are presented. Fees are non-refundable except as required by law or expressly stated in an order. Customer is responsible for applicable taxes other than taxes on NexoraNow’s net income.',
        ],
      },
      {
        heading: '9. Intellectual property',
        paragraphs: [
          'NexoraNow and its licensors own the Services, software, designs, documentation, models, workflows, and related intellectual property. Subject to these Terms and payment of applicable fees, NexoraNow grants Customer a limited, non-exclusive, non-transferable, revocable right to access and use the Services for its internal business operations.',
          'You may provide feedback. You grant NexoraNow a perpetual, worldwide, royalty-free right to use feedback without restriction or attribution, provided it does not identify Customer or disclose Customer Confidential Information.',
        ],
      },
      {
        heading: '10. Confidentiality and security',
        paragraphs: [
          'Each party may receive non-public information that should reasonably be understood as confidential. The receiving party will protect it using reasonable care, use it only for the agreement, and disclose it only to people who need it and are bound by confidentiality duties.',
          'NexoraNow maintains administrative, technical, and organizational safeguards designed to protect Customer Data. No online service can guarantee absolute security. Customer is responsible for appropriate account configuration, permissions, endpoint security, backups or exports appropriate to its risk, and the lawful use of downloaded data.',
        ],
      },
      {
        heading: '11. Suspension and termination',
        paragraphs: [
          'Customer may stop using the Services or cancel a subscription according to the applicable plan. We may suspend or restrict access when reasonably necessary to address a security threat, unlawful activity, material breach, nonpayment, harm to the Services or others, or a binding legal request. When practical, we will provide notice and an opportunity to cure.',
          'After termination, Customer access ends. We may retain or delete Customer Data according to the Privacy Policy, Data Processing Addendum, applicable law, and any agreed export period. Sections that by their nature should survive will survive, including payment obligations, confidentiality, intellectual property, disclaimers, limitations, and dispute terms.',
        ],
      },
      {
        heading: '12. Disclaimers',
        paragraphs: [
          'To the maximum extent permitted by law, the Services are provided "as is" and "as available." NexoraNow disclaims implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement. We do not warrant uninterrupted or error-free operation, that every defect will be corrected, or that AI output, third-party integrations, or customer-configured workflows will be accurate or suitable for every use.',
          'Nothing in these Terms excludes warranties or rights that cannot lawfully be excluded.',
        ],
      },
      {
        heading: '13. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, neither party will be liable for indirect, incidental, special, exemplary, punitive, or consequential damages, or for lost profits, revenue, goodwill, business interruption, or lost data, even if advised of the possibility.',
          'Except for payment obligations, misuse of the other party’s intellectual property, breach of confidentiality, indemnification obligations, fraud, willful misconduct, or liability that cannot lawfully be limited, each party’s total liability arising from the Services will not exceed the fees paid or payable by Customer for the Services during the 12 months before the event giving rise to the claim.',
        ],
      },
      {
        heading: '14. Indemnification',
        paragraphs: [
          'Customer will defend and indemnify NexoraNow from third-party claims arising from Customer Data, Customer’s unlawful or unauthorized use of the Services, Customer’s violation of the Acceptable Use Policy, or Customer’s failure to obtain required rights or consents. NexoraNow will promptly notify Customer and allow reasonable control of the defense, subject to NexoraNow’s right to participate.',
        ],
      },
      {
        heading: '15. Changes to these Terms',
        paragraphs: [
          'We may update these Terms to reflect changes to the Services, law, security practices, or business operations. We will post the effective date and provide reasonable notice of material changes. If a material change requires renewed acceptance, we will request it before continued use. Changes do not apply retroactively unless required by law.',
        ],
      },
      {
        heading: '16. General terms',
        paragraphs: [
          'Neither party may assign this agreement without the other party’s consent, except in connection with a merger, acquisition, reorganization, or sale of substantially all relevant assets, provided the successor assumes the agreement. Customer may not assign to a direct competitor of NexoraNow without consent.',
          'The laws applicable at NexoraNow’s principal place of business govern these Terms, without regard to conflict-of-law rules. Courts with jurisdiction over that location will have exclusive jurisdiction unless applicable law requires another forum. Before filing a claim, each party will try in good faith for 30 days to resolve the dispute informally.',
          'These Terms, the incorporated policies, and any order form are the entire agreement about the Services. If a provision is unenforceable, it will be modified only as needed and the rest remains effective. Failure to enforce a provision is not a waiver. Notices may be delivered electronically.',
        ],
      },
      {
        heading: '17. Contact',
        paragraphs: [`Questions about these Terms may be sent to ${LEGAL_CONTACT_EMAIL}.`],
      },
    ],
  },
  privacy: {
    key: 'privacy',
    shortTitle: 'Privacy',
    title: 'Privacy Policy',
    description: 'How NexoraNow collects, uses, shares, and protects personal information.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: '1. Scope and our role',
        paragraphs: [
          'This Privacy Policy explains how NexoraNow handles personal information when you visit our websites, create or use an account, communicate with us, or use the NexoraNow platform.',
          'For account, billing, website, support, and service-improvement information, NexoraNow generally acts as the business or controller that determines why and how information is processed. For personal information a business customer submits or connects to its workspace, NexoraNow generally acts as a service provider or processor on that customer’s instructions. The customer’s own privacy notice applies to that customer-controlled data.',
        ],
      },
      {
        heading: '2. Information we collect',
        items: [
          'Account and identity information, such as name, email address, phone number, role, password credentials handled by our authentication provider, and workspace membership.',
          'Business and workspace information, such as business name, industry, address, modules, configuration, staff records, customer records, fleet records, inspections, maintenance records, files, notes, and communications.',
          'Content and integration data, such as Slack workspace, channel, user, message, and file identifiers; uploaded images; AI prompts and output; website content; appointment data; order data; and data from services you connect.',
          'Transaction information, such as plan, subscription status, invoices, and limited payment metadata. Full payment card details are generally handled by payment processors rather than stored by NexoraNow.',
          'Device and usage information, such as IP address, browser, device, timestamps, pages or features used, diagnostic events, security logs, and cookie or session identifiers.',
          'Support and communications information, such as messages, feedback, call notes, and records needed to resolve a request.',
          'Consent evidence, such as the legal document versions accepted, account type, timestamp, signup source, IP address, and browser user agent.',
        ],
      },
      {
        heading: '3. Sources of information',
        items: [
          'Directly from you when you register, configure a workspace, upload content, or contact us.',
          'From your employer, business administrator, or another user who invites you or provides data about you.',
          'From connected services that you authorize, such as Slack, payment providers, email services, and cloud platforms.',
          'Automatically from browsers, devices, cookies, server logs, and security systems.',
          'From service providers and public sources when needed for fraud prevention, security, support, or business operations.',
        ],
      },
      {
        heading: '4. How we use information',
        items: [
          'Provide, personalize, maintain, and support the Services.',
          'Authenticate users, manage permissions, and secure accounts and infrastructure.',
          'Process customer instructions, files, integrations, inspections, transactions, communications, and AI-assisted workflows.',
          'Operate subscriptions, billing, customer support, service notices, and requested communications.',
          'Monitor performance, diagnose errors, prevent abuse, and improve reliability and user experience.',
          'Develop and improve features using aggregated, de-identified, or appropriately controlled data.',
          'Comply with law, enforce agreements, protect rights and safety, and respond to lawful requests.',
          'Send marketing communications where permitted. You can opt out of marketing messages at any time.',
        ],
      },
      {
        heading: '5. Legal bases',
        paragraphs: [
          'Where a legal basis is required, we process personal information to perform a contract, take requested pre-contract steps, comply with legal obligations, protect vital interests, pursue legitimate interests such as security and service improvement, or with consent. You may withdraw consent when processing depends on consent, without affecting earlier lawful processing.',
        ],
      },
      {
        heading: '6. How we disclose information',
        items: [
          'To the business customer that controls your workspace and its authorized users.',
          'To infrastructure, hosting, authentication, storage, database, communications, support, analytics, AI, and payment providers that help operate the Services.',
          'To third-party integrations enabled or directed by a customer or user.',
          'To professional advisers, auditors, insurers, and transaction counterparties subject to appropriate duties.',
          'To government authorities or other parties when reasonably necessary to comply with law, protect rights or safety, investigate fraud, or enforce agreements.',
          'In connection with a merger, financing, acquisition, reorganization, bankruptcy, or sale of assets, subject to appropriate confidentiality protections.',
        ],
      },
      {
        heading: '7. Sale and targeted advertising',
        paragraphs: [
          'NexoraNow does not sell personal information for money. We do not use personal information from the Services to serve cross-context behavioral advertising. If our practices change, we will update this Policy and provide any choices required by law.',
        ],
      },
      {
        heading: '8. AI processing',
        paragraphs: [
          'When an AI feature is used, relevant prompts, images, records, and context may be sent to an AI service provider to generate the requested output. We limit the information sent to what is reasonably needed for the feature and configure providers according to available business and data-protection controls. AI output and related logs may be retained for reliability, safety, audit, and support according to applicable settings and contracts.',
          'Do not submit highly sensitive information to an AI feature unless the feature and your organization’s policy specifically permit it. See the AI Transparency Notice for additional details.',
        ],
      },
      {
        heading: '9. Retention',
        paragraphs: [
          'We retain personal information for as long as needed to provide the Services, maintain business and security records, meet contractual commitments, resolve disputes, and comply with law. Retention varies by data type, account status, customer instructions, backup cycles, and legal requirements.',
          'A business customer may control retention or deletion of Customer Data. We may retain limited records after account closure when necessary for fraud prevention, security, billing, legal compliance, or proof of consent. When information is no longer needed, we delete, de-identify, or securely isolate it.',
        ],
      },
      {
        heading: '10. Security',
        paragraphs: [
          'We use administrative, technical, and organizational safeguards designed to protect personal information, including access controls, encryption in transit, logging, tenant isolation, credential protections, and service-provider controls. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.',
        ],
      },
      {
        heading: '11. International transfers',
        paragraphs: [
          'NexoraNow and our providers may process information in countries other than where you live. Where required, we use recognized transfer mechanisms and contractual safeguards intended to protect personal information across borders.',
        ],
      },
      {
        heading: '12. Your privacy rights',
        paragraphs: [
          'Depending on where you live, you may have rights to request access, correction, deletion, portability, restriction, or objection; withdraw consent; opt out of certain disclosures or automated processing; and appeal a denied request. You may also have a right to complain to a privacy regulator.',
          'If your information is controlled by a NexoraNow business customer, submit your request to that business first. We will assist the customer as required. We may verify identity and authority before completing a request. Authorized agents may submit requests where permitted by law.',
          `To make a request about information controlled by NexoraNow, email ${PRIVACY_CONTACT_EMAIL}. We will not discriminate against you for exercising applicable privacy rights.`,
        ],
      },
      {
        heading: '13. Children',
        paragraphs: [
          'The Services are intended for businesses and adults. They are not directed to children under 13, and we do not knowingly collect personal information directly from children under 13. Business customers must not use the Services to collect children’s information without all legally required permissions and safeguards.',
        ],
      },
      {
        heading: '14. Changes to this Policy',
        paragraphs: [
          'We may update this Policy as our Services and legal obligations change. We will post the new effective date and provide additional notice when required. Material changes do not apply retroactively unless permitted by law.',
        ],
      },
      {
        heading: '15. Contact',
        paragraphs: [
          `Privacy questions and requests may be sent to ${PRIVACY_CONTACT_EMAIL}. General legal questions may be sent to ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  'acceptable-use': {
    key: 'acceptable-use',
    shortTitle: 'Acceptable Use',
    title: 'Acceptable Use Policy',
    description: 'Rules that protect customers, users, integrations, and the NexoraNow platform.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: '1. Purpose',
        paragraphs: [
          'This Acceptable Use Policy applies to all access to and use of the Services. It is part of the Terms of Use. Customer is responsible for its users, connected systems, Customer Data, and activity performed through its workspace.',
        ],
      },
      {
        heading: '2. Prohibited unlawful or harmful use',
        items: [
          'Break any law or regulation, violate court orders, or facilitate illegal activity.',
          'Infringe privacy, publicity, intellectual property, confidentiality, contractual, or other rights.',
          'Harass, threaten, exploit, discriminate against, defame, or facilitate harm to a person or group.',
          'Upload or distribute unlawful, fraudulent, deceptive, abusive, or malicious content.',
          'Collect or process highly sensitive information without a lawful purpose and appropriate safeguards.',
        ],
      },
      {
        heading: '3. Security and platform integrity',
        items: [
          'Probe, scan, test, or exploit a vulnerability without prior written authorization.',
          'Bypass authentication, permissions, tenant isolation, rate limits, plan limits, or technical safeguards.',
          'Introduce malware, destructive code, credential theft, phishing, denial-of-service activity, or unauthorized automation.',
          'Access another customer’s data or account, scrape the Services, or reverse engineer protected components except where law expressly allows it.',
          'Use the Services in a way that unreasonably burdens, disrupts, degrades, or interferes with systems or other users.',
          'Share credentials, misrepresent identity or authority, or conceal the origin of abusive activity.',
        ],
      },
      {
        heading: '4. Communications and integrations',
        items: [
          'Do not send spam, unlawful marketing, deceptive messages, or communications without required consent.',
          'Respect opt-outs, channel permissions, platform rules, and third-party API terms.',
          'Do not upload, download, or analyze Slack files, images, messages, or user data unless authorized by the relevant business and workspace.',
          'Do not use payment, messaging, email, or website modules for fraud, evasion, impersonation, or prohibited goods and services.',
        ],
      },
      {
        heading: '5. AI use',
        items: [
          'Do not use AI features to generate illegal content, malware, fraud, impersonation, targeted harassment, or instructions designed to cause harm.',
          'Do not present AI output as a guaranteed safety, repair, legal, medical, employment, credit, insurance, or financial determination.',
          'Do not use AI output as the sole basis for a high-impact decision about a person.',
          'Review AI output and maintain appropriate human oversight for consequential workflows.',
        ],
      },
      {
        heading: '6. Enforcement',
        paragraphs: [
          'We may investigate suspected violations and may remove content, limit features, suspend access, or terminate accounts when reasonably necessary. We may preserve and disclose information when required by law or needed to protect the Services, users, or others. When appropriate, we will notify Customer and provide an opportunity to correct the issue.',
          `Report suspected abuse or security issues to ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  'ai-notice': {
    key: 'ai-notice',
    shortTitle: 'AI Notice',
    title: 'AI Transparency Notice',
    description: 'How AI-assisted features work, their limits, and the human review expected.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: '1. Where AI is used',
        paragraphs: [
          'NexoraNow may use AI models and automated systems to analyze images, classify vehicle damage, identify records, extract information, summarize activity, generate website or marketing content, recommend actions, answer questions, and support other enabled workflows.',
        ],
      },
      {
        heading: '2. Inputs and outputs',
        paragraphs: [
          'AI inputs may include prompts, uploaded images, Slack files and message context, vehicle or inspection records, website content, business settings, and other information selected by a user or workflow. Relevant inputs may be sent to contracted AI providers to produce output.',
          'AI output is probabilistic. Similar inputs can produce different results, and output may be inaccurate, incomplete, outdated, biased, or unsuitable. Confidence values and labels are estimates, not guarantees.',
        ],
      },
      {
        heading: '3. Vehicle damage and maintenance',
        paragraphs: [
          'Vehicle damage ratings, part identification, repair suggestions, and maintenance recommendations are screening and workflow tools. They do not replace an in-person inspection by a qualified mechanic, body technician, safety professional, insurer, or fleet manager.',
          'A no-damage or low-severity result does not establish that a vehicle is safe to operate. Level 3 or other severe results require human review, but lower ratings may also require review when images are unclear, vehicle behavior is abnormal, or safety concerns exist.',
        ],
      },
      {
        heading: '4. Human oversight',
        items: [
          'Review consequential AI output before acting on it.',
          'Use available correction, review, and note tools to document the final human decision.',
          'Do not use AI output as the sole basis for employment discipline, credit, insurance, eligibility, legal, medical, or similarly significant decisions.',
          'Escalate uncertain, low-confidence, conflicting, or safety-related results to a qualified person.',
        ],
      },
      {
        heading: '5. Data and providers',
        paragraphs: [
          'NexoraNow uses third-party model and infrastructure providers for some AI functions. Provider processing is governed by our contracts and their applicable service terms. Customer controls whether optional AI modules and integrations are enabled and is responsible for ensuring submitted data is appropriate for those services.',
          'We may keep prompts, output, model identifiers, confidence values, errors, and review actions for service delivery, audit, security, debugging, and improvement. See the Privacy Policy and Data Processing Addendum for more information.',
        ],
      },
      {
        heading: '6. Reporting concerns',
        paragraphs: [
          `If an AI result appears unsafe, discriminatory, materially inaccurate, or inconsistent with a human inspection, stop relying on it, preserve the relevant record, and contact ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  'data-processing-addendum': {
    key: 'data-processing-addendum',
    shortTitle: 'Data Processing',
    title: 'Data Processing Addendum',
    description:
      'Data protection terms for business customers using NexoraNow to process personal data.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: '1. Scope and roles',
        paragraphs: [
          'This Data Processing Addendum ("DPA") forms part of the Terms of Use between the business customer ("Customer") and NexoraNow. It applies when NexoraNow processes personal data on Customer’s behalf in providing the Services.',
          'Customer is the controller or business, and NexoraNow is the processor or service provider, as those terms are defined by applicable data protection law. Each party will comply with its own legal obligations. Terms not defined here have the meaning in the Terms of Use or applicable law.',
        ],
      },
      {
        heading: '2. Customer instructions',
        paragraphs: [
          'NexoraNow will process personal data only to provide, secure, support, and improve the Services; comply with the agreement and documented Customer instructions; and meet legal obligations. The agreement, Customer’s configuration, and authorized use of the Services are Customer’s documented instructions.',
          'Customer is responsible for the lawfulness of its instructions, notices, consents, and data collection. NexoraNow will notify Customer if an instruction appears to violate applicable data protection law, unless legally prohibited.',
        ],
      },
      {
        heading: '3. Processing details',
        items: [
          'Subject matter: operation and support of the modules, integrations, websites, automations, storage, analytics, and AI features selected by Customer.',
          'Duration: the subscription term plus the period needed for deletion, return, backup cycling, dispute resolution, or legal compliance.',
          'Nature and purpose: collection, hosting, organization, retrieval, transmission, analysis, generation, classification, support, security, deletion, and other processing directed through the Services.',
          'Data subjects: Customer’s users, staff, drivers, customers, prospects, vendors, website visitors, contacts, invitees, and other individuals whose data Customer submits.',
          'Data types: identity and contact data, account and role data, business records, messages, Slack metadata and files, images, vehicle and inspection records, maintenance data, appointments, orders, transaction metadata, website activity, support data, and AI inputs and outputs.',
          'Sensitive data: not intended unless a specific feature and written agreement permit it. Customer must not submit regulated health, biometric, precise location, government identifier, financial account, or similarly sensitive data without confirming the Services are suitable and lawful for that processing.',
        ],
      },
      {
        heading: '4. Confidentiality and security',
        paragraphs: [
          'NexoraNow will ensure people authorized to process personal data are bound by confidentiality duties. NexoraNow will maintain appropriate technical and organizational measures designed to protect personal data based on the nature of processing, available technology, implementation cost, and risks to individuals.',
        ],
        items: [
          'Access controls and role-based permissions.',
          'Encryption in transit and appropriate storage protections.',
          'Tenant separation and service authentication controls.',
          'Logging, monitoring, vulnerability management, backups, and recovery practices appropriate to the Services.',
          'Incident response and personnel or provider confidentiality controls.',
          'Periodic review of safeguards and data minimization practices.',
        ],
      },
      {
        heading: '5. Subprocessors',
        paragraphs: [
          'Customer authorizes NexoraNow to use subprocessors for hosting, databases, storage, authentication, communications, payments, support, analytics, and AI functions. NexoraNow will require subprocessors to protect personal data through written obligations appropriate to their services.',
          'NexoraNow remains responsible for subprocessor performance to the extent required by applicable law. Customer may object to a new subprocessor on reasonable data-protection grounds by contacting us promptly after notice. The parties will work in good faith on a commercially reasonable resolution.',
        ],
      },
      {
        heading: '6. Individual rights and assistance',
        paragraphs: [
          'Taking into account the nature of processing, NexoraNow will reasonably assist Customer with requests from individuals to exercise privacy rights. If NexoraNow receives a request concerning Customer-controlled data, we may direct the requester to Customer unless law requires otherwise.',
          'NexoraNow will provide reasonable information to help Customer complete legally required impact assessments, consultations, security reviews, and compliance inquiries, considering the information available to NexoraNow.',
        ],
      },
      {
        heading: '7. Security incidents',
        paragraphs: [
          'NexoraNow will notify Customer without undue delay after confirming unauthorized access to or acquisition, alteration, loss, or disclosure of Customer personal data for which notice is required by applicable law. Notice will include available information reasonably needed for Customer’s response and will be updated as appropriate.',
          'Notification is not an admission of fault or liability. Customer is responsible for notifications to individuals and regulators unless law assigns that duty to NexoraNow.',
        ],
      },
      {
        heading: '8. Return and deletion',
        paragraphs: [
          'At the end of the Services, NexoraNow will delete or return Customer personal data upon Customer’s reasonable request, unless retention is required by law or permitted for security, backup, dispute, or compliance purposes. Data in backups will be protected and deleted through normal backup cycles.',
        ],
      },
      {
        heading: '9. International transfers',
        paragraphs: [
          'If Customer personal data is transferred across borders in a way that requires a transfer mechanism, the parties will use an applicable lawful mechanism, which may include standard contractual clauses and supplementary safeguards. Customer authorizes processing in locations used by NexoraNow and its approved subprocessors subject to these protections.',
        ],
      },
      {
        heading: '10. Audits',
        paragraphs: [
          'NexoraNow will make available information reasonably necessary to demonstrate compliance with this DPA. Customer may request a reasonable audit no more than once per year, or after a confirmed material security incident, subject to confidentiality, security, non-disruption, and cost-allocation terms. Third-party reports or certifications may satisfy the request where appropriate.',
        ],
      },
      {
        heading: '11. U.S. state privacy terms',
        paragraphs: [
          'Where U.S. state privacy law applies, NexoraNow acts as Customer’s service provider or processor. NexoraNow will not sell Customer personal data, share it for cross-context behavioral advertising, retain or use it outside the business purposes in the agreement, or combine it with personal data received from another source except as permitted by applicable law.',
        ],
      },
      {
        heading: '12. Order of precedence and contact',
        paragraphs: [
          'If this DPA conflicts with the Terms of Use on processing Customer personal data, this DPA controls. All other provisions of the Terms remain in effect.',
          `Data protection questions may be sent to ${PRIVACY_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  'cookie-policy': {
    key: 'cookie-policy',
    shortTitle: 'Cookies',
    title: 'Cookie Policy',
    description: 'How NexoraNow uses cookies and similar local technologies.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: '1. What cookies are',
        paragraphs: [
          'Cookies are small text files stored by a browser. We also may use local storage and similar technologies. These tools can keep you signed in, preserve settings, protect accounts, and help the Services operate reliably.',
        ],
      },
      {
        heading: '2. How we use them',
        items: [
          'Strictly necessary cookies for authentication, session refresh, security, routing, tenant selection, and requested features.',
          'Preference storage for interface, accessibility, workspace, and consent settings.',
          'Limited performance and diagnostic storage used to understand errors, reliability, and feature operation.',
        ],
      },
      {
        heading: '3. Third-party technologies',
        paragraphs: [
          'Enabled integrations and embedded services may set their own cookies or storage according to their policies. Examples can include authentication, payment, communications, or embedded content providers. NexoraNow does not control cookies set directly by an independent third party.',
        ],
      },
      {
        heading: '4. Your choices',
        paragraphs: [
          'You can use browser controls to delete or block cookies. Blocking strictly necessary cookies may prevent sign-in, session security, tenant routing, checkout, or other requested features from working. Where non-essential cookies require consent, we will provide the choices required by applicable law.',
        ],
      },
      {
        heading: '5. Contact',
        paragraphs: [
          `Questions about cookies and privacy may be sent to ${PRIVACY_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
}

export const LEGAL_DOCUMENT_ORDER: LegalDocumentKey[] = [
  'terms',
  'privacy',
  'acceptable-use',
  'ai-notice',
  'data-processing-addendum',
  'cookie-policy',
]

export function getLegalDocument(key: string): LegalDocument | null {
  return key in LEGAL_DOCUMENTS ? LEGAL_DOCUMENTS[key as LegalDocumentKey] : null
}

export function getPlatformLegalUrl(key: LegalDocumentKey): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
  return `${appUrl}/legal/${key}`
}
