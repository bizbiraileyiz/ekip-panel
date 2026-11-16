import { addMessage, addAttachments, attachmentData, getProject, getSetting, recentMessages } from './db';
import { ask, buildTurns, systemPrompt, NAMES } from './ai';

const OTHER = { claude: 'chatgpt', chatgpt: 'claude' };
const MENTION = { claude: /@claude\b/i, chatgpt: /@(chatgpt|gpt)\b/i };
const ATTACH_WINDOW = Number(process.env.ATTACH_WINDOW || 10); // ek verisi modele giden son ekli mesaj sayısı

export const running = new Set(); // aynı projede eşzamanlı tur engeli (tek sunucu)

// Murat bir modeli etiketlerse sadece o cevap verir; etiket yoksa ya da ikisi de etiketliyse sırayla ikisi.
export function targets(content) {
  const c = MENTION.claude.test(content);
  const g = MENTION.chatgpt.test(content);
  if (c && !g) return ['claude'];
  if (g && !c) return ['chatgpt'];
  return ['claude', 'chatgpt'];
}

// Etiket yoksa sırayla Claude, sonra ChatGPT; @claude / @chatgpt (@gpt) ile sadece biri cevap verir.
// Biri hata verirse tur durur. Biri diğerini etiketlerse en fazla MAX_AI_TURNS ek tur yapılır.
export async function* runTurn(projectId, content, files = []) {
  if (running.has(projectId)) throw new Error('Bu projede şu an bir cevap yazılıyor, biraz bekle.');
  running.add(projectId);
  try {
    const project = await getProject(projectId);
    if (!project) throw new Error('Proje bulunamadı');
    const profile = await getSetting('murat_profile');

    const userMsg = await addMessage(projectId, 'murat', content);
    userMsg.attachments = files.length ? await addAttachments(userMsg.id, files) : [];
    yield { type: 'message', message: userMsg };

    const respond = async function* (who) {
      yield { type: 'typing', who, project_id: projectId };
      const history = await recentMessages(projectId, 40);
      const withFiles = history.filter((m) => m.attachments.length).slice(-ATTACH_WINDOW);
      const data = await attachmentData(withFiles.flatMap((m) => m.attachments.map((a) => a.id)));
      let msg;
      try {
        const text = await ask(who, systemPrompt(who, project, profile), buildTurns(who, history, data));
        msg = await addMessage(projectId, who, text);
      } catch (e) {
        msg = await addMessage(projectId, 'sistem', `${NAMES[who]} cevap veremedi: ${e.message}. Tur durduruldu; mesajını tekrar gönderebilirsin.`);
        msg.failed = true;
      }
      msg.attachments = [];
      yield { type: 'message', message: msg };
      return msg;
    };

    let last = null;
    for (const who of targets(content)) {
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
