
const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const url = 'https://plati.market/seller/top-games/718240/?lang=en-US';
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        console.log(data.length);
        const $ = cheerio.load(data);
        const products = [];
        
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/itm/') || href.includes('itm.asp'))) {
                products.push({
                    text: $(el).text().trim(),
                    href: href
                });
            }
        });
        console.log(`Found ${products.length} potential product links`);
        console.log(JSON.stringify(products.slice(0, 20), null, 2));
    } catch (err) {
        console.error(err);
    }
}

test();
