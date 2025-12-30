# Cat Searcher Notifier 🐱

Automated notification system for new adoptable cats on adopteereendier.be. Runs on Vercel with serverless functions, KV storage, and Telegram notifications.

## Features

- ✅ Checks for new cats every 15 minutes via Vercel Cron
- ✅ Persistent tracking using Vercel KV (Redis)
- ✅ Telegram notifications with direct links
- ✅ Dynamic page fetching (automatically fetches all available pages)
- ✅ Filters out duo adoptions (cats that must be adopted together)
- ✅ Age filtering (configurable minimum age)
- ✅ Resilient error handling and retry logic
- ✅ Secure endpoint protection
- ✅ GitHub Actions fallback option

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Vercel Cron │────▶│ /api/check-cats  │────▶│ Website     │
│ (15 min)    │     │ (Serverless Fn)  │     │ HTML Parse  │
└─────────────┘     └──────────────────┘     └─────────────┘
                             │
                             ├──────▶ Vercel KV (Redis)
                             │        Store seen cat IDs
                             │
                             └──────▶ Telegram Bot API
                                      Send notifications
```

## Prerequisites

1. **Vercel Account** (free tier works)
2. **Telegram Bot**:
   - Create via [@BotFather](https://t.me/botfather)
   - Get your bot token
3. **Telegram Chat ID**:
   - Message your bot
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your `chat.id` in the response

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo>
cd cat-searcher
npm install
```

### 2. Create Vercel KV Database

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link your project
vercel link

# Create KV database
vercel storage create kv cat-notifier-kv
```

Or via Vercel Dashboard:

- Go to Storage → Create Database → KV
- Name it "cat-notifier-kv"
- Link it to your project

### 3. Configure Environment Variables

Create `.env` file locally (for testing):

```bash
cp .env.example .env
```

Edit `.env` with your values:

- `TELEGRAM_BOT_TOKEN`: Your bot token from @BotFather
- `TELEGRAM_CHAT_ID`: Your chat ID (or group chat ID)
- `CRON_SECRET`: Generate with: `openssl rand -hex 32`
- `CHECK_URL`: (optional) defaults to the cats listing page
- `FILTER_DUO_ADOPTIONS`: (optional) Set to `false` to include duo adoptions (default: `true`)

**Important**: For production, set these in Vercel Dashboard:

```bash
# Set via CLI
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_CHAT_ID
vercel env add CRON_SECRET
vercel env add CHECK_URL  # optional
vercel env add FILTER_DUO_ADOPTIONS  # optional

# Or via Vercel Dashboard:
# Project Settings → Environment Variables
```

### 4. Deploy to Vercel

```bash
vercel --prod
```

### 5. Test the Endpoint

#### Local Testing

```bash
# Start local dev server
vercel dev

# In another terminal, test the endpoint
curl -X GET "http://localhost:3000/api/check-cats?secret=YOUR_CRON_SECRET"
```

#### Production Testing

```bash
# Replace with your actual values
curl -X GET "https://your-project.vercel.app/api/check-cats?secret=YOUR_CRON_SECRET"

# Or using Authorization header:
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     "https://your-project.vercel.app/api/check-cats"
```

Expected response:

```json
{
  "ok": true,
  "totalCats": 60,
  "totalPages": 4,
  "found": 15,
  "new": 3,
  "timestamp": "2025-12-30T12:00:00.000Z"
}
```

## Filtering Configuration

### Duo Adoption Filter

By default, the bot **filters out cats that must be adopted together** with another cat (duo adoptions). This is useful if you only want to adopt a single cat.

**How it works:**

The bot detects duo adoptions by checking cat names and descriptions for patterns like:

- `duoadoptie`, `duo adoptie`, `duo-adoptie`
- `alleen samen` (only together)
- `broer/zus` mentions with adoption context
- Names with `(duoadoptie ...)` format
- Example: "Edward (duoadoptie Bella)"

**To disable this filter:**

Set the environment variable `FILTER_DUO_ADOPTIONS=false` if you want to see ALL cats including duo adoptions.

```bash
# In Vercel dashboard or via CLI:
vercel env add FILTER_DUO_ADOPTIONS
# Enter value: false
```

### Age Filter

Cats under 6 months old are filtered out by default. To change this, modify `MIN_AGE_MONTHS` in the code.

## How It Works

### Authentication

The endpoint requires authentication via:

- **Query parameter**: `?secret=YOUR_CRON_SECRET`
- **OR Authorization header**: `Authorization: Bearer YOUR_CRON_SECRET`

Vercel Cron automatically includes the secret (configured in `vercel.json`).

### Cron Schedule

Runs every 15 minutes: `*/15 * * * *`

Vercel's cron schedule uses standard cron syntax:

```
*/15 * * * *
│    │ │ │ │
│    │ │ │ └─── Day of week (0-7)
│    │ │ └───── Month (1-12)
│    │ └─────── Day of month (1-31)
│    └───────── Hour (0-23)
└────────────── Minute (0-59)
```

### Cat ID Extraction

The function:

1. Fetches the HTML page with browser-like headers
2. Uses Cheerio to parse HTML
3. Finds all links matching `/katten/<id>/` pattern
4. Extracts unique numeric IDs

### Deduplication

- Cat IDs stored in Redis Set: `seen:cats:<hash>`
- Hash is based on the CHECK_URL (allows multiple URLs)
- Set expires after 90 days to prevent infinite growth
- Only new IDs trigger notifications

### Telegram Notification Format

```
🐱 3 new cats available for adoption!

• Cat 12345
  https://www.adopteereendier.be/katten/12345
• Cat 12346
  https://www.adopteereendier.be/katten/12346
• Cat 12347
  https://www.adopteereendier.be/katten/12347

+2 more...
```

Shows up to 10 links, then indicates remaining count.

## Error Handling

- **Network timeouts**: 15 second timeout with 1 retry
- **HTML parsing failures**: Logs warning, doesn't clear storage
- **Telegram failures**: Retries once, then fails gracefully
- **Missing env vars**: Returns 500 with clear error message

## Monitoring

Check Vercel logs:

```bash
vercel logs --follow
```

Or in Vercel Dashboard → Deployments → Function Logs

Look for:

- `Found X cat IDs on the page`
- `Found Y new cat IDs`
- `Successfully notified about Y new cats`
- Any WARNING or ERROR messages

## GitHub Actions Fallback

If Vercel Cron is unavailable, use GitHub Actions (see `.github/workflows/check-cats.yml`).

**Setup**:

1. Add secrets to your GitHub repository:

   - Settings → Secrets → Actions
   - Add: `VERCEL_ENDPOINT_URL` (your full endpoint URL)
   - Add: `CRON_SECRET`

2. The workflow runs every 15 minutes and calls your Vercel endpoint

## Troubleshooting

### No notifications received

1. Check Telegram bot token and chat ID:

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getMe"
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```

2. Verify environment variables in Vercel Dashboard

3. Check Vercel logs for errors

### "No cat IDs found" warning

The HTML structure may have changed. Check:

1. Visit the URL manually
2. Inspect link patterns (should be `/katten/<id>/`)
3. Update `extractCatIds()` function if needed

### Cron not running

1. Verify Vercel plan supports Cron (Hobby/Pro)
2. Check `vercel.json` syntax
3. View cron jobs: Vercel Dashboard → Settings → Cron

### KV connection errors

1. Ensure KV database is linked to your project
2. Check environment variables include KV credentials
3. Verify KV instance is in the same region

## Cost Estimation

**Vercel Free Tier**:

- ✅ 100 GB-hours serverless function execution/month
- ✅ 3,000 cron invocations/month (more than enough for 4/hour)
- ✅ Vercel KV: 256 MB storage, 100K commands/month

This project fits entirely within the free tier.

## Customization

### Change check interval

Edit `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/check-cats",
      "schedule": "*/30 * * * *" // Every 30 minutes
    }
  ]
}
```

### Monitor multiple URLs

Set different CHECK_URL values and deploy separate functions, or modify the code to loop through multiple URLs.

### Custom notification format

Edit the `notifyTelegram()` function in `api/check-cats.ts`.

## Security Notes

- ✅ Endpoint protected with secret token
- ✅ No sensitive data in code
- ✅ Environment variables for all secrets
- ✅ No cookies or session tokens needed
- ✅ Redis keys auto-expire to limit storage

## License

MIT

## Support

For issues with:

- **Vercel**: [Vercel Docs](https://vercel.com/docs)
- **Telegram Bot**: [Bot API Docs](https://core.telegram.org/bots/api)
- **This project**: Open an issue on GitHub
