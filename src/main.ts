/**
 * This template is a production ready boilerplate for developing with `PlaywrightCrawler`.
 * Use this to bootstrap your projects using the most up-to-date code.
 * If you're looking for examples or want to learn more, see README.
 */

// For more information, see https://docs.apify.com/sdk/js
import { Actor } from 'apify';
// For more information, see https://crawlee.dev
import { PlaywrightCrawler } from 'crawlee';
// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
import { router } from './routes.js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();


const { Client } = pg;


const DATABASE_URL = process.env.DATABASE_URL!
// Connect to PostgreSQL
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

interface Input {
    startUrls: string[];
    maxRequestsPerCrawl: number;
}

// Initialize the Apify SDK
await Actor.init();

// Structure of input is defined in input_schema.json
const {
    startUrls = ['https://crawlee.dev'],
} = await Actor.getInput<Input>() ?? {} as Input;

const proxyConfiguration = await Actor.createProxyConfiguration();

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: [
                '--disable-gpu', // Mitigates the "crashing GPU process" issue in Docker containers
            ]
        }
    },
    maxConcurrency: 5,
});

await crawler.run(startUrls);



// Ensure table exists
await client.query(`
  CREATE TABLE IF NOT EXISTS stokcenter (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    image_url TEXT,
    original_price TEXT,
    discounted_price TEXT,
    department TEXT,
    category TEXT,
    weight TEXT,
    unit TEXT,
    volume TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// Fetch scraped data from Apify dataset
const { items } = await Actor.openDataset().then((dataset) => dataset.getData());

// Insert data into PostgreSQL
for (const item of items) {
  await client.query(
    `INSERT INTO scraped_data (title, image_url, original_price, discounted_price, department, category, weight, unit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      item.title || '',
      item.imageUrl || '',
      item.originalPrice || '',
      item.discountedPrice || '',
      item.department || '',
      item.category || '',
      item.weight || '',
      item.unit || '',
    ]
  );
}

console.log('Data saved to PostgreSQL');

await client.end();

// Exit successfully
await Actor.exit();
