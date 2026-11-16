import { addMessage, getProject, recentMessages } from './db';
import { ask, buildTurns, systemPrompt, NAMES } from './ai';

const OTHER = { claude: 'chatgpt', chatgpt: 'claude' };
const MENTION = { claude: /@claude\b/i, chatgpt: /@(chatgpt|gpt)\b/i };

const running = new Set(); // aynı projede eşzamanlı tur engeli (tek sunucu)

// Ortak konuşma: her mesaja sırayla Claude, sonra ChatGPT cevap verir.
// Biri diğerini etiketlerse en fazla MAX_AI_TURNS ek tur yapılır, sonra söz Murat'a döner.
export async function* runTurn(projectId, content) {
  if (running.has(projectId)) throw new Error('Bu projede şu an bir cevap yazılıyor, biraz bekle.');
  running.add(projectId);
  try {
    const project = await getProject(projectId);
    if (!project) throw new Error('Proje bulunamadı');

    yield { type: 'message', message: await addMessage(projectId, 'murat', content) };

    const respond = async function* (who) {
      yield { type: 'typing', who, project_id: projectId };
      const history = await recentMessages(projectId, 40);
      let msg;
      try {
        const text = await ask(who, systemPrompt(who, project), buildTurns(who, history));
        msg = await addMessage(projectId, who, text);
      } catch (e) {
        msg = await addMessage(projectId, 'sistem', `${NAMES[who]} cevap veremedi: ${e.message}. Tur durduruldu; mesajını tekrar gönderebilirsin.`);
        msg.failed = true;
      }
      yield { type: 'message', message: msg };
      return msg;
    };

    // Biri hata verirse tur durur; söz Murat'a geçer.
    let last = null;
    for (const who of ['claude', 'chatgpt']) {
      const msg = yield* respond(who);
      if (msg.failed) {
        yield { type: 'done', project_id: projectId };
        return;
      }
      last = msg;
    }

    const maxExtra = Math.max(0, Number(process.env.MAX_AI_TURNS ?? 2));
    for (let extra = 0; last && extra < maxExtra; extra++) {
      const target = OTHER[last.sender];
      if (!MENTION[target].test(last.content)) break;
      const msg = yield* respond(target);
      if (msg.failed) break;
      last = msg;
    }
    yield { type: 'done', project_id: projectId };
  } finally {
    running.delete(projectId);
  }
}
