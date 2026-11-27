export default async (page, { pause, mark }) => {
  await pause(700); mark('start');
  await page.click('#tab-watch'); mark('click');
  await page.waitForFunction(() => document.querySelectorAll('#feed li').length > 2 && !/Loading/.test(document.querySelector('#feed-meta').textContent), null, { timeout: 120000 });
  mark('loaded'); await pause(1500);
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 360); await pause(900); mark('scrolled'); await pause(1200);
};
