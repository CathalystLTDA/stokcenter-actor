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
import cliProgress from 'cli-progress';

dotenv.config();


const { Client } = pg;


const DATABASE_URL = process.env.DATABASE_URL!

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


console.log('Now inserting data into PostgreSQL...');
// Fetch scraped data from Apify dataset
const { items } = await Actor.openDataset().then((dataset) => dataset.getData());

// Connect to PostgreSQL AFTER crawling
const client = new Client({ connectionString: DATABASE_URL });
try {
    await client.connect();

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

    // Initialize progress bar
    const progressBar = new cliProgress.SingleBar(
        {
            format: 'Inserting Data |{bar}| {percentage}% | {value}/{total} items',
        },
        cliProgress.Presets.shades_classic
    );

    progressBar.start(items.length, 0);

    // Insert data into PostgreSQL
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
            await client.query(
                `INSERT INTO stokcenter (title, image_url, original_price, discounted_price, department, category, weight, unit, volume)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    item.title || '',
                    item.imageUrl || '',
                    item.originalPrice || '',
                    item.discountedPrice || '',
                    item.department || '',
                    item.category || '',
                    item.weight || '',
                    item.unit || '',
                    item.volume || '',
                ]
            );
        } catch (error) {
            console.error(`Error inserting item ${i + 1}:`, error);
        }
        progressBar.update(i + 1);
    }

    progressBar.stop();
    console.log('✅ Data saved to PostgreSQL');
} catch (error) {
    console.error('Database error:', error);
} finally {
    await client.end(); // Ensure connection is closed
}
// Exit successfully
await Actor.exit();
