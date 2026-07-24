'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react'
import {
  getEligibleJoinedSlackChannels,
  searchSlackChannels,
  validateSlackChannelSelection,
  type SlackChannelOption,
} from '@/lib/slack/channel-selection'

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

type ChannelHealth = {
  healthy: boolean
  issues: string[]
  missingScopes: string[]
  lastInspectionUploadAt: string | null
  lastInspectionStatus: string | null
  lastMaintenanceMessageAt: string | null
  lastMaintenanceStatus: string | null
}

export function SlackSettingsClient({
  businessId,
  initialIntegration,
}: {
  businessId: string
  initialIntegration: Integration
}) {
  const [integration, setIntegration] = useState(initialIntegration)
  const [channels, setChannels] = useState<SlackChannelOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [maintenanceChannelId, setMaintenanceChannelId] = useState<string | null>(null)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')
  const [health, setHealth] = useState<ChannelHealth | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const connectUrl = useMemo(
    () => `/api/integrations/slack/oauth/start?businessId=${encodeURIComponent(businessId)}`,
    [businessId]
  )

  const loadChannels = useCallback(
    async (signal?: AbortSignal) => {
      if (!integration.connected) return
      const response = await fetch(
        `/api/integrations/slack/channels?businessId=${encodeURIComponent(businessId)}`,
        { signal, cache: 'no-store' }
      )
      const result = (await response.json()) as {
        channels?: SlackChannelOption[]
        maintenanceEnabled?: boolean
        health?: ChannelHealth
        error?: string
      }
      if (!response.ok) throw new Error(result.error ?? 'Unable to load channels')
      const list = result.channels ?? []
      setChannels(list)
      setSelected(new Set(list.filter((channel) => channel.selected).map((channel) => channel.id)))
      setMaintenanceChannelId(list.find((channel) => channel.maintenanceSelected)?.id ?? null)
      setMaintenanceEnabled(Boolean(result.maintenanceEnabled))
      setHealth(result.health ?? null)
    },
    [businessId, integration.connected]
  )

  useEffect(() => {
    if (!integration.connected) return
    const controller = new AbortController()
    void loadChannels(controller.signal).catch((error) => {
      if (error?.name !== 'AbortError') setMessage(error.message)
    })
    return () => controller.abort()
  }, [integration.connected, loadChannels])

  async function refreshChannels() {
    setBusy('refresh')
    setMessage(null)
    try {
      await loadChannels()
      setMessage('Slack channels and configuration health refreshed.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to refresh channels.')
    } finally {
      setBusy(null)
    }
  }

  async function testConnection() {
    setBusy('test')
    setMessage(null)
    const response = await fetch('/api/integrations/slack/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    })
    const result = (await response.json()) as { error?: string }
    setMessage(
      response.ok ? 'Slack connection is healthy.' : (result.error ?? 'Connection test failed.')
    )
    setBusy(null)
  }

  async function disconnect(remove: boolean) {
    setBusy(remove ? 'delete' : 'disconnect')
    setMessage(null)
    const response = await fetch('/api/integrations/slack/disconnect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, delete: remove }),
    })
    const result = (await response.json()) as { error?: string }
    if (response.ok) {
      setIntegration({ connected: false })
      setChannels([])
      setSelected(new Set())
      setMaintenanceChannelId(null)
      setMaintenanceEnabled(false)
      setHealth(null)
    }
    setMessage(
      response.ok
        ? remove
          ? 'Slack connection deleted.'
          : 'Slack disconnected.'
        : (result.error ?? 'Unable to disconnect.')
    )
    setBusy(null)
  }

  async function saveChannels() {
    const validationError = validateSlackChannelSelection({
      inspectionChannelIds: selected,
      maintenanceChannelId,
      maintenanceEnabled,
    })
    if (validationError) {
      setMessage(validationError)
      return
    }
    setBusy('channels')
    setMessage(null)
    const response = await fetch('/api/integrations/slack/channels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId,
        channelIds: [...selected],
        maintenanceChannelId,
        maintenanceEnabled,
      }),
    })
    const result = (await response.json()) as { error?: string }
    setMessage(
      response.ok
        ? `${selected.size} inspection channel${selected.size === 1 ? '' : 's'} saved. Maintenance ingestion is ${maintenanceEnabled ? 'enabled' : 'disabled'}.`
        : (result.error ?? 'Unable to save channels.')
    )
    if (response.ok) await loadChannels()
    setBusy(null)
  }

  async function testChannelConfiguration() {
    setBusy('channel-test')
    setMessage(null)
    const response = await fetch('/api/integrations/slack/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, action: 'test_configuration' }),
    })
    const result = (await response.json()) as {
      healthy?: boolean
      issues?: string[]
      error?: string
    }
    setMessage(
      result.healthy
        ? 'Channel routing is healthy.'
        : result.issues?.join(' ') || result.error || 'Channel routing needs attention.'
    )
    await loadChannels().catch(() => undefined)
    setBusy(null)
  }

  const joinedChannels = useMemo(() => getEligibleJoinedSlackChannels(channels), [channels])
  const availableMaintenanceChannels = useMemo(
    () => searchSlackChannels(joinedChannels, channelSearch),
    [channelSearch, joinedChannels]
  )
  const selectedMaintenance = channels.find((channel) => channel.id === maintenanceChannelId)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-graphite-800 p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="rounded-xl bg-[#4A154B]/30 p-3">
              <MessageSquare className="h-6 w-6 text-fuchsia-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-white">Slack workspace</h2>
                {integration.connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              </div>
              <p className="mt-1 text-sm text-white/45">
                {integration.connected
                  ? integration.workspaceName || integration.teamId
                  : 'No workspace connected'}
              </p>
              {integration.connected && (
                <dl className="mt-4 grid gap-2 text-xs text-white/50 sm:grid-cols-2">
                  <div>
                    Team ID: <span className="text-white/75">{integration.teamId}</span>
                  </div>
                  <div>
                    Bot user: <span className="text-white/75">{integration.botUserId ?? '—'}</span>
                  </div>
                  <div>
                    Token:{' '}
                    <span className="text-white/75">••••{integration.tokenLast4 ?? '—'}</span>
                  </div>
                  <div>
                    Connected:{' '}
                    <span className="text-white/75">
                      {integration.connectedAt
                        ? new Date(integration.connectedAt).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    Last event:{' '}
                    <span className="text-white/75">
                      {integration.lastEventAt
                        ? new Date(integration.lastEventAt).toLocaleString()
                        : 'None'}
                    </span>
                  </div>
                </dl>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={connectUrl}
              className="rounded-lg bg-fuchsia-500 px-3 py-2 text-sm font-medium text-white hover:bg-fuchsia-400"
            >
              {integration.connected ? 'Reconnect' : 'Connect Slack'}
            </a>
            {integration.connected && (
              <>
                <button
                  onClick={testConnection}
                  disabled={Boolean(busy)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                >
                  <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />
                  Test
                </button>
                <button
                  onClick={() => disconnect(false)}
                  disabled={Boolean(busy)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                >
                  <Unplug className="mr-1.5 inline h-3.5 w-3.5" />
                  Disconnect
                </button>
                <button
                  onClick={() => disconnect(true)}
                  disabled={Boolean(busy)}
                  className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10"
                >
                  <Trash2 className="mr-1.5 inline h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
        {integration.scopes?.length ? (
          <p className="mt-5 text-xs text-white/35">Scopes: {integration.scopes.join(', ')}</p>
        ) : null}
        {integration.lastError && (
          <p className="mt-3 rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-300">
            {integration.lastError}
          </p>
        )}
        {health && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 ${health.healthy ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-amber-300/20 bg-amber-300/[0.06]'}`}
          >
            <div className="flex items-center gap-2 text-sm">
              {health.healthy ? (
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-200" />
              )}
              <span className={health.healthy ? 'text-emerald-200' : 'text-amber-100'}>
                Configuration {health.healthy ? 'healthy' : 'needs attention'}
              </span>
            </div>
            {health.issues.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-100/70">
                {health.issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {integration.connected && (
        <section className="rounded-2xl border border-white/10 bg-graphite-800 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Van Inspection Image Channels</h2>
              <p className="mt-1 text-sm text-white/45">
                Images posted in these channels create vehicle inspections and run damage analysis.
              </p>
              <p className="mt-2 text-xs text-white/35">
                Last processed inspection upload:{' '}
                {health?.lastInspectionUploadAt
                  ? `${new Date(health.lastInspectionUploadAt).toLocaleString()} · ${health.lastInspectionStatus ?? 'processed'}`
                  : 'None'}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshChannels}
              disabled={Boolean(busy)}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5 disabled:opacity-40"
            >
              <RefreshCw
                className={`mr-1.5 inline h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>
          <div className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-2">
            {joinedChannels.length === 0 && (
              <p className="text-sm text-white/35">
                No visible channels. Invite the Slack bot to a channel, then reconnect or reload.
              </p>
            )}
            {joinedChannels.map((channel) => (
              <label
                key={channel.id}
                className={`flex items-center justify-between rounded-lg border border-white/8 px-3 py-2 ${channel.isArchived || !channel.isAccessible ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-white/[0.03]'}`}
              >
                <span className="text-sm text-white/75">
                  #{channel.name}{' '}
                  <span className="text-xs text-white/30">
                    {channel.isPrivate ? 'private' : 'public'}
                    {channel.isArchived ? ' · archived' : ''}
                    {!channel.isAccessible ? ' · inaccessible' : ''}
                    {channel.isMember ? '' : ' · bot not joined'}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={selected.has(channel.id)}
                  onChange={(event) =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.add(channel.id)
                      else next.delete(channel.id)
                      return next
                    })
                  }
                  className="h-4 w-4 accent-fuchsia-500 disabled:opacity-30"
                />
              </label>
            ))}
          </div>
          <button
            onClick={saveChannels}
            disabled={Boolean(busy)}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-graphite-950 disabled:opacity-50"
          >
            {busy === 'channels' && <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />}Save
            channels
          </button>
          <div className="mt-7 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Maintenance Reporting Channel</h2>
                <p className="mt-1 text-sm text-white/45">
                  Messages posted in this channel create Fleet maintenance records, notes, and
                  attachments.
                </p>
                <p className="mt-2 text-xs text-white/35">
                  Last processed maintenance message:{' '}
                  {health?.lastMaintenanceMessageAt
                    ? `${new Date(health.lastMaintenanceMessageAt).toLocaleString()} · ${health.lastMaintenanceStatus ?? 'processed'}`
                    : 'None'}
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65">
                <input
                  type="checkbox"
                  checked={maintenanceEnabled}
                  onChange={(event) => setMaintenanceEnabled(event.target.checked)}
                  className="h-4 w-4 accent-fuchsia-500"
                />
                Enable ingestion
              </label>
            </div>
            <p className="mt-1 text-sm text-white/45">
              Choose one dedicated channel. Top-level reports create maintenance items and thread
              replies become history notes.
            </p>
            <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/70">
              The maintenance channel must be different from the channels used to upload van
              inspection images.
            </p>
            <p className="mt-2 text-xs text-white/45">
              Maintenance-channel messages create maintenance records, not Van Damage AI
              inspections.
            </p>
            {selectedMaintenance && (
              <div
                className={`mt-4 rounded-xl border px-3 py-3 ${selectedMaintenance.isAccessible && !selectedMaintenance.isArchived && selectedMaintenance.isMember ? 'border-emerald-400/15 bg-emerald-400/[0.05]' : 'border-amber-300/20 bg-amber-300/[0.06]'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/80">Selected: #{selectedMaintenance.name}</p>
                    <p className="mt-1 text-xs text-white/35">
                      {selectedMaintenance.isPrivate ? 'Private' : 'Public'} ·{' '}
                      {selectedMaintenance.isArchived
                        ? 'Archived'
                        : selectedMaintenance.isAccessible
                          ? 'Accessible'
                          : 'Inaccessible'}{' '}
                      · {selectedMaintenance.isMember ? 'Bot joined' : 'Bot not joined'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMaintenanceEnabled(false)}
                    className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/50"
                  >
                    Disable
                  </button>
                </div>
              </div>
            )}
            <label className="focus-within:focus-ring mt-4 flex min-h-11 items-center rounded-xl border border-white/10 bg-graphite-900 px-3">
              <Search className="mr-2 h-4 w-4 text-white/30" />
              <span className="sr-only">Search Slack channels</span>
              <input
                value={channelSearch}
                onChange={(event) => setChannelSearch(event.target.value)}
                placeholder="Search available Slack channels"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
              />
            </label>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-2">
              {availableMaintenanceChannels.length === 0 && (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/30">
                  No available joined channels match this search.
                </p>
              )}
              {availableMaintenanceChannels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() => setMaintenanceChannelId(channel.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/8 px-3 py-2 text-left hover:bg-white/[0.03]"
                >
                  <span className="text-sm text-white/70">#{channel.name}</span>
                  <span className="text-xs text-white/30">
                    {channel.isPrivate ? 'private' : 'public'} · bot joined
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={saveChannels}
                disabled={Boolean(busy)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-graphite-950 disabled:opacity-50"
              >
                {busy === 'channels' && <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />}
                Save routing
              </button>
              <button
                onClick={testChannelConfiguration}
                disabled={Boolean(busy)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/65 hover:bg-white/5 disabled:opacity-50"
              >
                {busy === 'channel-test' && (
                  <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />
                )}
                Test routing
              </button>
            </div>
          </div>
        </section>
      )}
      {message && (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
          {message}
        </p>
      )}
    </div>
  )
}
