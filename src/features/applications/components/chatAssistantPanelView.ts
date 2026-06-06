import type { ChatAssistantResponse } from '../services/chatAssistantService'

export interface ChatAssistantMetaItem {
  label: string
  value: string
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatChatCostStatus(response: ChatAssistantResponse): string {
  if (response.status === 'deferred') {
    return 'Deferred at cap'
  }

  if (response.costStatus === 'warn') {
    return 'Warning threshold'
  }

  if (response.costStatus === 'capped') {
    return 'Capped'
  }

  return 'Within budget'
}

export function buildChatAssistantMeta(response: ChatAssistantResponse): ChatAssistantMetaItem[] {
  return [
    {
      label: 'Task type',
      value: toTitleCase(response.taskType),
    },
    {
      label: 'Intent',
      value: toTitleCase(response.intent),
    },
    {
      label: 'Model',
      value: response.routedModel.modelName,
    },
    {
      label: 'Provider',
      value: response.routedModel.modelProvider,
    },
    {
      label: 'Cost status',
      value: `${formatChatCostStatus(response)} (${response.costPolicyStatus})`,
    },
    {
      label: 'Monthly spend',
      value: response.monthlySpendUsd.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }),
    },
  ]
}
