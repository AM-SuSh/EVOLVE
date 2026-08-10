import { scoreLearningEventsV3 } from './rubric-v3.mjs'

/**
 * Compatibility entry point for the legacy /report response shape.
 * Stage fields remain in events for telemetry but V3 does not use them as score inputs.
 */
export function scoreLearningEvents(events) {
  return scoreLearningEventsV3(Array.isArray(events) ? events : [])
}
