export type SlackChannelOption = {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
  isArchived: boolean
  isAccessible: boolean
  selected: boolean
  maintenanceSelected: boolean
}

export function isEligibleJoinedSlackChannel(channel: SlackChannelOption) {
  return channel.isAccessible && channel.isMember && !channel.isArchived
}

export function getEligibleJoinedSlackChannels(channels: SlackChannelOption[]) {
  return channels.filter(isEligibleJoinedSlackChannel)
}

export function searchSlackChannels(channels: SlackChannelOption[], search: string) {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return channels
  return channels.filter((channel) => channel.name.toLocaleLowerCase().includes(query))
}

export function validateSlackChannelSelection(input: {
  inspectionChannelIds: Iterable<string>
  maintenanceChannelId: string | null
  maintenanceEnabled: boolean
}) {
  if (
    input.maintenanceChannelId &&
    new Set(input.inspectionChannelIds).has(input.maintenanceChannelId)
  ) {
    return 'Choose different channels for van inspections and maintenance reporting. The same Slack channel cannot be used for both.'
  }
  if (input.maintenanceEnabled && !input.maintenanceChannelId) {
    return 'Select a maintenance channel before enabling maintenance ingestion.'
  }
  return null
}
