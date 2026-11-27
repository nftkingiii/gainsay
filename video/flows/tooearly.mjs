export default async (page, { pause, mark }) => {
  await pause(700); mark('start');
  await page.click('#market'); await pause(300);
  await page.type('#market', '6747201', { delay: 140 }); await pause(500); mark('typed');
  await page.click('#check-button'); mark('click');
  await page.waitForFunction(() => document.querySelector('#slot-label')?.textContent === 'Your check' && !document.querySelector('.loading'), null, { timeout: 60000 });
  mark('result'); await pause(2200);
};
