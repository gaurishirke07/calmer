import { createOpenAI } from '@ai-sdk/openai'

// The one place the conversational model is chosen — used by the therapist
// chat, the LLM safety check, and session summaries, so they cannot drift apart.
//
// Reached over Groq's OpenAI-compatible API. Groq retired its Llama chat models
// in 2026 (`llama-3.3-70b-versatile` now returns "model does not exist"), which
// silently broke chat replies AND dropped the safety layer to keyword-only. The
// default is now OpenAI's open-weight gpt-oss-120b (Apache-2.0), served free on
// Groq. Override with CALMER_CHAT_MODEL (any Groq model id) — swapping the model
// needs no code change.
export const DEFAULT_CHAT_MODEL = 'openai/gpt-oss-120b'

export function chatModelId() {
  return process.env.CALMER_CHAT_MODEL || DEFAULT_CHAT_MODEL
}

export function chatModel() {
  const groq = createOpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY })
  // .chat() targets Chat Completions, which every OpenAI-compatible provider
  // implements; the bare provider call targets the newer Responses API.
  return groq.chat(chatModelId())
}
