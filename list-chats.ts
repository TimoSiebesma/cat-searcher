/**
 * Helper script to list all registered chat IDs from KV storage
 * 
 * Usage:
 * 1. Install dependencies: npm install
 * 2. Set environment variables (or use .env file)
 * 3. Run: npx tsx list-chats.ts
 */

import { kv } from "@vercel/kv";

async function listChats() {
  console.log("Fetching registered chats from KV storage...\n");

  try {
    const allChats = await kv.smembers("telegram:chat_ids") as string[];
    
    if (allChats.length === 0) {
      console.log("⚠️  No chats registered in KV storage.");
      console.log("\nTo add a chat, use:");
      console.log("  npx tsx add-chat.ts <chatId> <chatName>");
      return;
    }

    console.log(`Found ${allChats.length} registered chat(s):\n`);
    
    for (const chatStr of allChats) {
      try {
        const chat = JSON.parse(chatStr);
        console.log(`📱 Chat ID: ${chat.id}`);
        console.log(`   Name: ${chat.name}`);
        console.log(`   Added: ${new Date(chat.addedAt).toLocaleString()}`);
        console.log();
      } catch (e) {
        console.warn(`⚠️  Invalid chat data: ${chatStr}`);
      }
    }

    // Show chat IDs for easy copying
    const chatIds = allChats.map(chatStr => {
      try {
        return JSON.parse(chatStr).id;
      } catch {
        return null;
      }
    }).filter(id => id !== null);

    console.log(`Chat IDs: ${chatIds.join(", ")}`);
  } catch (error) {
    console.error("❌ Error fetching chats from KV:", error);
    process.exit(1);
  }
}

listChats();
