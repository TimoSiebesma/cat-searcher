import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";
import * as cheerio from "cheerio";
import * as crypto from "crypto";

// Configuration from environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const CRON_SECRET = process.env.CRON_SECRET!;
const CHECK_URL = process.env.CHECK_URL || "https://www.adopteereendier.be/katten?gedragkinderen=6%2C14&leeftijd=0-2&regio=";

// Constants
const FETCH_TIMEOUT = 15000; // 15 seconds
const MAX_LINKS_IN_MESSAGE = 10;

/**
 * Main handler for the serverless function
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Security: Validate cron secret
    const providedSecret = req.headers.authorization?.replace("Bearer ", "") || req.query.secret;
    if (providedSecret !== CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate environment variables
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !CRON_SECRET) {
      console.error("Missing required environment variables");
      return res.status(500).json({
        error: "Server misconfigured",
        details: "Missing environment variables"
      });
    }

    console.log(`[${new Date().toISOString()}] Starting cat check for: ${CHECK_URL}`);

    // Fetch and parse the listing page
    const html = await fetchListing(CHECK_URL);
    const catIds = extractCatIds(html);

    console.log(`Found ${catIds.length} cat IDs on the page`);

    if (catIds.length === 0) {
      console.warn("WARNING: No cat IDs found. HTML structure may have changed.");
      return res.status(200).json({
        ok: true,
        found: 0,
        new: 0,
        warning: "No cat IDs found"
      });
    }

    // Get new IDs that haven't been seen before
    const newIds = await getNewIds(catIds);

    console.log(`Found ${newIds.length} new cat IDs`);

    if (newIds.length > 0) {
      // Notify via Telegram
      await notifyTelegram(newIds);

      // Persist the new IDs
      await persistIds(newIds);

      console.log(`Successfully notified about ${newIds.length} new cats`);
    }

    return res.status(200).json({
      ok: true,
      found: catIds.length,
      new: newIds.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error in check-cats handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * Fetch the cat listing page with timeout and retry logic
 */
async function fetchListing(url: string, retryCount = 1): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "nl,en-US;q=0.7,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);

    // Retry once on transient failures
    if (retryCount > 0 && error instanceof Error && (error.name === "AbortError" || error.message.includes("fetch"))) {
      console.warn(`Fetch failed, retrying... (${error.message})`);
      await sleep(2000); // Wait 2 seconds before retry
      return fetchListing(url, retryCount - 1);
    }

    throw error;
  }
}

/**
 * Extract cat IDs from HTML by finding links matching /katten/<id>/
 */
function extractCatIds(html: string): string[] {
  const $ = cheerio.load(html);
  const catIds = new Set<string>();

  // Find all links matching /katten/<id>/ pattern
  $('a[href*="/katten/"]').each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      // Match pattern: /katten/<id>/ or /katten/<id>
      const match = href.match(/\/katten\/(\d+)/);
      if (match && match[1]) {
        catIds.add(match[1]);
      }
    }
  });

  return Array.from(catIds).sort();
}

/**
 * Get the Redis key for storing seen cat IDs
 */
function getRedisKey(): string {
  // Create a hash of the URL to create a unique key
  const hash = crypto.createHash("md5").update(CHECK_URL).digest("hex").substring(0, 8);
  return `seen:cats:${hash}`;
}

/**
 * Compare extracted IDs against Redis Set and return new ones
 */
async function getNewIds(catIds: string[]): Promise<string[]> {
  const redisKey = getRedisKey();
  const newIds: string[] = [];

  for (const id of catIds) {
    const isMember = await kv.sismember(redisKey, id);
    if (!isMember) {
      newIds.push(id);
    }
  }

  return newIds;
}

/**
 * Persist new cat IDs to Redis Set
 */
async function persistIds(newIds: string[]): Promise<void> {
  if (newIds.length === 0) return;

  const redisKey = getRedisKey();

  // Add all new IDs to the set
  await kv.sadd(redisKey, ...newIds);

  // Set expiration to 90 days (to prevent infinite growth)
  await kv.expire(redisKey, 90 * 24 * 60 * 60);
}

/**
 * Send Telegram notification about new cats
 */
async function notifyTelegram(newIds: string[], retryCount = 1): Promise<void> {
  const count = newIds.length;
  const displayIds = newIds.slice(0, MAX_LINKS_IN_MESSAGE);
  const remainingCount = count - displayIds.length;

  // Build message
  let message = `🐱 *${count} new cat${count > 1 ? "s" : ""} available for adoption!*\n\n`;

  displayIds.forEach(id => {
    const url = `https://www.adopteereendier.be/katten/${id}`;
    message += `• [Cat ${id}](${url})\n`;
  });

  if (remainingCount > 0) {
    message += `\n_+${remainingCount} more..._`;
  }

  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
    }

    console.log("Telegram notification sent successfully");
  } catch (error) {
    clearTimeout(timeoutId);

    // Retry once on transient failures
    if (retryCount > 0 && error instanceof Error && (error.name === "AbortError" || error.message.includes("fetch"))) {
      console.warn(`Telegram notification failed, retrying... (${error.message})`);
      await sleep(2000);
      return notifyTelegram(newIds, retryCount - 1);
    }

    throw error;
  }
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
