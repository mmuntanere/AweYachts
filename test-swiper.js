import puppeteer from 'puppeteer';
import handler from 'serve-handler';
import http from 'http';

const server = http.createServer((request, response) => {
  return handler(request, response, { public: 'dist' });
});

server.listen(3000, async () => {
  console.log('Server started at http://localhost:3000');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.log('BROWSER REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3000/yacht/filippetti-s55', { waitUntil: 'networkidle0' });
  
  const swiperState = await page.evaluate(() => {
    const swiperEl = document.querySelector('.yacht-swiper');
    if (!swiperEl) return 'No swiper element';
    return {
      display: window.getComputedStyle(swiperEl).display,
      width: swiperEl.offsetWidth,
      height: swiperEl.offsetHeight,
      hasClassInitialized: swiperEl.classList.contains('swiper-initialized'),
      imagesCount: document.querySelectorAll('.swiper-slide img').length,
      firstImageWidth: document.querySelector('.swiper-slide img')?.width || 0
    };
  });
  
  console.log('SWIPER STATE:', swiperState);
  
  await browser.close();
  server.close();
});
