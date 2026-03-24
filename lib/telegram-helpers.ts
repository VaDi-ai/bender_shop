import { Telegram } from 'telegraf'

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
