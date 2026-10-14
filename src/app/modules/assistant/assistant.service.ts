/**
 * ShohozBot assistant service — powered by xAI Grok.
 *
 * Runs an agentic tool-calling loop: Grok can call read-only tools (product
 * search, categories, order tracking, store info) to ground its answers in real
 * Shohoz Kitchen data, then replies. General (non-store) questions are answered
 * directly. The API key lives only in the server .env and is never exposed.
 */
import config from '../../config';
import { TOOL_DEFS, AssistantTools } from './assistant.tools';

const SYSTEM_PROMPT = `You are ShohozBot, the friendly and professional AI shopping assistant for Shohoz Kitchen — an online kitchen store in Bangladesh. Currency is BDT (৳). Shohoz Kitchen delivers across Bangladesh and offers Cash on Delivery.

HOW TO ANSWER:
- For anything about the store — products, prices, stock/availability, recommendations, categories, how to order, delivery, payment methods, tracking an order, returns/refunds, or contact info — CALL the appropriate tool and answer from the REAL data it returns. Never invent product names, prices, stock, order status, or policies. If a tool returns nothing, say so honestly and suggest an alternative (e.g. browse /products or contact support).
- For general questions unrelated to Shohoz Kitchen (general knowledge, advice, casual chat), just answer helpfully and accurately like a capable assistant.
- Always reply in the SAME language the user used. Support English and Bangla/Banglish naturally.

STYLE:
- Be concise, warm and professional. Prefer short sentences and bullet points.
- Show prices with the ৳ symbol.
- When pointing to a page, write the path in plain text (e.g. "browse at /products", "track it in /dashboard/user/orders"). Do NOT use markdown link syntax or images — the chat renders plain text.
- Keep answers focused; don't dump everything, answer what was asked.`;

// Minimal shape we read from the xAI (OpenAI-compatible) response.
interface XaiMessage {
    role: string;
    content: string | null;
    tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
}

async function xaiChat(messages: any[], useTools: boolean): Promise<XaiMessage> {
    const res = await fetch(`${config.grok.base_url}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.grok.api_key}`,
        },
        body: JSON.stringify({
            model: config.grok.model,
            messages,
            ...(useTools ? { tools: TOOL_DEFS, tool_choice: 'auto' } : {}),
            temperature: 0.4,
            max_tokens: 900,
        }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        const raw = data?.error?.message || data?.error || `xAI request failed (HTTP ${res.status}).`;
        const err: any = new Error(typeof raw === 'string' ? raw : JSON.stringify(raw));
        err.status = res.status;
        throw err;
    }
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error('The AI returned an empty response.');
    return msg as XaiMessage;
}

export interface ChatTurn { from: 'user' | 'bot'; text: string }

export async function askAssistant(userMessage: string, history: ChatTurn[] = []): Promise<{ reply: string }> {
    if (!config.grok.api_key) {
        const e: any = new Error('AI assistant is not configured (missing GROK_API_KEY).');
        e.code = 'NO_KEY';
        throw e;
    }

    // Build the message list: system + recent history + this turn.
    const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const h of (history || []).slice(-8)) {
        if (!h || typeof h.text !== 'string' || !h.text.trim()) continue;
        messages.push({ role: h.from === 'user' ? 'user' : 'assistant', content: h.text.slice(0, 1500) });
    }
    messages.push({ role: 'user', content: userMessage });

    // Agentic loop: let Grok call tools up to a few rounds, then answer.
    const MAX_ROUNDS = 4;
    for (let round = 0; round < MAX_ROUNDS; round++) {
        const msg = await xaiChat(messages, true);
        messages.push(msg);

        const toolCalls = msg.tool_calls || [];
        if (toolCalls.length === 0) {
            return { reply: (msg.content || '').trim() || "Sorry, I couldn't find an answer for that." };
        }

        // Execute each requested tool and feed results back.
        for (const tc of toolCalls) {
            const name = tc.function?.name;
            let args: any = {};
            try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignore bad args */ }
            let result: any;
            try {
                result = AssistantTools[name] ? await AssistantTools[name](args) : { error: `Unknown tool: ${name}` };
            } catch (e: any) {
                result = { error: e?.message || 'Tool execution failed.' };
            }
            messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result).slice(0, 6000),
            });
        }
    }

    // Ran out of tool rounds — force a final text answer with what we have.
    messages.push({ role: 'user', content: 'Give your best final answer now, in plain text, based on the information gathered.' });
    const finalMsg = await xaiChat(messages, false);
    return { reply: (finalMsg.content || '').trim() || "Sorry, I couldn't complete that request. Please try rephrasing." };
}
