import puppeteer, { Browser, Page } from 'puppeteer';

export interface ScrapeResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Scrapes article content from a URL using Puppeteer
 * Handles JavaScript-rendered content by using a headless browser
 */
export async function scrapeArticleContentWithPuppeteer(url: string): Promise<ScrapeResult> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`Scraping with Puppeteer: ${url}`);

    // Launch headless browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    page = await browser.newPage();

    // Set a reasonable timeout
    await page.setDefaultTimeout(30000);

    // Set user agent to avoid bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to the URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Extract text content from the page
    // This targets common article containers and paragraphs
    const content = await page.evaluate(() => {
      // Try to find article content using common selectors
      const selectors = [
        'article',
        '[role="article"]',
        '.article-content',
        '.article-body',
        '.entry-content',
        'main',
        '.post-content',
        '.story-body',
      ];

      let articleElement = null;

      // Find the first matching selector
      for (const selector of selectors) {
        articleElement = document.querySelector(selector);
        if (articleElement) break;
      }

      // If no article container found, use body
      const container = articleElement || document.body;

      // Extract all paragraph text
      const paragraphs = Array.from(container.querySelectorAll('p'));
      const textContent = paragraphs
        .map((p) => (p as HTMLElement).textContent?.trim())
        .filter((text) => text && text.length > 0)
        .join('\n\n');

      return textContent || (container as HTMLElement).textContent?.trim() || '';
    });

    await browser.close();

    // Minimum content length threshold: 200 characters
    if (!content || content.length < 200) {
      return {
        success: false,
        error: `Content too short (${content.length} chars, minimum 200)`,
      };
    }

    return {
      success: true,
      content: content,
    };
  } catch (error) {
    // Clean up browser if still open
    if (browser) {
      await browser.close().catch(() => {});
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error scraping ${url}: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
