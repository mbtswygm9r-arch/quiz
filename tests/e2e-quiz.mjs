import { chromium } from '@playwright/test';

const BASE = 'https://mbtswygm9r-arch.github.io/quiz';

const browser = await chromium.launch();
const hostContext = await browser.newContext();
const playerContext = await browser.newContext();

const hostPage = await hostContext.newPage();
const playerPage = await playerContext.newPage();

const consoleErrors = [];
const failedRequests = [];

for (const page of [hostPage, playerPage]) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${page.url()}: ${message.text()}`);
  });
  page.on('requestfailed', request => {
    failedRequests.push(`${page.url()} -> ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', response => {
    if (response.status() >= 400) failedRequests.push(`${page.url()} -> ${response.url()} (${response.status()})`);
  });
}

try {
  await hostPage.goto(`${BASE}/host.html`, { waitUntil: 'domcontentloaded' });
  await hostPage.getByRole('button', { name: 'Lobby erstellen' }).click();
  await hostPage.locator('#lobbyCode').waitFor({ state: 'visible', timeout: 20000 });
  const lobbyCode = (await hostPage.locator('#lobbyCode').innerText()).trim();
  if (!/^[A-Z2-9]{5}$/.test(lobbyCode)) throw new Error(`Ungültiger Lobby-Code: ${lobbyCode}`);
  console.log(`Lobby erstellt: ${lobbyCode}`);

  await playerPage.goto(`${BASE}/join.html?lobby=${lobbyCode}`, { waitUntil: 'domcontentloaded' });
  await playerPage.locator('#nameInput').fill('Playwright Tester');
  await playerPage.getByRole('button', { name: 'Weiter' }).click();
  await playerPage.getByRole('button', { name: 'Beitreten' }).click();
  await playerPage.locator('#wartenBox').waitFor({ state: 'visible', timeout: 20000 });
  console.log('Spieler ist der Lobby beigetreten.');

  await hostPage.locator('#spielerListe li').first().waitFor({ state: 'visible', timeout: 20000 });
  await hostPage.getByRole('button', { name: 'Quiz starten' }).click();

  await playerPage.waitForURL(/session\.html/, { timeout: 30000 });
  console.log(`Spieler weitergeleitet zu: ${playerPage.url()}`);

  await playerPage.locator('#session-bereich').waitFor({ state: 'visible', timeout: 30000 });
  const frage = await playerPage.locator('#frage-text').innerText();
  console.log(`Frage angezeigt: ${frage}`);

  const optionCount = await playerPage.locator('#optionen button').count();
  if (optionCount === 0) throw new Error('Keine Antwortoptionen sichtbar.');
  console.log(`Antwortoptionen: ${optionCount}`);

  await playerPage.locator('#optionen button').first().click();
  await playerPage.locator('#warte-bereich').waitFor({ state: 'visible', timeout: 20000 });
  console.log('Antwort wurde gespeichert.');

  await hostPage.getByRole('button', { name: 'Nächste Frage' }).click();
  await playerPage.locator('#session-bereich').waitFor({ state: 'visible', timeout: 30000 });
  console.log('Nächste Frage wurde geladen.');

  if (consoleErrors.length || failedRequests.length) {
    console.log('CONSOLE ERRORS:\n' + consoleErrors.join('\n'));
    console.log('FAILED REQUESTS:\n' + failedRequests.join('\n'));
    throw new Error('Es gab Browser- oder Netzwerkfehler.');
  }

  console.log('E2E-Test erfolgreich.');
} catch (error) {
  console.error('E2E-Test fehlgeschlagen:', error.message);
  console.log('CONSOLE ERRORS:\n' + consoleErrors.join('\n'));
  console.log('FAILED REQUESTS:\n' + failedRequests.join('\n'));
  await hostPage.screenshot({ path: 'host-failure.png', fullPage: true });
  await playerPage.screenshot({ path: 'player-failure.png', fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
}
