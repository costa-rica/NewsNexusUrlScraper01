import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapeResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Scrapes article content from a URL using Cheerio (lightweight HTML parser)
 * Works for static HTML pages but won't handle JavaScript-rendered content
 */
export async function scrapeArticleContentWithCheerio(url: string): Promise<ScrapeResult> {
  try {
    console.log(`Scraping with Cheerio: ${url}`);

    // Fetch the HTML content
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      maxRedirects: 5,
    });

    // Load HTML into Cheerio
    const $ = cheerio.load(response.data);

    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .advertisement, .ad').remove();

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
      '.content',
    ];

    let articleElement = null;

    // Find the first matching selector
    for (const selector of selectors) {
      articleElement = $(selector);
      if (articleElement.length > 0) break;
    }

    // If no article container found, use body
    const container = articleElement && articleElement.length > 0 ? articleElement : $('body');

    // Extract all paragraph text
    const paragraphs: string[] = [];
    container.find('p').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text && text.length > 0) {
        paragraphs.push(text);
      }
    });

    const content = paragraphs.join('\n\n');

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Cheerio scraping failed for ${url}: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
