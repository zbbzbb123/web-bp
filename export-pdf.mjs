import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'index.html');
const outputPath = path.join(__dirname, 'lumi-bp.pdf');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SLIDE_COUNT = 14;
const VIEWPORT = { width: 1440, height: 900 };
const EXPORT_SCALE = 2;

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ ...VIEWPORT, deviceScaleFactor: EXPORT_SCALE });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

// Wait for fonts and initial animation
await new Promise(r => setTimeout(r, 2000));

// Collect screenshots of each slide
const screenshots = [];

for (let i = 0; i < SLIDE_COUNT; i++) {
  // Navigate to slide i
  await page.evaluate((idx) => {
    const slides = document.querySelectorAll('.slide');
    slides.forEach((s, j) => {
      s.classList.remove('active', 'exit-up');
      if (j === idx) s.classList.add('active');
    });
    // Update progress bar
    const bar = document.querySelector('.progress-bar');
    if (bar) bar.style.width = ((idx + 1) / slides.length * 100) + '%';
    // Update nav dots
    const dots = document.querySelectorAll('.nav-dot');
    dots.forEach((d, j) => d.classList.toggle('active', j === idx));
  }, i);

  // Fix counter animation (headless rAF doesn't run reliably)
  await page.evaluate(() => {
    const el = document.getElementById('counterNum');
    if (el) el.textContent = '90';
  });

  // Wait for animations
  await new Promise(r => setTimeout(r, 1200));

  const screenshot = await page.screenshot({ type: 'png', fullPage: false });
  screenshots.push(screenshot);
  console.log(`Captured slide ${i + 1}/${SLIDE_COUNT}`);
}

await browser.close();

// Build PDF from screenshots using a new page
const browser2 = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox'],
});
const page2 = await browser2.newPage();

// Build HTML with all slides as images
const imgs = screenshots.map(buf =>
  `<div class="page"><img src="data:image/png;base64,${buf.toString('base64')}"/></div>`
).join('');

await page2.setContent(`<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .page { width: 1440px; height: 900px; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: avoid; }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style></head><body>${imgs}</body></html>`, { waitUntil: 'networkidle0' });

await page2.pdf({
  path: outputPath,
  width: '1440px',
  height: '900px',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser2.close();
console.log(`\nDone! Saved to: ${outputPath}`);
