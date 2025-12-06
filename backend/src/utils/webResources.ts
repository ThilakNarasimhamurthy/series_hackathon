/**
 * Web Resource Fetcher
 * Fetches and extracts useful information from web pages
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface WebResource {
  url: string;
  title: string;
  description: string;
  content?: string;
  links?: string[];
}

/**
 * Fetch and parse a web page
 */
export async function fetchWebResource(url: string): Promise<WebResource> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Extract title
    const title = $('title').text() || 
                  $('meta[property="og:title"]').attr('content') ||
                  $('h1').first().text() ||
                  'Untitled';

    // Extract description
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       $('p').first().text().substring(0, 200) ||
                       'No description available';

    // Extract main content (first few paragraphs)
    const paragraphs: string[] = [];
    $('p').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 50) {
        paragraphs.push(text);
      }
      if (paragraphs.length >= 3) return false; // Stop after 3 paragraphs
    });
    const content = paragraphs.join('\n\n').substring(0, 1000);

    // Extract relevant links
    const links: string[] = [];
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      if (href && text && href.startsWith('http')) {
        links.push(`${text}: ${href}`);
      }
      if (links.length >= 10) return false; // Limit to 10 links
    });

    return {
      url,
      title: title.trim(),
      description: description.trim(),
      content: content.trim(),
      links: links.slice(0, 10)
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch resource: ${error.message}`);
  }
}

/**
 * Search for mental health resources based on keywords and location
 */
export async function searchMentalHealthResources(
  keywords: string[],
  location?: string
): Promise<WebResource[]> {
  // Common mental health resource URLs
  const resourceUrls: string[] = [
    'https://www.samhsa.gov/find-help/national-helpline',
    'https://988lifeline.org/',
    'https://www.crisistextline.org/',
    'https://www.nami.org/help',
    'https://www.mentalhealth.gov/',
  ];

  // If location is provided, add state-specific resources
  if (location) {
    const state = location.toLowerCase();
    // Add state-specific crisis lines (example for a few states)
    resourceUrls.push(
      `https://www.samhsa.gov/find-treatment/facility`,
      `https://www.nami.org/Your-Journey/Individuals-with-Mental-Illness/Find-Your-Local-NAMI`
    );
  }

  const resources: WebResource[] = [];
  
  // Fetch resources (limit to first 5 for performance)
  for (const url of resourceUrls.slice(0, 5)) {
    try {
      const resource = await fetchWebResource(url);
      // Filter by keywords if provided
      if (keywords.length === 0 || 
          keywords.some(keyword => 
            resource.title.toLowerCase().includes(keyword.toLowerCase()) ||
            resource.description.toLowerCase().includes(keyword.toLowerCase())
          )) {
        resources.push(resource);
      }
    } catch (error) {
      console.warn(`Failed to fetch resource ${url}:`, error);
      // Continue with other resources
    }
  }

  return resources;
}

/**
 * Get crisis resources for a specific state
 */
export async function getStateCrisisResources(state: string): Promise<WebResource[]> {
  const stateLower = state.toLowerCase();
  
  // State-specific crisis resources mapping
  const stateResources: Record<string, string[]> = {
    'california': [
      'https://www.samhsa.gov/find-treatment/facility',
      'https://www.crisistextline.org/',
    ],
    'new york': [
      'https://www.samhsa.gov/find-treatment/facility',
      'https://988lifeline.org/',
    ],
    'texas': [
      'https://www.samhsa.gov/find-treatment/facility',
      'https://www.crisistextline.org/',
    ],
    // Add more states as needed
  };

  const urls = stateResources[stateLower] || [
    'https://988lifeline.org/',
    'https://www.crisistextline.org/',
    'https://www.samhsa.gov/find-help/national-helpline',
  ];

  const resources: WebResource[] = [];
  for (const url of urls.slice(0, 3)) {
    try {
      const resource = await fetchWebResource(url);
      resources.push(resource);
    } catch (error) {
      console.warn(`Failed to fetch state resource ${url}:`, error);
    }
  }

  return resources;
}

/**
 * Format resources as a user-friendly message
 */
export function formatResourcesForMessage(resources: WebResource[]): string {
  if (resources.length === 0) {
    return 'I couldn\'t find specific resources at the moment. Please reach out to 988 Suicide & Crisis Lifeline for immediate support.';
  }

  let message = 'Here are some helpful resources:\n\n';
  
  resources.forEach((resource, index) => {
    message += `${index + 1}. ${resource.title}\n`;
    message += `   ${resource.description}\n`;
    message += `   ${resource.url}\n`;
    if (resource.links && resource.links.length > 0) {
      message += `   Related links: ${resource.links.slice(0, 3).join(', ')}\n`;
    }
    message += '\n';
  });

  return message.trim();
}

