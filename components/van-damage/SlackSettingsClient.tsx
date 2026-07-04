'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, MessageSquare, RefreshCw, Trash2, Unplug } from 'lucide-react'

type Integration = {
  connected: boolean
  workspaceName?: string | null
  teamId?: string
  botUserId?: string | null
  scopes?: string[]
  connectedAt?: string
  lastEventAt?: string | null
  lastError?: string | null
  tokenLast4?: string | null
}

type Channel = { id: string; name: string; isPrivate: boolean; isMember: boolean; selected: boolean }

export function SlackSettingsClient({ businessId, initialIntegration }: { businessId: string; initialIntegration: Integration }) {
  const [integration, setIntegration] = useState(initialIntegration)
  const [channels, setChannels] = useState<Channel[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const connectUrl = useMemo(() => `/api/integrations/slack/oauth/start?businessId=${encodeURIComponent(businessId)}`, [businessId])

  useEffect(() => {
    if (!integration.connected) return
    const controller = new AbortController()
    fetch(`/api/integrations/slack/channels?businessId=${encodeURIComponent(businessId)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { channels?: Channel[]; error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Unable to load channels')
        const list = result.channels ?? []
        setChannels(list)
        setSelected(new Set(list.filter((channel) => channel.selected).map((channel) => channel.id)))
      })
      .catch((error) => { if (error?.name !== 'AbortError') setMessage(error.message) })
    return () => controller.abort()
  }, [businessId, integration.connected])

  async function testConnection() {
    setBusy('test'); setMessage(null)
    const response = await fetch('/api/integrations/slack/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId }),
    })
    const result = await response.json() as { error?: string }
    setMessage(response.ok ? 'Slack connection is healthy.' : result.error ?? 'Connection test failed.')
    setBusy(null)
  }

  async function disconnect(remove: boolean) {
    setBusy(remove ? 'delete' : 'disconnect'); setMessage(null)
    const response = await fetch('/api/integrations/slack/disconnect', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, delete: remove }),
    })
    const result = await response.json() as { error?: string }
    if (response.ok) { setIntegration({ connected: false }); setChannels([]); setSelected(new Set()) }
    setMessage(response.ok ? (remove ? 'Slack connection deleted.' : 'Slack disconnected.') : result.error ?? 'Unable to disconnect.')
    setBusy(null)
  }

  async function saveChannels() {
    setBusy('channels'); setMessage(null)
    const response = await fetch('/api/integrations/slack/channels', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, channelIds: [...selected] }),
    })
    const result = await response.json() as { error?: string }
    setMessage(response.ok ? `${selected.size} channel${selected.size === 1 ? '' : 's'} enabled.` : result.error ?? 'Unable to save channels.')
    setBusy(null)
  }

  return <div className="space-y-6">
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="rounded-xl bg-[#4A154B]/30 p-3"><MessageSquare className="h-6 w-6 text-fuchsia-300" /></div>
          <div>
            <div className="flex items-center gap-2"><h2 className="font-semibold text-white">Slack workspace</h2>{integration.connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}</div>
            <p className="mt-1 text-sm text-white/45">{integration.connected ? integration.workspaceName || integration.teamId : 'No workspace connected'}</p>
            {integration.connected && <dl className="mt-4 grid gap-2 text-xs text-white/50 sm:grid-cols-2">
              <div>Team ID: <span className="text-white/75">{integration.teamId}</span></div>
              <div>Bot user: <span className="text-white/75">{integration.botUserId ?? '—'}</span></div>
              <div>Token: <span className="text-white/75">••••{integration.tokenLast4 ?? '—'}</span></div>
              <div>Connected: <span className="text-white/75">{integration.connectedAt ? new Date(integration.connectedAt).toLocaleString() : '—'}</span></div>
              <div>Last event: <span className="text-white/75">{integration.lastEventAt ? new Date(integration.lastEventAt).toLocaleString() : 'None'}</span></div>
            </dl>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={connectUrl} className="rounded-lg bg-fuchsia-500 px-3 py-2 text-sm font-medium text-white hover:bg-fuchsia-400">{integration.connected ? 'Reconnect' : 'Connect Slack'}</a>
          {integration.connected && <>
            <button onClick={testConnection} disabled={Boolean(busy)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"><RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />Test</button>
            <button onClick={() => disconnect(false)} disabled={Boolean(busy)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"><Unplug className="mr-1.5 inline h-3.5 w-3.5" />Disconnect</button>
            <button onClick={() => disconnect(true)} disabled={Boolean(busy)} className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10"><Trash2 className="mr-1.5 inline h-3.5 w-3.5" />Delete</button>
          </>}
        </div>
      </div>
      {integration.scopes?.length ? <p className="mt-5 text-xs text-white/35">Scopes: {integration.scopes.join(', ')}</p> : null}
      {integration.lastError && <p className="mt-3 rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-300">{integration.lastError}</p>}
    </section>

    {integration.connected && <section className="rounded-2xl border border-white/10 bg-graphite-800 p-6">
      <h2 className="font-semibold text-white">Inspection channels</h2>
      <p className="mt-1 text-sm text-white/45">Only image messages in selected channels create inspections. No channels are selected automatically.</p>
      <div className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-2">
        {channels.length === 0 && <p className="text-sm text-white/35">No visible channels. Invite the Slack bot to a channel, then reconnect or reload.</p>}
        {channels.map((channel) => <label key={channel.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-white/8 px-3 py-2 hover:bg-white/[0.03]">
          <span className="text-sm text-white/75">#{channel.name} <span className="text-xs text-white/30">{channel.isPrivate ? 'private' : 'public'}{channel.isMember ? '' : ' · bot not joined'}</span></span>
          <input type="checkbox" disabled={!channel.isMember} checked={selected.has(channel.id)} onChange={(event) => setSelected((current) => {
            const next = new Set(current); if (event.target.checked) next.add(channel.id); else next.delete(channel.id); return next
          })} className="h-4 w-4 accent-fuchsia-500 disabled:opacity-30" />
        </label>)}
      </div>
      <button onClick={saveChannels} disabled={Boolean(busy)} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-graphite-950 disabled:opacity-50">
        {busy === 'channels' && <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />}Save channels
      </button>
    </section>}
    {message && <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">{message}</p>}
  </div>
}
