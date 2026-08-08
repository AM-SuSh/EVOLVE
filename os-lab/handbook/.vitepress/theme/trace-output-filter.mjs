const TRACE_MARKER = 'TRACE_V1 '

function trailingMarkerPrefixLength(text) {
  const max = Math.min(text.length, TRACE_MARKER.length - 1)
  for (let length = max; length > 0; length -= 1) {
    if (TRACE_MARKER.startsWith(text.slice(-length))) return length
  }
  return 0
}

/**
 * Removes machine-readable teaching trace frames from streamed terminal text.
 * The raw server output remains untouched and is still used for trace artifacts.
 */
export function createTraceOutputFilter() {
  let pending = ''

  function consume(flush = false) {
    let visible = ''

    while (pending) {
      const markerIndex = pending.indexOf(TRACE_MARKER)
      if (markerIndex < 0) {
        if (flush) {
          visible += pending
          pending = ''
          break
        }
        const keep = trailingMarkerPrefixLength(pending)
        visible += keep ? pending.slice(0, -keep) : pending
        pending = keep ? pending.slice(-keep) : ''
        break
      }

      visible += pending.slice(0, markerIndex)
      pending = pending.slice(markerIndex)
      const lineEnd = pending.indexOf('\n')
      if (lineEnd < 0) {
        if (flush) pending = ''
        break
      }
      pending = pending.slice(lineEnd + 1)
    }

    return visible
  }

  return {
    push(text) {
      pending += String(text || '')
      return consume(false)
    },
    flush() {
      return consume(true)
    },
    reset() {
      pending = ''
    },
  }
}
