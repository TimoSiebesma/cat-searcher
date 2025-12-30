# Multi-Chat Setup Guide

This guide explains how to set up the bot to send notifications to multiple Telegram chats (groups or private chats).

## Overview

The bot now supports sending notifications to multiple chats simultaneously. When the bot is added to a group or someone sends `/start` to the bot, the chat ID is automatically stored in Vercel KV and will receive notifications.

## Setup Steps

### 1. Set Up Telegram Webhook

The bot needs to receive updates from Telegram when it's added to groups. You need to set up a webhook:

#### Option A: Using curl/PowerShell

```powershell
# Replace YOUR_BOT_TOKEN with your actual bot token
# Replace YOUR_VERCEL_URL with your deployed Vercel URL
$botToken = "YOUR_BOT_TOKEN"
$webhookUrl = "https://YOUR_VERCEL_URL.vercel.app/api/telegram-webhook"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
  -Method Post `
  -Body @{ url = $webhookUrl } `
  -ContentType "application/json"
```

#### Option B: Using browser

Visit this URL (replace YOUR_BOT_TOKEN and YOUR_VERCEL_URL):
```
https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://YOUR_VERCEL_URL.vercel.app/api/telegram-webhook
```

You should see:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### 2. Add Bot to Groups

Now you can add your bot to any Telegram group:

1. Open the Telegram group (e.g., "De kattenzoekers" with ID -5233959898)
2. Click on the group name → "Add Members"
3. Search for your bot username (e.g., @catsma_bot)
4. Add the bot to the group

The bot will automatically:
- Detect that it was added to the group
- Store the group's chat ID in KV storage
- Send a welcome message to the group
- Start sending cat notifications to that group

### 3. Private Chat Subscriptions

Users can also subscribe to notifications via private chat:

1. Open a private chat with your bot
2. Send `/start` command
3. The bot will subscribe you and send a confirmation

### 4. Managing Subscriptions

**Check subscription status:**
- Send `/status` to the bot (in private chat or group)

**Unsubscribe:**
- Send `/stop` to the bot
- Or remove the bot from the group

## How It Works

### Webhook Flow

```
Telegram → /api/telegram-webhook → Vercel KV
                                    ↓
                                  Store/Remove Chat IDs
```

When the bot is added to a group:
1. Telegram sends an update to your webhook
2. Webhook extracts the chat ID
3. Chat ID is stored in Vercel KV under the key `telegram:chat_ids`
4. Welcome message is sent to the group

### Notification Flow

```
Vercel Cron → /api/check-cats → Fetch Cat Listings
              (every 15 min)    ↓
                               Compare with KV
                               ↓
                               New Cats Found?
                               ↓
                          Get All Chat IDs from KV
                               ↓
                          Send to Each Chat
```

When new cats are found:
1. The check-cats function fetches all registered chat IDs from KV
2. For each chat ID, it sends the cat notifications
3. If no chat IDs are found, it falls back to `TELEGRAM_CHAT_ID` env var

## Troubleshooting

### Chat Not Receiving Notifications

**Check if webhook is set:**
```powershell
Invoke-RestMethod -Uri "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

You should see your webhook URL. If not, set it again (see step 1).

**Check if chat is registered:**
1. Check Vercel logs after adding the bot to a group
2. Look for: `[Webhook] Added chat CHAT_ID to notification list`

**Manually add a chat ID:**

If the webhook didn't work, you can manually add a chat to KV storage. Use the Redis CLI or Vercel KV dashboard:

```bash
# Using Vercel KV CLI
vercel kv sadd telegram:chat_ids '{"id":"-5233959898","name":"De kattenzoekers","addedAt":"2025-12-30T12:00:00.000Z"}'
```

Or use the script approach:
```typescript
// test-add-chat.ts
import { kv } from "@vercel/kv";

async function addChat() {
  const chatData = {
    id: "-5233959898",
    name: "De kattenzoekers",
    addedAt: new Date().toISOString()
  };
  
  await kv.sadd("telegram:chat_ids", JSON.stringify(chatData));
  console.log("Chat added!");
}

addChat();
```

### View All Registered Chats

Check Vercel logs when check-cats runs. You'll see:
```
[KV] Found 2 registered chat(s): 8413382198, -5233959898
```

### Bot Not Responding to Commands

Make sure:
1. Webhook is properly set up
2. The bot has permission to read messages in the group
3. Commands are sent correctly: `/start`, `/status`, `/stop`

## Migration from Single Chat

If you were previously using just the `TELEGRAM_CHAT_ID` environment variable:

1. The system will automatically fall back to `TELEGRAM_CHAT_ID` if no chats are registered in KV
2. You can keep `TELEGRAM_CHAT_ID` as a fallback
3. Once you add chats via webhook, those will take priority

## Environment Variables

Required:
- `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
- `CRON_SECRET` - Secret to protect the check-cats endpoint

Optional:
- `TELEGRAM_CHAT_ID` - Fallback chat ID if no chats registered in KV
- `CHECK_URL` - URL to check for cats (has default)
- `FILTER_DUO_ADOPTIONS` - Set to "false" to include duo adoptions (default: true)

## Testing

### Test the webhook endpoint

Send a test update:
```powershell
$botToken = "YOUR_BOT_TOKEN"
$testUpdate = @{
  update_id = 123456789
  message = @{
    message_id = 1
    from = @{
      id = 8413382198
      is_bot = $false
      first_name = "Test"
    }
    chat = @{
      id = 8413382198
      first_name = "Test"
      type = "private"
    }
    date = [int][double]::Parse((Get-Date -UFormat %s))
    text = "/start"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://YOUR_VERCEL_URL.vercel.app/api/telegram-webhook" `
  -Method Post `
  -Body $testUpdate `
  -ContentType "application/json"
```

### Test cat notifications

Trigger a manual check:
```powershell
Invoke-RestMethod -Uri "https://YOUR_VERCEL_URL.vercel.app/api/check-cats?secret=YOUR_CRON_SECRET"
```

Check the response to see how many chats received notifications.

## Architecture

The multi-chat system uses:

- **Vercel KV (Redis)** - Stores registered chat IDs as a Set
- **telegram-webhook.ts** - Handles Telegram updates (bot added/removed)
- **check-cats.ts** - Fetches chat IDs from KV and sends notifications
- **Telegram Bot API** - Receives updates via webhook, sends messages

This architecture allows unlimited chats to receive notifications without code changes!
