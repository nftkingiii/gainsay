export default async (page, { pause, mark }) => {
  await pause(700); mark('start');
  await page.click('#tab-solana'); mark('click');
  await page.waitForFunction(() => document.querySelectorAll('#sol-recorded .sol-row').length > 2, null, { timeout: 90000 });
  mark('loaded'); await pause(1500);
  await page.mouse.move(700, 500);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 150); await pause(120); }
  await pause(1500); mark('scrolled1');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 150); await pause(120); }
  await pause(1500); mark('scrolled2');
};
