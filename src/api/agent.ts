/**
 * Streaming chat agent.
 *
 * The page consumes this via `for await (const chunk of streamChat(...))`.
 * The mock implementation walks through a scripted timeline (intro → spots
 * → photos → hotels → tips). Teammates: replace the body with a real SSE /
 * fetch-stream reader; the consumer signature must stay the same.
 */
import { USE_MOCK, request, sleep } from './http';
import { getChatScript } from './content';
import type { ChatChunk, Scene } from './types';

export async function* streamChat(
  scene: Scene,
  _query: string,
): AsyncGenerator<ChatChunk> {
  if (!USE_MOCK) {
    // Real backend (teammate fills in)
    //
    //   const res = await fetch('/api/chat/stream', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ scene, query: _query }),
    //   });
    //   const reader = res.body!.getReader();
    //   const decoder = new TextDecoder();
    //   let buf = '';
    //   while (true) {
    //     const { done, value } = await reader.read();
    //     if (done) break;
    //     buf += decoder.decode(value, { stream: true });
    //     for (const line of buf.split('\n\n')) {
    //       if (!line.startsWith('data:')) continue;
    //       yield JSON.parse(line.slice(5)) as ChatChunk;
    //     }
    //     buf = buf.endsWith('\n\n') ? '' : buf.split('\n\n').pop()!;
    //   }
    //   yield { kind: 'done' };
    throw new Error('Real agent endpoint not wired yet — set VITE_USE_MOCK=true');
  }

  // ---- mock script ----
  const script = getChatScript(scene);

  // 1) thinking
  yield { kind: 'thinking', step: '根据需求生成定制化方案' };  await sleep(700);
  yield { kind: 'thinking', step: '完成行程信息收集' };          await sleep(700);
  yield { kind: 'thinking', step: `正在查询${script.cityLabel}的旅行信息` }; await sleep(700);

  // 2) intro paragraph (streamed char-by-char at ~25ms/char, slower on punctuation)
  for (const ch of script.intro) {
    yield { kind: 'text', delta: ch };
    await sleep(/[，。！？；：、]/.test(ch) ? 200 : 30);
  }
  await sleep(500);

  // 3) overview header
  yield { kind: 'section', title: '行程概览' };
  await sleep(300);
  for (const s of script.spots) {
    yield { kind: 'spot', ...s };
    await sleep(400);
  }
  await sleep(400);

  // 4) hotels
  yield { kind: 'section', title: '住宿方案' };
  for (const h of script.hotels) {
    yield { kind: 'hotel', ...h };
    await sleep(200);
  }

  // 5) tips
  yield { kind: 'section', title: '小贴士' };
  for (const t of script.tips) {
    yield { kind: 'tip', ...t };
    await sleep(250);
  }

  yield { kind: 'done' };
}

/**
 * Send a single message (non-streaming). Reserved for follow-up questions
 * after the initial chat script completes.
 */
export async function sendMessage(scene: Scene, text: string): Promise<string> {
  if (!USE_MOCK) {
    return request<{ reply: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ scene, text }),
    }).then((r) => r.reply);
  }
  await sleep(400);
  return '小团已收到（mock 回复）：' + text;
}
