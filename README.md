# SignalDesk

SignalDesk is an intelligent opportunity monitoring system that automatically discovers, filters, and delivers freelance and job opportunities from multiple platforms. It uses AI to classify opportunities, filter by skills, and send relevant matches directly to your WhatsApp.

## 🚀 Features

- **Multi-Platform Monitoring**: Automatically fetches opportunities from:
  - Reddit (r/forhire, r/hiring, etc.)
  - Hacker News (Jobs, Who's Hiring)
  - Product Hunt
  - GitHub (Job postings)

- **AI-Powered Filtering**: 
  - Classifies opportunities using Groq AI
  - Filters by your skills and preferences
  - Generates personalized replies and cover letters
  - Creates tailored resumes

- **WhatsApp Integration**: 
  - Sends filtered opportunities directly to WhatsApp
  - Includes opportunity details and generated responses
  - Supports feedback collection

- **Automated Daily Processing**: 
  - Runs daily at midnight via cron jobs
  - Tracks and logs all activities
  - Prevents duplicate processing

- **MongoDB Storage**: 
  - Stores all opportunities and ingestion history
  - Tracks delivery status and feedback
  - Automatic cleanup of old posts

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **MongoDB** (local or cloud instance like MongoDB Atlas)
- **Google Chrome** (required for WhatsApp Web.js)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SignalDesk
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Then edit `.env` and fill in all the required values (see [Environment Variables](#environment-variables) section below).

4. **Set up MongoDB**
   - Create a MongoDB database (local or cloud)
   - Update `MONGODB_URI` in your `.env` file
   - The application will automatically create the necessary collections and indexes

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string (e.g., `mongodb://localhost:27017/reddit_opportunities` or MongoDB Atlas URI) | ✅ Yes |
| `GROQ_API_KEY` | Your Groq API key for AI processing | ✅ Yes |
| `REDDIT_CLIENT_ID` | Reddit API client ID | ✅ Yes |
| `REDDIT_CLIENT_SECRET` | Reddit API client secret | ✅ Yes |
| `REDDIT_USER_AGENT` | Reddit API user agent (format: `platform:appid:version (by /u/username)`) | ✅ Yes |
| `PRODUCTHUNT_API_TOKEN` | Product Hunt API token | ✅ Yes |
| `GITHUB_TOKEN` | GitHub personal access token | ✅ Yes |
| `RECEIVER_WHATSAPP_NUMBER` | WhatsApp number to receive opportunities (format: `countrycode+number`, e.g., `1234567890`) | ✅ Yes |

### Getting API Keys

- **Groq API Key**: Sign up at [console.groq.com](https://console.groq.com) and create an API key
- **Reddit API**: Create an app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
- **Product Hunt API**: Get token from [api.producthunt.com](https://api.producthunt.com)
- **GitHub Token**: Create a personal access token at [github.com/settings/tokens](https://github.com/settings/tokens)

## 🏃 Running Locally

### Development Mode (with auto-reload)

```bash
npm run dev
```

This uses `nodemon` to automatically restart the server when files change.

### Production Mode

```bash
npm start
```

### First Run Setup

1. When you first run the application, WhatsApp Web will need to be authenticated:
   - A QR code will appear in your terminal
   - Scan it with your WhatsApp mobile app
   - The session will be saved for future runs

2. The application will:
   - Connect to MongoDB
   - Initialize WhatsApp
   - Run the first daily processing cycle
   - Schedule future runs at midnight (00:00) daily

3. Check the console logs for:
   - Connection status
   - Processing results
   - AI call counts
   - Error messages (if any)

## 📁 Project Structure

```
SignalDesk/
├── ai/                    # AI processing modules
│   ├── api.js            # Groq API integration
│   ├── classify.js       # Opportunity classification
│   ├── skillFilter.js    # Skill-based filtering
│   └── platforms/        # Platform-specific AI prompts
├── db/                    # Database modules
│   ├── connection.js     # MongoDB connection
│   ├── ingestion.js      # Data ingestion logic
│   ├── posts.js          # Post management
│   └── state.js          # Application state
├── filters/               # Platform-specific filters
├── integrations/          # External API integrations
│   ├── github/
│   ├── hackernews/
│   ├── producthunt/
│   ├── reddit/
│   └── whatsapp/         # WhatsApp Web.js integration
├── logs/                  # Logging utilities
├── orchestrators/         # Main processing orchestrators
├── pdf/                   # Resume generation
├── utils/                 # Utility functions
├── index.js              # Main entry point
└── resume.json           # Resume template data
```

## 🔄 How It Works

1. **Fetching**: The system fetches new posts from all configured platforms
2. **Filtering**: Posts are filtered by keywords and basic criteria
3. **AI Classification**: Remaining posts are classified using AI to identify opportunities
4. **Skill Matching**: Opportunities are matched against your skills and preferences
5. **Response Generation**: AI generates personalized replies and cover letters
6. **Delivery**: Relevant opportunities are sent via WhatsApp with generated responses
7. **Storage**: All data is stored in MongoDB for tracking and deduplication

## 📊 Monitoring

The application provides detailed logging:
- Daily summaries of processed opportunities
- Platform breakdowns
- AI call counts and costs
- Error tracking
- Delivery status

## 🛠️ Technologies Used

- **Node.js** - Runtime environment
- **MongoDB** - Database
- **Groq AI** - AI processing
- **WhatsApp Web.js** - WhatsApp integration
- **Playwright** - Web scraping
- **node-cron** - Scheduled tasks
- **Express** - Web server (if needed)

## 📝 Notes

- The application runs daily at midnight (00:00) by default
- WhatsApp session is stored locally and persists between runs
- Old posts are automatically cleaned up from the database
- The system prevents duplicate processing of the same opportunities
- All AI calls are rate-limited to prevent API throttling

## 🐛 Troubleshooting

### WhatsApp QR Code Not Appearing
- Ensure Google Chrome is installed
- Check that the terminal supports QR code display
- Try running in a different terminal

### MongoDB Connection Issues
- Verify your `MONGODB_URI` is correct
- Ensure MongoDB is running (if local)
- Check network connectivity (if cloud)

### API Rate Limiting
- The application includes rate limiting for AI calls
- If you hit limits, wait a few minutes and restart

### Missing Environment Variables
- Ensure all required variables are set in `.env`
- Check that `.env` file is in the root directory
- Verify no typos in variable names

