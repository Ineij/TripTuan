/**
 * Streaming chat agent.
 *
 * The page consumes this via `for await (const chunk of streamChat(...))`.
 * All chunks come from the backend SSE endpoint at /api/chat/stream —
 * no inline scripted timeline.
 */
import { request } from './http';
import type { ChatChunk, Scene } from './types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

function apiUrl(path: string) {
  return BASE ? `${BASE}${path}` : path;
}

export async function* streamChat(
  scene: Scene,
  query: string,
): AsyncGenerator<ChatChunk> {
  const res = await fetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene, query }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat stream failed: HTTP ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find((item) => item.startsWith('data:'));
      if (!line) continue;
      yield JSON.parse(line.slice(5).trim()) as ChatChunk;
    }
  }
  if (buf.startsWith('data:')) {
    yield JSON.parse(buf.slice(5).trim()) as ChatChunk;
  }
  yield { kind: 'done' };
}

/**
 * Send a single message (non-streaming). Reserved for follow-up questions
 * after the initial chat script completes.
 */
export async function sendMessage(scene: Scene, text: string): Promise<string> {
  return request<{ reply: string }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ scene, text }),
  }).then((r) => r.reply);
}
