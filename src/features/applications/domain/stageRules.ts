import type { PipelineStage } from '../../../types/pipeline'

const defaultTransitions: Record<PipelineStage, PipelineStage[]> = {
  discovery: ['applied', 'rejected', 'ghosted'],
  applied: ['screening', 'rejected', 'ghosted'],
  screening: ['interview_scheduled', 'rejected', 'ghosted'],
  interview_scheduled: ['interview_complete', 'rejected', 'ghosted'],
  interview_complete: ['offer', 'rejected', 'ghosted'],
  offer: ['hired', 'rejected'],
  hired: [],
  rejected: [],
  ghosted: ['applied'],
}

export function canTransitionStage(from: PipelineStage, to: PipelineStage): boolean {
  return defaultTransitions[from].includes(to)
}
