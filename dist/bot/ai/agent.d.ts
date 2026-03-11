/**
 * bot/ai/agent.ts
 *
 * AI Sales Agent на базе OpenRouter (Claude + Perplexity web search).
 *
 * Режимы (хранятся в ApiKey service="ai_mode"):
 *   manual — только подсказка менеджеру в топик (💡 AI подсказка)
 *   semi   — генерирует ответ, показывает менеджеру с кнопками [✅ Отправить] [✏️ Редактировать] [❌ Пропустить]
 *   auto   — отправляет ответ клиенту автоматически
 */
export declare function reinitClient(newKey: string): void;
export type AIMode = 'manual' | 'semi' | 'auto' | 'off';
export declare function getAIMode(): Promise<AIMode>;
export declare function setAIMode(mode: AIMode): Promise<void>;
type AIStats = {
    date: string;
    total: number;
    approved: number;
    rejected: number;
};
export declare function getAIStats(): AIStats;
export declare function incrementStat(key: 'total' | 'approved' | 'rejected'): void;
type AISuggestion = {
    clientId: number;
    text: string;
    threadId: number;
};
export declare const aiSuggestions: Map<number, AISuggestion>;
export declare function storeSuggestion(clientId: number, text: string, threadId: number): number;
export declare function getSuggestion(id: number): AISuggestion | undefined;
export declare function deleteSuggestion(id: number): void;
export declare function generateAIResponse(clientId: number, newMessage: string): Promise<string>;
export {};
//# sourceMappingURL=agent.d.ts.map