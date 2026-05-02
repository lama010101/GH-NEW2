import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });

const DB2_URL = "https://gzvixlvkwjsrtmtybtkf.supabase.co";
const DB2_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DB2_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
  process.exit(1);
}

async function main() {
  console.log("=== MIGRATION VERIFICATION ===\n");

  // 1. Total images in DB2
  console.log("1. Total images in DB2:");
  const imagesCountUrl = `${DB2_URL}/rest/v1/images?select=count`;
  const imagesResponse = await fetch(imagesCountUrl, {
    method: "GET",
    headers: {
      apikey: DB2_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${DB2_SERVICE_ROLE_KEY}`
    }
  });
  const imagesCount = await imagesResponse.json();
  console.log(JSON.stringify(imagesCount, null, 2));

  // 2. Validated events in DB2
  console.log("\n2. Validated events in DB2:");
  const validatedUrl = `${DB2_URL}/rest/v1/events?select=count&status=eq.validated`;
  const validatedResponse = await fetch(validatedUrl, {
    method: "GET",
    headers: {
      apikey: DB2_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${DB2_SERVICE_ROLE_KEY}`
    }
  });
  const validatedCount = await validatedResponse.json();
  console.log(JSON.stringify(validatedCount, null, 2));

  // 3. No_image events in DB2
  console.log("\n3. No_image events in DB2:");
  const noImageUrl = `${DB2_URL}/rest/v1/events?select=count&status=eq.no_image`;
  const noImageResponse = await fetch(noImageUrl, {
    method: "GET",
    headers: {
      apikey: DB2_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${DB2_SERVICE_ROLE_KEY}`
    }
  });
  const noImageCount = await noImageResponse.json();
  console.log(JSON.stringify(noImageCount, null, 2));

  // 4. Sample events with images
  console.log("\n4. Sample events with images (title + url):");
  const sampleUrl = `${DB2_URL}/rest/v1/events?select=title,images(url)&status=eq.validated&limit=3`;
  const sampleResponse = await fetch(sampleUrl, {
    method: "GET",
    headers: {
      apikey: DB2_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${DB2_SERVICE_ROLE_KEY}`
    }
  });
  const sampleData = await sampleResponse.json();
  console.log(JSON.stringify(sampleData, null, 2));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
