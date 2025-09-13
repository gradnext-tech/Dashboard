# GradNext Payment Dashboard

A modern, secure payment tracking dashboard built with Next.js 14, TypeScript, and Google Sheets integration. This application helps manage mentor payments, track sessions, and handle corporate billing with automated email notifications.

## 🚀 Features

### Core Functionality
- **Payment Management**: Track and manage mentor payments with due/paid status
- **Session Tracking**: Monitor individual and corporate sessions
- **Commission Calculation**: Automatic calculation of mentor commissions based on rates
- **Email Notifications**: Send payout summaries to mentors via email
- **Google Sheets Integration**: Real-time data sync with Google Sheets
- **Manual Entry**: Add manual payment entries when needed
- **Export Capabilities**: Export data to Mentor Commission sheets

### Security & Authentication
- **Password-based Authentication**: Simple master password protection
- **Domain Restriction**: Optional email domain filtering
- **Client-side Auth**: Fast, responsive authentication flow

### Data Management
- **Real-time Sync**: Live data from Google Sheets
- **Multiple Data Views**: Payments, commissions, and corporate sessions
- **Bulk Operations**: Mark multiple payments as paid
- **Data Validation**: Comprehensive input validation

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + Custom components
- **Authentication**: Custom password-based auth
- **Data Source**: Google Sheets API
- **Email**: Nodemailer
- **Icons**: Lucide React
- **Deployment**: Vercel

## 📁 Project Structure

```
GradNext_Dashboard/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── auth/                 # Authentication endpoints
│   │   │   ├── login/route.ts    # Login API
│   │   │   └── verify/route.ts   # Password verification
│   │   └── payments/route.ts     # Payment management API
│   ├── auth/                     # Authentication pages
│   │   └── signin/page.tsx       # Login page
│   ├── dashboard/page.tsx        # Main dashboard
│   └── layout.tsx                # Root layout
├── components/                    # React Components
│   ├── ui/                       # Reusable UI components
│   │   ├── button.tsx
│   │   └── card.tsx
│   ├── providers/
│   │   └── auth-provider.tsx     # Authentication context
│   ├── payment-table.tsx         # Payment data table
│   ├── mentor-commission-table.tsx
│   ├── corporate-sessions-table.tsx
│   └── add-manual-entry-form.tsx
├── lib/                          # Utility libraries
│   ├── auth.ts                   # Authentication utilities
│   ├── google-sheets.ts          # Google Sheets integration
│   └── utils.ts                  # General utilities
├── scripts/
│   └── setup.js                  # Environment setup script
├── middleware.ts                  # Next.js middleware
├── vercel.json                   # Vercel deployment config
└── package.json
```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Google Cloud Console account
- Google Sheets with proper structure
- SMTP email service (for notifications)

### 1. Clone and Install
```bash
git clone <repository-url>
cd GradNext_Dashboard
npm install
```

### 2. Environment Setup
Run the setup script to generate environment variables:
```bash
npm run setup
```

This creates a `.env.local` file with the following structure:
```env
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generated-secret

# Google OAuth (for user authentication)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Sheets API (Service Account)
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nyour-private-key-here\\n-----END PRIVATE KEY-----\\n"
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com

# Google Sheets Configuration
GOOGLE_SHEET_ID=your-google-sheet-id

# Organization Domain Restriction
ALLOWED_EMAIL_DOMAIN=yourcompany.com

# SMTP Configuration (for email notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=no-reply@gradnext.com
```

### 3. Google Cloud Setup

#### Create Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Sheets API
4. Go to "Credentials" → "Create Credentials" → "Service Account"
5. Download the JSON key file
6. Extract `private_key` and `client_email` for environment variables

#### Google Sheets Structure
Your Google Sheet should have these sheets:
- **Session Info**: Main data with columns for mentor, mentee, date, status, etc.
- **Mentor Commission**: Calculated commissions
- **Rates**: Mentor rate information
- **Corporate Sessions**: Corporate session data

### 4. Authentication Setup
The app uses a simple password-based authentication system. The master password is defined in `lib/auth.ts`:
```typescript
const MASTER_PASSWORD = 'GradNext@2025'
```

### 5. Run Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` and use the master password to access the dashboard.

## 📊 Google Sheets Integration

### Required Sheets Structure

#### Session Info Sheet
| Column | Description |
|--------|-------------|
| A | S No. |
| B | Mentor Name |
| C | Mentee Name |
| D | Session Date |
| E | Session Status |
| F | Rate |
| G | Payment Status |
| H | No. of Sessions |
| I | Total Payout |

#### Rates Sheet
| Column | Description |
|--------|-------------|
| A | Mentor Name |
| B | Rate (per session) |

#### Mentor Commission Sheet
| Column | Description |
|--------|-------------|
| A | S No. |
| B | Mentor Name |
| C | Mentee Name |
| D | Session Date |
| E | Session Status |
| F | Rate |
| G | Payment Status |
| H | No. of Sessions |
| I | Total Payout |

## 🔐 Authentication Flow

1. **Login Page**: User enters master password
2. **Verification**: Password is sent to `/api/auth/login`
3. **Validation**: Server validates against master password
4. **Session**: Client-side authentication state management
5. **Protection**: All dashboard routes require authentication

## 📧 Email Notifications

### Email Template
The system sends automated emails to mentors with pending payouts:

**Subject**: "Your pending payout summary"

**Content**:
- Personalized greeting
- Session-wise breakdown table
- Total sessions and payout amount
- Discrepancy contact information (finance@gradnext.co)
- Professional signature

### SMTP Configuration
Configure your SMTP settings in `.env.local`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=no-reply@gradnext.com
```

## 🚀 Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables for Production
Ensure all environment variables are set in your deployment platform:
- `NEXTAUTH_URL`: Your production URL
- `NEXTAUTH_SECRET`: Strong secret key
- `GOOGLE_SHEETS_*`: Google Sheets API credentials
- `SMTP_*`: Email configuration
- `ALLOWED_EMAIL_DOMAIN`: Domain restriction (optional)

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - Verify password
- `POST /api/auth/verify` - Verify authentication

### Payments
- `GET /api/payments?type=due` - Get due payments
- `GET /api/payments?type=all-payments` - Get all payments
- `GET /api/payments?type=mentor-commissions` - Get mentor commissions
- `GET /api/payments?type=corporate-sessions` - Get corporate sessions
- `POST /api/payments` - Payment operations:
  - `markPaid` - Mark payments as paid
  - `exportToMentorCommission` - Export to commission sheet
  - `addManualEntry` - Add manual entry
  - `emailMentorPayouts` - Send email notifications

## 🎨 UI Components

### Custom Components
- **Button**: Styled button with variants
- **Card**: Container component for content sections
- **PaymentTable**: Data table for payment records
- **MentorCommissionTable**: Commission-specific table
- **CorporateSessionsTable**: Corporate sessions table
- **AddManualEntryForm**: Form for manual entries

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Responsive Design**: Mobile-friendly interface
- **Dark/Light Mode**: Automatic theme detection
- **Consistent Spacing**: Design system with consistent margins/padding

## 🔍 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run setup        # Generate environment file
```

### Code Structure
- **TypeScript**: Full type safety
- **ESLint**: Code linting and formatting
- **App Router**: Next.js 14 App Router pattern
- **Server Components**: Optimized rendering
- **Client Components**: Interactive UI elements

## 🐛 Troubleshooting

### Common Issues

#### Google Sheets API Errors
- Verify service account credentials
- Check sheet permissions
- Ensure API is enabled in Google Cloud Console

#### Email Notifications Not Working
- Verify SMTP credentials
- Check email service provider settings
- Ensure FROM_EMAIL is properly configured

#### Authentication Issues
- Verify master password in `lib/auth.ts`
- Check environment variables
- Clear browser cache/localStorage

### Debug Mode
Enable debug logging by adding console.log statements in:
- `lib/google-sheets.ts` - Google Sheets operations
- `app/api/payments/route.ts` - API operations
- `components/providers/auth-provider.tsx` - Authentication flow

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is private and proprietary to GradNext.

## 🆘 Support

For technical support or questions:
- Email: apoorv@gradnext.co
- Create an issue in the repository
- Check the troubleshooting section above

---

**Built with ❤️ for GradNext**
