/**
 * Local test script for the check-cats function
 *
 * Usage:
 * 1. Copy .env.example to .env and fill in your values
 * 2. Run: npm run test:local
 */

import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, ".env") });

async function testCheckCats() {
  console.log("🧪 Testing check-cats function...\n");

  // Validate environment variables
  const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "CRON_SECRET"];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:", missing.join(", "));
    console.error("Please create a .env file based on .env.example\n");
    process.exit(1);
  }

  try {
    // Import the handler
    const { default: handler } = await import("./api/check-cats.ts");

    // Create mock request and response objects
    const mockReq = {
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`
      },
      query: {}
    };

    let responseData: any = null;
    let statusCode = 200;

    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        responseData = data;
        return mockRes;
      }
    };

    // Call the handler
    await handler(mockReq as any, mockRes as any);

    // Display results
    console.log(`\n📊 Results:`);
    console.log(`Status: ${statusCode}`);
    console.log(`Response:`, JSON.stringify(responseData, null, 2));

    if (statusCode === 200 && responseData?.ok) {
      console.log("\n✅ Test completed successfully!");
      if (responseData.new > 0) {
        console.log(`🎉 ${responseData.new} new cat(s) found and notified!`);
      } else {
        console.log(`ℹ️  No new cats found (${responseData.found} total cats checked)`);
      }
    } else {
      console.log("\n⚠️  Test completed with warnings or errors");
    }
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testCheckCats();
