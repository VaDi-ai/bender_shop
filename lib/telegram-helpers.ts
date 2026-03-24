import { Telegram } from 'telegraf'

export function splitMessage(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }
    // Ищем последний перенос строки в пределах лимита
    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt < maxLength * 0.3) {
      // Если перенос слишком далеко — режем по пробелу
      splitAt = remaining.lastIndexOf(' ', maxLength)
    }
    if (splitAt < maxLength * 0.3) {
      // Крайний случай — режем по лимиту
      splitAt = maxLength
    }
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendToTopic(
  telegram: Telegram,
  chatId: number,
  threadId: number,
  text: string,
): Promise<void> {
  await (telegram.sendMessage as any)(chatId, text, { message_thread_id: threadId })
}

export async function sendToTopicWithMarkup(
  telegram: Telegram,
  chatId: number,
  threadId: number,
  text: string,
  reply_markup: any,
): Promise<void> {
  await (telegram.sendMessage as any)(chatId, text, { message_thread_id: threadId, reply_markup })
}
