// The chat history in a /api/chat request comes from the browser, so it is
// untrusted. Passing it to the AI SDK's converter as-is let a crafted request
// (a) show the risk check one text (`content`) while the model read another
// (`parts`), (b) inject `system` turns that override safety mode, and (c) send
// `file` parts the server would then download from any URL. The route rebuilds
// a plain user/assistant text history with this module and classifies exactly
// the text the model receives.

export const MAX_HISTORY_MESSAGES = 10
export const MAX_MESSAGE_CHARS = 4000

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Text of one UI message: its text parts (the shape useChat sends), else a string `content`. */
export function messageText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const m = message as { parts?: unknown; content?: unknown }
  if (Array.isArray(m.parts)) {
    return m.parts
      .filter(
        (p): p is { type: 'text'; text: string } =>
          !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' &&
          typeof (p as { text?: unknown }).text === 'string',
      )
      .map((p) => p.text)
      .join('')
  }
  return typeof m.content === 'string' ? m.content : ''
}

/**
 * Text-only user/assistant turns, the most recent MAX_HISTORY_MESSAGES, each
 * capped at MAX_MESSAGE_CHARS. Returns null unless the last turn is the user's,
 * since a request without a user message to answer is malformed.
 */
export function sanitizeHistory(messages: unknown): ChatTurn[] | null {
  if (!Array.isArray(messages)) return null
  const turns: ChatTurn[] = []
  for (const m of messages) {
    const role = m && typeof m === 'object' ? (m as { role?: unknown }).role : undefined
    if (role !== 'user' && role !== 'assistant') continue
    const content = messageText(m).trim().slice(0, MAX_MESSAGE_CHARS)
    if (content) turns.push({ role, content })
  }
  const recent = turns.slice(-MAX_HISTORY_MESSAGES)
  if (recent.length === 0 || recent[recent.length - 1].role !== 'user') return null
  return recent
}

/**
 * The model's context, built from what the server SAVED for this session
 * (therapist_convo rows, newest first, as queried) plus the new user message.
 * Only that newest message comes from the request, so a crafted request can't
 * plant earlier "assistant" or "user" turns (audit U9c).
 */
export function historyFromRows(
  rowsNewestFirst: { sender: string; msg_text: string | null }[],
  currentUserText: string,
): ChatTurn[] {
  const prior: ChatTurn[] = []
  for (const r of rowsNewestFirst.slice(0, MAX_HISTORY_MESSAGES - 1).reverse()) {
    if ((r.sender === 'user' || r.sender === 'assistant') && r.msg_text?.trim()) {
      prior.push({ role: r.sender, content: r.msg_text.trim().slice(0, MAX_MESSAGE_CHARS) })
    }
  }
  return [...prior, { role: 'user', content: currentUserText }]
}
