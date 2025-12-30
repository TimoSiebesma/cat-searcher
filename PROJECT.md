# Project Structure

```
cat-searcher/
├── api/
│   └── check-cats.ts          # Main serverless function
├── .github/
│   └── workflows/
│       └── check-cats.yml     # GitHub Actions fallback
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── vercel.json                # Vercel cron + config
├── test-local.ts              # Local testing script
├── README.md                  # Full documentation
└── QUICKSTART.md              # Quick setup guide
```

## Key Files

### api/check-cats.ts

Main serverless function that:

- Fetches cat listing page
- Extracts cat IDs from HTML
- Compares with Redis stored IDs
- Sends Telegram notifications for new cats
- Persists new IDs to Redis

### vercel.json

Configures:

- Cron job to run every 15 minutes
- Environment variable references

### .github/workflows/check-cats.yml

GitHub Actions fallback that calls the Vercel endpoint every 15 minutes.

## Environment Variables

Required:

- `TELEGRAM_BOT_TOKEN`: Bot token from @BotFather
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID
- `CRON_SECRET`: Random secret for endpoint protection
- `CHECK_URL`: (optional) URL to check for cats
- Vercel KV variables (auto-configured by Vercel)

## Deployment Checklist

- [ ] Create Telegram bot via @BotFather
- [ ] Get chat ID
- [ ] Generate CRON_SECRET
- [ ] Install Vercel CLI: `npm i -g vercel`
- [ ] Deploy: `vercel --prod`
- [ ] Create KV database: `vercel storage create kv`
- [ ] Set environment variables in Vercel Dashboard
- [ ] Test endpoint manually
- [ ] Verify cron job runs (check logs after 15 min)
- [ ] (Optional) Set up GitHub Actions fallback

## Testing

Local:

```bash
npm install
cp .env.example .env
# Edit .env with your values
npm run test:local
```

Production:

```bash
curl "https://your-project.vercel.app/api/check-cats?secret=YOUR_SECRET"
```

## Monitoring

View logs:

```bash
vercel logs --follow
```

Or in Vercel Dashboard → Deployments → Function Logs

## Troubleshooting

Common issues:

1. **No notifications**: Check bot token and chat ID
2. **No cats found**: HTML structure may have changed
3. **Cron not running**: Verify Vercel plan supports cron
4. **KV errors**: Ensure database is linked to project
