import Link from 'next/link'

const sections = [
  ['Overview', '/dashboard/rewards'],
  ['Programs', '/dashboard/rewards/programs'],
  ['Earning Rules', '/dashboard/rewards/rules'],
  ['Punch Cards', '/dashboard/rewards/punch-cards'],
  ['Rewards', '/dashboard/rewards/shop'],
  ['Customers', '/dashboard/rewards/customers'],
  ['Tiers', '/dashboard/rewards/tiers'],
  ['Promotions', '/dashboard/rewards/promotions'],
  ['Referrals', '/dashboard/rewards/referrals'],
  ['Analytics', '/dashboard/rewards/analytics'],
  ['Scanner', '/dashboard/rewards/scanner'],
  ['Settings', '/dashboard/rewards/settings'],
] as const

export default function RewardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav
        aria-label="Rewards administration"
        className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1.5 scrollbar-none"
      >
        {sections.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition hover:bg-white/8 hover:text-white active:scale-[0.98]"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
