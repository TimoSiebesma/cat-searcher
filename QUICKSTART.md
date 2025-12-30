# Quick Start Guide

## 1. Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow prompts to name your bot
4. Save the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## 2. Get Your Chat ID

1. Send a message to your new bot
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Find `"chat":{"id":123456789}` in the response
4. Save this chat ID

## 3. Generate Secret

```bash
# On Linux/Mac
openssl rand -hex 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod

# Create KV database
vercel storage create kv cat-notifier-kv

# Add environment variables
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_CHAT_ID
vercel env add CRON_SECRET
```

## 5. Test

```bash
curl "https://your-project.vercel.app/api/check-cats?secret=YOUR_CRON_SECRET"
```

That's it! You'll now receive notifications every 15 minutes when new cats are available.
