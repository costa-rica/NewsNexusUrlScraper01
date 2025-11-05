import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { initModels, Article, ArticleContent, sequelize } from 'newsnexusdb09';
import { scrapeArticleContentWithCheerio } from './cheerioScraper';
import { scrapeArticleContentWithPuppeteer } from './scraper';

interface ScrapingStats {
  total: number;
  cheerioSuccess: number;
  cheerioFailed: number;
  puppeteerSuccess: number;
  puppeteerFailed: number;
  skipped: number;
}

/**
 * Main function that orchestrates the article scraping process with cascading fallback
 */
async function main() {
  console.log('=== NewsNexusUrlScraper01 Starting ===\n');

  const stats: ScrapingStats = {
    total: 0,
    cheerioSuccess: 0,
    cheerioFailed: 0,
    puppeteerSuccess: 0,
    puppeteerFailed: 0,
    skipped: 0,
  };

  try {
    // Initialize database models
    console.log('Connecting to database...');
    initModels();
    await sequelize.authenticate();
    console.log('Database connected successfully\n');

    // Query for articles that need scraping
    // We want articles where:
    // 1. No ArticleContent exists, OR
    // 2. scrapeStatusCheerio is NULL (not attempted), OR
    // 3. scrapeStatusCheerio = false AND scrapeStatusPuppeteer is NULL (Cheerio failed, Puppeteer not attempted)
    // BUT exclude where both scrapeStatusCheerio = false AND scrapeStatusPuppeteer = false (both failed)
    console.log('Querying for articles that need scraping...');

    const articlesToScrape = await Article.findAll({
      include: [
        {
          model: ArticleContent,
          required: false, // LEFT JOIN to include articles without content
        },
      ],
    });

    // Filter articles based on scraping status
    const filteredArticles = articlesToScrape.filter((article: any) => {
      const contents = article.ArticleContents;

      // No content at all - needs scraping
      if (!contents || contents.length === 0) {
        return true;
      }

      // Get the first (should be only) content record
      const content = contents[0];

      // Both methods failed - skip
      if (content.scrapeStatusCheerio === false && content.scrapeStatusPuppeteer === false) {
        return false;
      }

      // Cheerio not attempted yet - needs scraping
      if (content.scrapeStatusCheerio === null) {
        return true;
      }

      // Cheerio failed but Puppeteer not attempted - needs scraping
      if (content.scrapeStatusCheerio === false && content.scrapeStatusPuppeteer === null) {
        return true;
      }

      // Article already has content or doesn't need scraping
      return false;
    });

    stats.total = filteredArticles.length;
    console.log(`Found ${stats.total} articles that need scraping\n`);

    if (stats.total === 0) {
      console.log('No articles to scrape. Exiting.');
      return;
    }

    // Process each article
    for (let i = 0; i < filteredArticles.length; i++) {
      const article: any = filteredArticles[i];
      const progress = `[${i + 1}/${stats.total}]`;

      console.log(`\n${progress} Processing Article ID: ${article.id}`);
      console.log(`  Title: ${article.title || 'N/A'}`);
      console.log(`  URL: ${article.url || 'N/A'}`);

      // Skip articles without URLs
      if (!article.url) {
        console.log(`  ⚠️  Skipped: No URL available`);
        stats.skipped++;
        continue;
      }

      const existingContent =
        article.ArticleContents && article.ArticleContents.length > 0
          ? article.ArticleContents[0]
          : null;

      // Determine which scraping method to use
      const needsCheerio =
        !existingContent || existingContent.scrapeStatusCheerio === null;
      const needsPuppeteer =
        existingContent &&
        existingContent.scrapeStatusCheerio === false &&
        existingContent.scrapeStatusPuppeteer === null;

      // Try Cheerio first (if needed)
      if (needsCheerio) {
        console.log(`  🔍 Attempting Cheerio scraping...`);
        const result = await scrapeArticleContentWithCheerio(article.url);

        if (result.success && result.content) {
          // Cheerio succeeded
          if (existingContent) {
            // Update existing record
            await existingContent.update({
              content: result.content,
              scrapeStatusCheerio: true,
            });
          } else {
            // Create new record
            await ArticleContent.create({
              articleId: article.id,
              content: result.content,
              scrapeStatusCheerio: true,
              scrapeStatusPuppeteer: null,
            });
          }

          stats.cheerioSuccess++;
          console.log(`  ✓ Cheerio Success: Scraped ${result.content.length} characters`);
        } else {
          // Cheerio failed - mark as failed and continue to Puppeteer
          if (existingContent) {
            await existingContent.update({
              scrapeStatusCheerio: false,
            });
          } else {
            // Create record with failed status
            await ArticleContent.create({
              articleId: article.id,
              content: '',
              scrapeStatusCheerio: false,
              scrapeStatusPuppeteer: null,
            });
          }

          stats.cheerioFailed++;
          console.log(`  ✗ Cheerio Failed: ${result.error || 'Unknown error'}`);

          // Now try Puppeteer as fallback
          console.log(`  🔍 Attempting Puppeteer scraping...`);
          const puppeteerResult = await scrapeArticleContentWithPuppeteer(article.url);

          if (puppeteerResult.success && puppeteerResult.content) {
            // Puppeteer succeeded
            const contentRecord =
              existingContent ||
              (await ArticleContent.findOne({ where: { articleId: article.id } }));

            if (contentRecord) {
              await contentRecord.update({
                content: puppeteerResult.content,
                scrapeStatusPuppeteer: true,
              });
            }

            stats.puppeteerSuccess++;
            console.log(
              `  ✓ Puppeteer Success: Scraped ${puppeteerResult.content.length} characters`
            );
          } else {
            // Puppeteer also failed
            const contentRecord =
              existingContent ||
              (await ArticleContent.findOne({ where: { articleId: article.id } }));

            if (contentRecord) {
              await contentRecord.update({
                scrapeStatusPuppeteer: false,
              });
            }

            stats.puppeteerFailed++;
            console.log(`  ✗ Puppeteer Failed: ${puppeteerResult.error || 'Unknown error'}`);
          }
        }
      } else if (needsPuppeteer) {
        // Only try Puppeteer (Cheerio already failed previously)
        console.log(`  🔍 Attempting Puppeteer scraping (Cheerio previously failed)...`);
        const result = await scrapeArticleContentWithPuppeteer(article.url);

        if (result.success && result.content) {
          // Puppeteer succeeded
          await existingContent.update({
            content: result.content,
            scrapeStatusPuppeteer: true,
          });

          stats.puppeteerSuccess++;
          console.log(`  ✓ Puppeteer Success: Scraped ${result.content.length} characters`);
        } else {
          // Puppeteer failed
          await existingContent.update({
            scrapeStatusPuppeteer: false,
          });

          stats.puppeteerFailed++;
          console.log(`  ✗ Puppeteer Failed: ${result.error || 'Unknown error'}`);
        }
      }

      // Small delay to avoid overwhelming servers
      if (i < filteredArticles.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Print final statistics
    console.log('\n=== Scraping Complete ===');
    console.log(`Total articles processed: ${stats.total}`);
    console.log(`Cheerio - Success: ${stats.cheerioSuccess}, Failed: ${stats.cheerioFailed}`);
    console.log(
      `Puppeteer - Success: ${stats.puppeteerSuccess}, Failed: ${stats.puppeteerFailed}`
    );
    console.log(`Skipped (no URL): ${stats.skipped}`);
    const totalSuccess = stats.cheerioSuccess + stats.puppeteerSuccess;
    console.log(`Overall success rate: ${((totalSuccess / stats.total) * 100).toFixed(1)}%`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await sequelize.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the main function
main()
  .then(() => {
    console.log('\n✓ Process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Process failed:', error);
    process.exit(1);
  });
