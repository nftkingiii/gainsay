export default async (page, { pause, mark }) => {
  await pause(700); mark('start');
  await page.click('#tab-solana'); mark('click');
  await page.waitForFunction(() => document.querySelectorAll('#sol-recent li').length > 2, null, { timeout: 90000 });
  mark('loaded'); await pause(1800);
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 420); await pause(900); mark('scrolled'); await pause(1400);
};
