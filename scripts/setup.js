#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

console.log('🚀 Setting up GradNext Payment Dashboard...\n')

// Generate a random secret for NextAuth
const nextAuthSecret = crypto.randomBytes(32).toString('base64')

// Create .env.local from template
const envTemplate = `# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=${nextAuthSecret}

# Google OAuth (for user authentication)
# Get these from Google Cloud Console > Credentials > OAuth 2.0 Client ID
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Sheets API (Service Account)
# Get these from your service account JSON file
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nyour-private-key-here\\n-----END PRIVATE KEY-----\\n"
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com

# Google Sheets Configuration
# Get this from your Google Sheet URL
GOOGLE_SHEET_ID=your-google-sheet-id

# Organization Domain Restriction
# Only users with email addresses from this domain can access the dashboard
ALLOWED_EMAIL_DOMAIN=yourcompany.com
`

const envPath = path.join(process.cwd(), '.env.local')

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envTemplate)
  console.log('✅ Created .env.local file with generated NextAuth secret')
} else {
  console.log('⚠️  .env.local already exists, skipping...')
}

console.log('\n📋 Next steps:')
console.log('1. Set up Google Cloud Console:')
console.log('   - Create a project and enable Google Sheets API')
console.log('   - Create OAuth 2.0 credentials for web application')
console.log('   - Create a service account and download JSON key')
console.log('   - Share your Google Sheet with the service account email')
console.log('')
console.log('2. Update .env.local with your Google credentials and organization domain')
console.log('')
console.log('3. Create your Google Sheet with these columns:')
console.log('   A: Name | B: Amount | C: Due Date | D: Payment Status | E: Description | F: Email | G: ID')
console.log('')
console.log('4. Run the development server:')
console.log('   npm run dev')
console.log('')
console.log('📖 For detailed setup instructions, see README.md')
