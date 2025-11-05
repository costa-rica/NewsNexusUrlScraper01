# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NewsNexusUrlScraper01 is a TypeScript microservice that scrapes article content from URLs using a cascading fallback strategy and stores it in a SQLite database. It:
- Connects to the NewsNexusDb09 database using the NewsNexusDb09 package
- Iterates through articles in the Articles table
- Attempts to scrape content using Cheerio (lightweight, fast) first
- Falls back to Puppeteer (headless browser) if Cheerio fails
- Tracks scraping status for both methods in the database
- Stores scraped content in the ArticleContents table (linking via ArticleContents.articleId → Articles.id)
- Skips articles where both scraping methods have previously failed

## Database Connection

This project uses the **NewsNexusDb09** package for database access. Key points:

- **No .env file needed**: Environment variables are inherited from the importing application
- **Required environment variables**:
  - `PATH_DATABASE`: Directory path for the database file
  - `NAME_DB`: Database filename
- **Database type**: SQLite via Sequelize ORM
- **Import pattern**: `import { initModels, Article, ArticleContent, sequelize } from 'newsnexusdb09';`

### Relevant Tables

**Articles table** (`Article` model):
- Contains `id`, `url`, `title`, `author`, `publicationName`, `description`, etc.
- The `url` field contains the article URL to scrape

**ArticleContents table** (`ArticleContent` model):
- Fields: `id`, `articleId` (FK to Articles.id), `content` (full article text), `scrapeStatusCheerio`, `scrapeStatusPuppeteer`
- Stores the scraped content and tracks scraping attempt status
- Status fields are BOOLEAN with NULL default:
  - `null` = method not attempted yet
  - `true` = method succeeded
  - `false` = method failed
- One-to-many relationship: Articles can have multiple content versions

## Architecture Guidelines

### Database Model Pattern

When working with NewsNexusDb09 models, follow this pattern:

```typescript
import { initModels, Article, ArticleContent, sequelize } from 'newsnexusdb09';

// Initialize models once per process
const models = initModels();

// Query articles
const articles = await Article.findAll({
  where: { /* conditions */ },
  include: [/* associations */]
});

// Create article content
await ArticleContent.create({
  articleId: article.id,
  content: scrapedContent
});
```

### Key Model Relationships

- **Article → ArticleContent** (1:Many): Articles can have multiple content versions
- All tables include `createdAt` and `updatedAt` timestamps (managed automatically by Sequelize)

### Cascading Scraping Strategy

The scraper uses a two-tier approach to maximize success while minimizing resource usage:

1. **Cheerio (Fast & Lightweight)**:
   - Attempts first for all articles without content
   - Uses axios + cheerio for static HTML parsing
   - Minimum content threshold: 200 characters
   - Sets `scrapeStatusCheerio = true` on success, `false` on failure

2. **Puppeteer (Robust Fallback)**:
   - Only used when Cheerio fails (`scrapeStatusCheerio = false`)
   - Headless Chrome browser that handles JavaScript-rendered content
   - Minimum content threshold: 200 characters
   - Sets `scrapeStatusPuppeteer = true` on success, `false` on failure

3. **Retry Logic**:
   - Articles without any content → Try Cheerio
   - Articles with `scrapeStatusCheerio = null` → Try Cheerio
   - Articles with `scrapeStatusCheerio = false` and `scrapeStatusPuppeteer = null` → Try Puppeteer
   - Articles with both `scrapeStatusCheerio = false` AND `scrapeStatusPuppeteer = false` → Skip (both methods failed)

4. **Database Updates**:
   - ArticleContent records are created after first scraping attempt (even if failed)
   - This allows tracking of failed attempts to avoid infinite retries
   - 1-second delay between articles to avoid overwhelming servers

## Project Structure

This is a TypeScript project:
```
NewsNexusUrlScraper01/
├── src/                     # TypeScript source files
│   ├── index.ts            # Main orchestration logic with cascading scrape workflow
│   ├── cheerioScraper.ts   # Cheerio-based scraping (fast, static HTML)
│   └── scraper.ts          # Puppeteer-based scraping (robust, JS-rendered content)
├── dist/                   # Compiled JavaScript output
├── docs/                   # Documentation
│   └── DATABASE_OVERVIEW.md
├── .env                    # Environment variables (PATH_DATABASE, NAME_DB)
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── CLAUDE.md              # This file
```

## Development Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled scraper (node dist/index.js)
- `npm run dev` - Build and run in one command
