import { config } from "dotenv";
import { lookup } from "dns";
import { promisify } from "util";

config({ path: ".env.local" });

const conn = process.env.SUPABASE_DB_CONNECTION;

if (!conn) {
  console.error("❌ SUPABASE_DB_CONNECTION is not set in .env.local");
  process.exit(1);
}

// Validate format without exposing credentials
const parts = conn.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);

if (!parts) {
  console.error("❌ Invalid connection string format");
  console.error("   Expected: postgresql://user:password@host:port/database");
  console.error("   Your format appears wrong. Check for:");
  console.error("   - Missing 'postgresql://' prefix");
  console.error("   - Missing password or @ separator");
  console.error("   - Hostname extraction failed");
  process.exit(1);
}

const [, user, password, host, port, database] = parts;

console.log("✅ Connection string format is valid");
console.log(`   User: ${user}`);
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   Database: ${database}`);
console.log(`   Password: ${password ? "***" : "MISSING"}`);

const lookupPromise = promisify(lookup);

async function checkHost() {
  console.log(`\n🔍 Checking DNS for host: ${host}...`);
  try {
    await lookupPromise(host);
    console.log("✅ Hostname resolves");
  } catch (error) {
    console.error(`❌ Cannot resolve hostname: ${host}`);
    console.error("   Check your internet connection or verify the host is correct");
    process.exit(1);
  }
}

checkHost();
