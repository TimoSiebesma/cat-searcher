# Deployment Checklist for Multi-Chat Support

Follow these steps to enable multi-chat support for your cat-searcher bot.

## Prerequisites

- [ ] Vercel project is deployed
- [ ] Vercel KV database is created and linked
- [ ] `TELEGRAM_BOT_TOKEN` environment variable is set
- [ ] `CRON_SECRET` environment variable is set

## Step 1: Deploy New Code

```bash
# Make sure all changes are committed
git add .
git commit -m "Add multi-chat support"

# Deploy to Vercel
vercel --prod
```

## Step 2: Set Up Telegram Webhook

**Get your deployment URL:**
```bash
vercel ls
# Note your production URL
```

**Set the webhook:**

Using PowerShell:
```powershell
$botToken = "YOUR_TELEGRAM_BOT_TOKEN"
$webhookUrl = "https://YOUR-VERCEL-URL.vercel.app/api/telegram-webhook"

$response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
  -Method Post `
  -Body (@{ url = $webhookUrl } | ConvertTo-Json) `
  -ContentType "application/json"

Write-Host "Webhook set: $($response.ok)"
```

**Verify webhook:**
```powershell
Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo"
```

Expected output:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-app.vercel.app/api/telegram-webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## Step 3: Register Existing Chats

### Option A: Re-add Bot to Groups

For each group where the bot is already added:

1. Remove the bot from the group
2. Wait 5 seconds
3. Add the bot back to the group
4. Bot should send: "🐱 Cat Searcher bot has been activated!"

### Option B: Manual Registration

For chat -5233959898:
```powershell
npx tsx add-chat.ts -5233959898 "De kattenzoekers"
```

For other chats:
```powershell
npx tsx add-chat.ts <CHAT_ID> "<CHAT_NAME>"
```

## Step 4: Verify Registration

**List all registered chats:**
```powershell
npx tsx list-chats.ts
```

Expected output:
```
Found 1 registered chat(s):

📱 Chat ID: -5233959898
   Name: De kattenzoekers
   Added: 12/30/2025, 10:00:00 AM
```

## Step 5: Test Notifications

**Trigger a manual check:**
```powershell
$cronSecret = "YOUR_CRON_SECRET"
Invoke-RestMethod -Uri "https://YOUR-VERCEL-URL.vercel.app/api/check-cats?secret=$cronSecret"
```

**Check Vercel logs:**
```bash
vercel logs --follow
```

Look for:
```
[KV] Found 1 registered chat(s): -5233959898
[Telegram] Sending notifications to 1 chat(s)
[Telegram] Sent notifications to chat -5233959898
```

## Step 6: Test Commands (Optional)

In any registered chat, test these commands:

- [ ] `/status` - Should show "✅ You are subscribed"
- [ ] `/stop` - Should unsubscribe
- [ ] `/start` - Should re-subscribe

## Step 7: Monitor First Cron Run

The cron job runs every 15 minutes. After the next run:

1. Check Vercel logs for successful notification
2. Check that all registered chats received notifications
3. Verify no errors in logs

## Troubleshooting

### Webhook Not Working

**Check webhook status:**
```powershell
Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo"
```

**Common issues:**
- URL is wrong (check for typos)
- Vercel function not deployed (redeploy)
- Telegram can't reach the URL (check Vercel logs)

**Reset webhook:**
```powershell
# Delete webhook
Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/deleteWebhook"

# Set again
Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
  -Method Post `
  -Body (@{ url = $webhookUrl } | ConvertTo-Json) `
  -ContentType "application/json"
```

### Chat Not Receiving Notifications

1. **Verify chat is registered:**
   ```powershell
   npx tsx list-chats.ts
   ```

2. **Check Vercel logs** during cron run:
   ```bash
   vercel logs --follow
   ```

3. **Manually add chat:**
   ```powershell
   npx tsx add-chat.ts -5233959898 "De kattenzoekers"
   ```

4. **Trigger manual check:**
   ```powershell
   Invoke-RestMethod -Uri "https://YOUR-APP.vercel.app/api/check-cats?secret=$cronSecret"
   ```

### Bot Not Responding to Commands

- Make sure webhook is set correctly
- Check bot has permission to read messages in groups
- Try removing and re-adding bot to group

## Rollback Plan

If something goes wrong, you can rollback to single-chat mode:

1. Set the `TELEGRAM_CHAT_ID` environment variable:
   ```bash
   vercel env add TELEGRAM_CHAT_ID
   # Enter your main chat ID
   ```

2. Redeploy:
   ```bash
   vercel --prod
   ```

The system will automatically use `TELEGRAM_CHAT_ID` if no chats are in KV storage.

## Success Criteria

- ✅ Webhook is set and verified
- ✅ Chat -5233959898 is registered
- ✅ `list-chats.ts` shows all expected chats
- ✅ Manual test sends notifications to all chats
- ✅ Commands work in groups
- ✅ Cron job logs show successful multi-chat notifications
- ✅ No errors in Vercel logs

## Next Steps

1. **Add more chats:** Just add the bot to any new Telegram group
2. **Monitor:** Check Vercel logs periodically
3. **Share:** Invite others to join your notification groups!

---

**Need help?** Check:
- [MULTI-CHAT-SETUP.md](MULTI-CHAT-SETUP.md) - Detailed setup guide
- [FIX-CHAT.md](FIX-CHAT.md) - Quick fix for specific chat
- [README.md](README.md) - General documentation
