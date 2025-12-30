/**
 * Helper script to manually add a chat ID to KV storage
 * 
 * Usage:
 * 1. Install dependencies: npm install
 * 2. Set environment variables (or use .env file)
 * 3. Run: npx tsx add-chat.ts -5233959898 "De kattenzoekers"
 */

import { kv } from "@vercel/kv";

async function addChatToKV() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: npx tsx add-chat.ts <chatId> [chatName]");
    console.error("Example: npx tsx add-chat.ts -5233959898 \"De kattenzoekers\"");
    process.exit(1);
  }

  const chatId = args[0];
  const chatName = args[1] || "Unknown Chat";

  console.log(`Adding chat to KV storage...`);
  console.log(`Chat ID: ${chatId}`);
  console.log(`Chat Name: ${chatName}`);

  const chatData = {
    id: chatId,
    name: chatName,
    addedAt: new Date().toISOString()
  };

  try {
    // Add to Redis Set
    await kv.sadd("telegram:chat_ids", JSON.stringify(chatData));
    
    console.log(`✅ Successfully added chat to KV storage!`);
    
    // Verify by fetching all chats
    const allChats = await kv.smembers("telegram:chat_ids") as string[];
    console.log(`\nAll registered chats (${allChats.length}):`);
    
    for (const chatStr of allChats) {
      const chat = JSON.parse(chatStr);
      console.log(`  - ${chat.id} (${chat.name}) - Added: ${chat.addedAt}`);
    }
  } catch (error) {
    console.error("❌ Error adding chat to KV:", error);
    process.exit(1);
  }
}

addChatToKV();
