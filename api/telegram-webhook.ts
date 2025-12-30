import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

// Configuration from environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

// Redis key for storing chat IDs
const CHAT_IDS_KEY = "telegram:chat_ids";

// Telegram Update types
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: ChatMemberUpdated;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  new_chat_member?: TelegramUser;
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
}

interface ChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: ChatMember;
  new_chat_member: ChatMember;
}

interface ChatMember {
  user: TelegramUser;
  status: string; // "member", "left", "administrator", etc.
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string; // "private", "group", "supergroup", "channel"
  title?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Webhook handler for Telegram bot updates
 * This endpoint receives updates when:
 * - Bot is added to a group
 * - Bot is removed from a group
 * - User sends a message to the bot
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update: TelegramUpdate = req.body;

    console.log(`[Webhook] Received update:`, JSON.stringify(update, null, 2));

    // Handle bot being added to a group/chat
    if (update.my_chat_member) {
      await handleChatMemberUpdate(update.my_chat_member);
    }

    // Handle messages (including new_chat_member events)
    if (update.message) {
      await handleMessage(update.message);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[Webhook] Error processing update:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * Handle chat member updates (when bot is added/removed from a group)
 */
async function handleChatMemberUpdate(update: ChatMemberUpdated): Promise<void> {
  const { chat, new_chat_member } = update;

  // Check if this update is about our bot
  const botId = await getBotId();
  if (new_chat_member.user.id !== botId) {
    return;
  }

  console.log(`[Webhook] Bot status changed in chat ${chat.id} (${chat.title || chat.type}): ${new_chat_member.status}`);

  // If bot was added to a chat (became a member)
  if (new_chat_member.status === "member" || new_chat_member.status === "administrator") {
    await addChatId(chat.id, chat.title || chat.type);
    console.log(`[Webhook] Added chat ${chat.id} to notification list`);

    // Send welcome message
    await sendMessage(chat.id, "🐱 Cat Searcher bot has been activated! You will now receive notifications about new adoptable cats.");
  }
  // If bot was removed from a chat
  else if (new_chat_member.status === "left" || new_chat_member.status === "kicked") {
    await removeChatId(chat.id);
    console.log(`[Webhook] Removed chat ${chat.id} from notification list`);
  }
}

/**
 * Handle incoming messages
 */
async function handleMessage(message: TelegramMessage): Promise<void> {
  const { chat, text } = message;

  // If bot was added to a group via new_chat_member
  if (message.new_chat_member || message.new_chat_members) {
    const botId = await getBotId();
    const newMembers = message.new_chat_members || [message.new_chat_member!];

    for (const member of newMembers) {
      if (member.id === botId) {
        await addChatId(chat.id, chat.title || chat.type);
        console.log(`[Webhook] Bot added to chat ${chat.id} via new_chat_member`);

        // Send welcome message
        await sendMessage(chat.id, "🐱 Cat Searcher bot has been activated! You will now receive notifications about new adoptable cats.");
      }
    }
    return;
  }

  // Handle commands
  if (text) {
    if (text === "/start") {
      await addChatId(chat.id, chat.title || chat.type);
      await sendMessage(chat.id, "🐱 Welcome to Cat Searcher! You will receive notifications about new adoptable cats.\n\nCommands:\n/status - Check if you're subscribed\n/stop - Unsubscribe from notifications");
    } else if (text === "/status") {
      const chatIds = await getChatIds();
      const isSubscribed = chatIds.includes(chat.id.toString());
      await sendMessage(chat.id, isSubscribed
        ? "✅ You are subscribed to cat notifications!"
        : "❌ You are not subscribed. Send /start to subscribe.");
    } else if (text === "/stop") {
      await removeChatId(chat.id);
      await sendMessage(chat.id, "👋 You have been unsubscribed from cat notifications. Send /start to subscribe again.");
    }
  }
}

/**
 * Get the bot's user ID
 */
let cachedBotId: number | null = null;
async function getBotId(): Promise<number> {
  if (cachedBotId) {
    return cachedBotId;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const data: any = await response.json();

  if (data.ok && data.result && data.result.id) {
    cachedBotId = data.result.id;
    return cachedBotId!;
  }

  throw new Error("Failed to get bot ID");
}

/**
 * Add a chat ID to the notification list
 */
async function addChatId(chatId: number, chatName: string): Promise<void> {
  // Store as JSON object with metadata
  const chatData = {
    id: chatId.toString(),
    name: chatName,
    addedAt: new Date().toISOString()
  };

  // Add to a Redis Set (stores unique chat IDs)
  await kv.sadd(CHAT_IDS_KEY, JSON.stringify(chatData));

  console.log(`[KV] Added chat ${chatId} (${chatName}) to notification list`);
}

/**
 * Remove a chat ID from the notification list
 */
async function removeChatId(chatId: number): Promise<void> {
  // Get all chat data
  const chatDatas = await kv.smembers(CHAT_IDS_KEY) as string[];

  // Find and remove the matching chat
  for (const chatDataStr of chatDatas) {
    try {
      const chatData = JSON.parse(chatDataStr);
      if (chatData.id === chatId.toString()) {
        await kv.srem(CHAT_IDS_KEY, chatDataStr);
        console.log(`[KV] Removed chat ${chatId} from notification list`);
        return;
      }
    } catch (e) {
      console.warn(`[KV] Failed to parse chat data: ${chatDataStr}`);
    }
  }
}

/**
 * Get all registered chat IDs
 */
async function getChatIds(): Promise<string[]> {
  const chatDatas = await kv.smembers(CHAT_IDS_KEY) as string[];

  return chatDatas.map(chatDataStr => {
    try {
      const chatData = JSON.parse(chatDataStr);
      return chatData.id;
    } catch (e) {
      console.warn(`[KV] Failed to parse chat data: ${chatDataStr}`);
      return null;
    }
  }).filter(id => id !== null) as string[];
}

/**
 * Send a message to a specific chat
 */
async function sendMessage(chatId: number, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
  } catch (error) {
    console.error(`[Webhook] Failed to send message to ${chatId}:`, error);
  }
}
