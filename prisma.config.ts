import path from 'path'
import { loadEnvFile } from 'process'
import { defineConfig } from '@prisma/config'

// Load .env.local so DATABASE_URL is available
try { loadEnvFile(path.resolve('.env.local')) } catch {}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
