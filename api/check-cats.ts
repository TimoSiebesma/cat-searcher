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
const MAX_CATS_TO_NOTIFY = 10;

// Types
interface Cat {
  id: string;
  name: string;
  age: string;
  imageUrl: string;
  url: string;
}

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
    const cats = extractCats(html);

    console.log(`Found ${cats.length} cats on the page`);

    if (cats.length === 0) {
      console.warn("WARNING: No cats found. HTML structure may have changed.");
      return res.status(200).json({
        ok: true,
        found: 0,
        new: 0,
        warning: "No cats found"
      });
    }

    // Get new cats that haven't been seen before
    const newCats = await getNewCats(cats);

    console.log(`Found ${newCats.length} new cats`);

    if (newCats.length > 0) {
      // Notify via Telegram
      await notifyTelegram(newCats);

      // Persist the new cat IDs
      await persistCatIds(newCats.map(cat => cat.id));

      console.log(`Successfully notified about ${newCats.length} new cats`);
    }

    return res.status(200).json({
      ok: true,
      found: cats.length,
      new: newCats.length,
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
 * Extract cat details from HTML
 */
function extractCats(html: string): Cat[] {
  const $ = cheerio.load(html);
  const cats: Cat[] = [];

  // Find all cat listing cards/items
  $('a[href*="/katten/"]').each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    // Match pattern: /katten/<id>/<name-slug>
    const match = href.match(/\/katten\/(\d+)(?:\/([^/?]+))?/);
    if (!match || !match[1]) return;

    const id = match[1];
    const nameSlug = match[2] || "";

    // Skip if we already have this cat
    if (cats.find(c => c.id === id)) return;

    // Extract name - try multiple selectors
    let name = $(element).find("h3, h4, .name, .title").first().text().trim();
    if (!name) {
      name = $(element).attr("title") || `Cat ${id}`;
    }

    // Extract age - look for age patterns
    let age = "";
    const ageElement = $(element).find('[class*="age"], [class*="leeftijd"]').first();
    if (ageElement.length) {
      age = ageElement.text().trim();
    } else {
      // Try to find age in text content
      const text = $(element).text();
      const ageMatch = text.match(/(\d+)\s*(jaar|maand|month|year)/i);
      if (ageMatch) {
        age = ageMatch[0];
      }
    }

    // Extract image URL
    let imageUrl = "";
    const img = $(element).find("img").first();
    if (img.length) {
      imageUrl = img.attr("src") || img.attr("data-src") || "";
      // Make absolute URL if relative
      if (imageUrl && !imageUrl.startsWith("http")) {
        imageUrl = `https://www.adopteereendier.be${imageUrl}`;
      }
    }

    // Build full URL
    const url = nameSlug
      ? `https://www.adopteereendier.be/katten/${id}/${nameSlug}`
      : `https://www.adopteereendier.be/katten/${id}`;

    cats.push({
      id,
      name: name || `Cat ${id}`,
      age: age || "Unknown",
      imageUrl,
      url
    });
  });

  // Remove duplicates by ID
  const uniqueCats = cats.filter(
    (cat, index, self) => self.findIndex(c => c.id === cat.id) === index
  );

  return uniqueCats;
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
 * Compare extracted cats against Redis Set and return new ones
 */
async function getNewCats(cats: Cat[]): Promise<Cat[]> {
  const redisKey = getRedisKey();
  const newCats: Cat[] = [];

  for (const cat of cats) {
    const isMember = await kv.sismember(redisKey, cat.id);
    if (!isMember) {
      newCats.push(cat);
    }
  }

  return newCats;
}

/**
 * Persist new cat IDs to Redis Set
 */
async function persistCatIds(catIds: string[]): Promise<void> {
  if (catIds.length === 0) return;

  const redisKey = getRedisKey();

  // Add all new IDs to the set
  await kv.sadd(redisKey, ...catIds);

  // Set expiration to 90 days (to prevent infinite growth)
  await kv.expire(redisKey, 90 * 24 * 60 * 60);
}

/**
 * Send Telegram notification about new cats
 */
async function notifyTelegram(newCats: Cat[], retryCount = 1): Promise<void> {
  const count = newCats.length;
  const catsToNotify = newCats.slice(0, MAX_CATS_TO_NOTIFY);
  const remainingCount = count - catsToNotify.length;

  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

  // Send a message for each cat with image
  for (const cat of catsToNotify) {
    const caption = `🐱 *${cat.name}*\n📅 Age: ${cat.age}\n\n[View Profile →](${cat.url})`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const body: any = {
        chat_id: TELEGRAM_CHAT_ID,
        caption: caption,
        parse_mode: "Markdown"
      };

      // If we have an image, send it with the message
      if (cat.imageUrl) {
        body.photo = cat.imageUrl;
      }

      const response = await fetch(
        cat.imageUrl ? telegramUrl : `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(cat.imageUrl ? body : { chat_id: TELEGRAM_CHAT_ID, text: caption, parse_mode: "Markdown" }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Failed to send message for cat ${cat.id}: ${errorText}`);
        // Continue with other cats even if one fails
      }

      // Small delay between messages to avoid rate limiting
      await sleep(500);
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`Error sending message for cat ${cat.id}:`, error);
      // Continue with other cats
    }
  }

  // Send summary message if there are more cats
  if (remainingCount > 0) {
    const summaryMessage = `_...and ${remainingCount} more new cat${remainingCount > 1 ? "s" : ""}!_`;
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: summaryMessage,
          parse_mode: "Markdown"
        })
      });
    } catch (error) {
      console.warn("Failed to send summary message:", error);
    }
  }

  console.log(`Sent ${Math.min(count, MAX_CATS_TO_NOTIFY)} Telegram notifications`);
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
