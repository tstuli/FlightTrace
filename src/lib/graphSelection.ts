import type { ChannelDefinition, ModelProfile } from '../types'

export function graphSelectionForModel(model: ModelProfile, channels: ChannelDefinition[], maximum: number): string[] {
  const available = new Set(channels.filter((channel) => channel.kind !== 'empty').map((channel) => channel.key))
  if (model.graphChannelKeys !== undefined) {
    return [...new Set(model.graphChannelKeys)].filter((key) => available.has(key)).slice(0, maximum)
  }
  const pinned = channels
    .filter((channel) => channel.kind !== 'empty' && model.channelSettings[channel.key]?.pinned)
    .map((channel) => channel.key)
  return (pinned.length ? pinned : channels.filter((channel) => channel.kind !== 'empty').slice(0, 4).map((channel) => channel.key)).slice(0, maximum)
}
