# Quick Fix: Adding Chat -5233959898

Your chat with ID `-5233959898` ("De kattenzoekers") is not working because it's not registered in the system. Here are 3 ways to fix it:

## Option 1: Set Up Webhook (Recommended)

This will automatically register any group the bot is added to:

1. Set up the Telegram webhook:
```powershell
$botToken = "YOUR_BOT_TOKEN"
$webhookUrl = "https://YOUR_VERCEL_URL.vercel.app/api/telegram-webhook"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
  -Method Post `
  -Body @{ url = $webhookUrl } `
  -ContentType "application/json"
```

2. Remove the bot from the group and add it back
3. The bot will automatically register the chat and send a welcome message

## Option 2: Manual Registration (Quick)

Use the provided script to manually add the chat:

```powershell
# Make sure you have the required environment variables set
npx tsx add-chat.ts -5233959898 "De kattenzoekers"
```

This will add the chat to KV storage immediately.

## Option 3: Use Environment Variable (Temporary)

If you only need one chat to work for now, set it as an environment variable:

```bash
vercel env add TELEGRAM_CHAT_ID
# Enter: -5233959898
```

Then redeploy:
```bash
vercel --prod
```

## Verify It's Working

After using any option above, run:

```powershell
npx tsx list-chats.ts
```

You should see:
```
📱 Chat ID: -5233959898
   Name: De kattenzoekers
   Added: [timestamp]
```

Or check the next cron run logs in Vercel dashboard. Look for:
```
[KV] Found 1 registered chat(s): -5233959898
```

## Why It Wasn't Working

The bot was added to the group, but:
1. No webhook was set up, so the bot didn't receive the "bot added" event
2. The chat ID wasn't manually added to KV storage
3. The `TELEGRAM_CHAT_ID` environment variable (if set) had a different chat ID

Now with the webhook or manual registration, the chat will receive notifications!
