import { Dataset, createPlaywrightRouter } from 'crawlee';

export const router = createPlaywrightRouter();




const scrollToBottom = async (page: any) => {
    let previousHeight: number;
    while (true) {
        previousHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) break;
    }
};

const waitForLoadingScreen = async (page: any, log: any) => {
    try {
        await page.waitForSelector('.loader', { state: 'detached', timeout: 5000 });
    } catch {
        log.info('Loading screen did not disappear in time. Proceeding anyway...');
    }
}

router.addDefaultHandler(async ({ enqueueLinks, log, page }) => {
    await waitForLoadingScreen(page, log);
    log.info(`enqueueing new URLs`);
    await page.waitForSelector('.featured', { state: 'visible', timeout: 10000 });
    await enqueueLinks({
        globs: ['https://www.stokonline.com.br/produtos/departamento/*'],
        label: 'section',
    });
});

router.addHandler('section', async ({ request, page, log, enqueueLinks }) => {
    await waitForLoadingScreen(page, log);
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });

    await page.waitForSelector('.thumbnail', { state: 'visible', timeout: 10000 });
    await enqueueLinks({
        globs: [`${request.loadedUrl}/*`],
        label: 'category',
    });
});

router.addHandler('category', async ({ page, pushData, log }) => {
    await waitForLoadingScreen(page, log); // Ensure loading screen disappears
    await scrollToBottom(page); // Scroll to load all products

    // Wait for products to be visible
    await page.waitForSelector('.border-promotion', { state: 'visible', timeout: 10000 });

    await page.waitForSelector('.image-product', { state: 'attached', timeout: 10000 });

    const categories = await page.$$eval('.vip-tabs-bar__item .ng-star-inserted', (elements) => {
        return elements.map(el => el.textContent?.trim()).filter(text => text);
    });

    const department = categories[0];
    const category = categories[1];


    const data = await page.$$eval('.border-promotion', ($products) => {
        return $products.map(($product) => {

            

            const titleElement = $product.querySelector('.caption a');
            const imageElement = $product.querySelector('.img-container--product');
             // Extract only the price text, ignoring 'un.'
            const prices = Array.from($product.querySelectorAll('.info-price'))
            .map(price => {
                return price.childNodes[0]?.textContent?.trim().replace(/\s*un\.$/, '') || '';
            }).filter(price => price.length > 0);

            return {
                title: titleElement ? (titleElement as HTMLElement).innerText.trim() : null,
                imageUrl: imageElement ? (imageElement as HTMLImageElement).src : null,
                originalPrice: prices[0] || '',
                discountedPrice: prices.length > 1 ? prices[1] : '',
            };

        }).filter(product => product.title && product.originalPrice); // Filter out null values
    });

    const finalProducts = data.map(product => {
        return {
            ...product,
            department,
            category,
        }
    })


    await pushData(finalProducts);
    log.info(`Scraped ${data.length} products from ${page.url()}`);
});
