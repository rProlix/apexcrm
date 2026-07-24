import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getEligibleJoinedSlackChannels,
  searchSlackChannels,
  validateSlackChannelSelection,
  type SlackChannelOption,
} from '../../slack/channel-selection'

const channels: SlackChannelOption[] = [
  {
    id: 'C-OPERATIONS',
    name: 'Fleet-Operations',
    isPrivate: false,
    isMember: true,
    isArchived: false,
    isAccessible: true,
    selected: true,
    maintenanceSelected: false,
  },
  {
    id: 'C-MAINTENANCE',
    name: 'maintenance-reports',
    isPrivate: true,
    isMember: true,
    isArchived: false,
    isAccessible: true,
    selected: false,
    maintenanceSelected: true,
  },
  {
    id: 'C-ARCHIVED',
    name: 'old-fleet',
    isPrivate: false,
    isMember: true,
    isArchived: true,
    isAccessible: true,
    selected: false,
    maintenanceSelected: false,
  },
  {
    id: 'C-INACCESSIBLE',
    name: 'leadership',
    isPrivate: true,
    isMember: true,
    isArchived: false,
    isAccessible: false,
    selected: false,
    maintenanceSelected: false,
  },
  {
    id: 'C-NOT-JOINED',
    name: 'dispatch',
    isPrivate: false,
    isMember: false,
    isArchived: false,
    isAccessible: true,
    selected: false,
    maintenanceSelected: false,
  },
]

test('inspection and maintenance dropdowns share the same eligible joined channel catalog', () => {
  const sharedChannels = getEligibleJoinedSlackChannels(channels)
  const inspectionChannels = sharedChannels
  const maintenanceChannels = searchSlackChannels(sharedChannels, '')

  assert.deepEqual(
    inspectionChannels.map((channel) => channel.id),
    maintenanceChannels.map((channel) => channel.id)
  )
  assert.deepEqual(
    maintenanceChannels.map((channel) => channel.id),
    ['C-OPERATIONS', 'C-MAINTENANCE']
  )
})

test('maintenance channel search is case-insensitive and empty search returns every eligible channel', () => {
  const sharedChannels = getEligibleJoinedSlackChannels(channels)

  assert.deepEqual(
    searchSlackChannels(sharedChannels, 'FLEET').map((channel) => channel.id),
    ['C-OPERATIONS']
  )
  assert.deepEqual(
    searchSlackChannels(sharedChannels, '  RePoRtS ').map((channel) => channel.id),
    ['C-MAINTENANCE']
  )
  assert.deepEqual(searchSlackChannels(sharedChannels, ''), sharedChannels)
  assert.deepEqual(searchSlackChannels(sharedChannels, '   '), sharedChannels)
})

test('archived, inaccessible, and channels the app has not joined are excluded', () => {
  assert.deepEqual(
    getEligibleJoinedSlackChannels(channels).map((channel) => channel.id),
    ['C-OPERATIONS', 'C-MAINTENANCE']
  )
})

test('duplicate inspection and maintenance selection is rejected with a clear validation message', () => {
  assert.equal(
    validateSlackChannelSelection({
      inspectionChannelIds: ['C-OPERATIONS'],
      maintenanceChannelId: 'C-OPERATIONS',
      maintenanceEnabled: true,
    }),
    'Choose different channels for van inspections and maintenance reporting. The same Slack channel cannot be used for both.'
  )
  assert.equal(
    validateSlackChannelSelection({
      inspectionChannelIds: ['C-OPERATIONS'],
      maintenanceChannelId: 'C-MAINTENANCE',
      maintenanceEnabled: true,
    }),
    null
  )
})

test('Slack settings use one API load and one shared joined-channel source for both dropdowns', () => {
  const settings = readFileSync('components/van-damage/SlackSettingsClient.tsx', 'utf8')
  const route = readFileSync('app/api/integrations/slack/channels/route.ts', 'utf8')

  assert.equal(
    settings.match(/fetch\(\s*`\/api\/integrations\/slack\/channels\?businessId=/g)?.length,
    1
  )
  assert.match(settings, /const joinedChannels = useMemo/)
  assert.match(settings, /\{joinedChannels\.map\(\(channel\) =>/)
  assert.match(settings, /searchSlackChannels\(joinedChannels, channelSearch\)/)
  assert.doesNotMatch(settings, /!selected\.has\(channel\.id\)/)
  assert.match(route, /loadActiveSlackIntegration\(access\.tenantId, access\.businessId\)/)
  assert.match(route, /listSlackChannels\(decryptIntegrationToken\(integration\)\)/)
})
