# Database Connection Guide

This guide helps coders connect to the GENERATOR project database and troubleshoot common connection issues.

## Quick Start

### Prerequisites
- Node.js 18+ installed
- Project dependencies installed (`npm install`)
- Access to the Supabase project credentials

### Step 1: Environment Setup
Copy the example environment file:
```bash
cp .env.example .env.local
```

### Step 2: Fill Required Variables
Edit `.env.local` with the following required variables:

```env
# Supabase Project Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SECRET_KEY=your-secret-key

# Database Connection (REQUIRED)
SUPABASE_DB_PASSWORD=your-db-password
SUPABASE_DB_CONNECTION=postgresql://postgres.project-ref:password@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```

### Step 3: Test Connection
Run the database inspection script:
```bash
npm run db:inspect
```

Or run the detailed report:
```bash
npx tsx scripts/simple_db_report.ts
```

## Connection Methods

### Method 1: Supabase Client (Recommended)
Use the built-in Supabase client for application-level operations:
```typescript
import { getSupabaseServerClient } from '../src/lib/supabaseServer';

const supabase = getSupabaseServerClient();
const { data, error } = await supabase.from('prompts').select('*');
```

### Method 2: Direct PostgreSQL Connection
For administrative tasks and detailed reporting:
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_CONNECTION,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query('SELECT COUNT(*) FROM prompts');
```

## Troubleshooting

### Common Issues

#### 1. "Missing environment variable" Error
**Cause:** Required environment variables not set in `.env.local`
**Solution:** Ensure all required variables are present:
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_DB_PASSWORD=
SUPABASE_DB_CONNECTION=
```

#### 2. "Invalid API key" Error
**Cause:** Incorrect or expired Supabase keys
**Solution:** 
- Verify keys in Supabase dashboard
- Ensure service role key (not anon key) is used
- Check for trailing spaces or special characters

#### 3. "getaddrinfo ENOTFOUND" Error
**Cause:** Network connectivity or incorrect connection string
**Solution:**
- Verify Supabase URL format: `https://project-ref.supabase.co`
- Check connection string format: `postgresql://postgres.project-ref:password@host:port/database`
- Ensure no firewall blocks the connection

#### 4. SSL/TLS Certificate Issues
**Cause:** SSL verification problems
**Solution:** Add SSL configuration to pool:
```typescript
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_CONNECTION,
  ssl: { 
    rejectUnauthorized: false  // For development only
  }
});
```

### Debug Steps

1. **Verify Environment Loading**
```bash
npx tsx -e "
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
console.log('SUPABASE_DB_CONNECTION:', process.env.SUPABASE_DB_CONNECTION ? '✅' : '❌');
"
```

2. **Test Basic Connectivity**
```bash
npx tsx scripts/simple_db_report.ts
```

3. **Check Supabase Client**
```bash
npx tsx -e "
import '../src/infrastructure/env/loadEnvironment';
const { getSupabaseServerClient } = require('../src/lib/supabaseServer');
const supabase = getSupabaseServerClient();
supabase.from('prompts').select('count').then(console.log).catch(console.error);
"
```

## Database Schema Overview

### Core Tables
- **prompts** (40 columns) - Main prompt entities
- **auth_model_results** (9 columns) - Verification results
- **auth_reports** (8 columns) - Verification reports
- **prompt_verifications** (6 columns) - Verification tracking

### Observability Tables
- **verification_audit_log** - Audit trail
- **verification_metrics** - Performance metrics
- **promotion_audit_log** - Promotion tracking

### Key Constraints
- Unique fingerprint constraint on prompts table
- Foreign key relationships between verification tables
- Comprehensive indexing for performance

## Best Practices

### Security
- Never commit `.env.local` to version control
- Use service role keys only for server-side operations
- Rotate keys regularly in production

### Performance
- Use the Supabase client for application code
- Use direct PostgreSQL only for administrative tasks
- Leverage existing indexes for queries

### Development
- Test connections after environment changes
- Use the provided scripts for verification
- Check the database report before major changes

## Getting Help

1. Check this guide first for common issues
2. Run the diagnostic scripts provided
3. Verify environment variables are correctly set
4. Consult the project architecture documentation

## Scripts Reference

- `npm run db:inspect` - Basic table accessibility check
- `npx tsx scripts/simple_db_report.ts` - Comprehensive database report
- `npm run db:test` - Supabase connectivity test
- `npm run env:check` - Environment validation
