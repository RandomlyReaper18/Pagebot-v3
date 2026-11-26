const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
process.env.VERIFY_TOKEN = 'test-verification-token';
const app = require('../index');

test('verifies a valid webhook subscription', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const address = server.address();
  const verifyToken = process.env.VERIFY_TOKEN;
  const response = await fetch(
    `http://127.0.0.1:${address.port}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=healthcheck`
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'healthcheck');
});

test('rejects an invalid webhook verification token', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/webhook?hub.mode=subscribe&hub.verify_token=incorrect&hub.challenge=healthcheck`
  );

  assert.equal(response.status, 403);
});

test('serves the static page without the unsafe redirect', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /pornhub/i);
  assert.doesNotMatch(html, /redirectToURL|contextmenu|keyCode\s*==/i);

  const scriptResponse = await fetch(`http://127.0.0.1:${address.port}/script.js`);
  const script = await scriptResponse.text();
  assert.doesNotMatch(script, /AIza|GEMINI_API_KEY/);
});

test('rejects empty Gemini prompts', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: '  ' })
  });

  assert.equal(response.status, 400);
});

test('reports when Gemini is not configured', async (t) => {
  const server = app.listen(0);
  const previousApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  t.after(() => {
    server.close();
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hello Gemini' })
  });

  assert.equal(response.status, 503);
});

test('proxies Gemini requests using a server-side key', async (t) => {
  const server = app.listen(0);
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousPost = axios.post;
  process.env.GEMINI_API_KEY = 'test-api-key';
  t.after(() => {
    server.close();
    axios.post = previousPost;
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  });

  axios.post = async (url, body, options) => {
    assert.match(url, /v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'test-api-key');
    assert.equal(body.contents[0].parts[0].text, 'Hello Gemini');
    return {
      data: { candidates: [{ content: { parts: [{ text: 'Hello back.' }] } }] }
    };
  };

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hello Gemini' })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: 'Hello back.' });
});

// ---- webhook hardening ----
const crypto = require('node:crypto');

function sign(secret, raw) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

test('GET /webhook with no params responds instead of hanging', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, {
    signal: AbortSignal.timeout(2000)
  });

  assert.equal(response.status, 403);
});

test('rejects webhook POST with no or wrong signature', async (t) => {
  const server = app.listen(0);
  const previousAppSecret = process.env.APP_SECRET;
  process.env.APP_SECRET = 'test-app-secret';
  t.after(() => {
    server.close();
    if (previousAppSecret === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = previousAppSecret;
  });

  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const raw = JSON.stringify({ object: 'page', entry: [] });
  const headers = { 'Content-Type': 'application/json' };

  const unsigned = await fetch(url, { method: 'POST', headers, body: raw });
  assert.equal(unsigned.status, 403);

  const wrong = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'X-Hub-Signature-256': sign('some-other-secret', raw) },
    body: raw
  });
  assert.equal(wrong.status, 403);
});

test('rejects webhook POST when APP_SECRET is not configured', async (t) => {
  const server = app.listen(0);
  const previousAppSecret = process.env.APP_SECRET;
  delete process.env.APP_SECRET;
  t.after(() => {
    server.close();
    if (previousAppSecret !== undefined) process.env.APP_SECRET = previousAppSecret;
  });

  const raw = JSON.stringify({ object: 'page', entry: [] });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign('anything', raw) },
    body: raw
  });
  assert.equal(response.status, 403);
});

test('accepts a correctly signed webhook POST, including a malformed body', async (t) => {
  const server = app.listen(0);
  const previousAppSecret = process.env.APP_SECRET;
  process.env.APP_SECRET = 'test-app-secret';
  t.after(() => {
    server.close();
    if (previousAppSecret === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = previousAppSecret;
  });

  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const send = (raw) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign('test-app-secret', raw) },
    body: raw
  });

  const ok = await send(JSON.stringify({
    object: 'page',
    entry: [{ messaging: [{ sender: { id: 'test-sender' }, message: { is_echo: true } }, null] }]
  }));
  assert.equal(ok.status, 200);

  const malformedJson = await send('{"object":');
  assert.equal(malformedJson.status, 400);
  assert.deepEqual(await malformedJson.json(), { error: 'Request body must contain valid JSON.' });

  const noEntry = await send(JSON.stringify({ object: 'page' }));
  assert.equal(noEntry.status, 200);

  const notPage = await send(JSON.stringify({ object: 'user' }));
  assert.equal(notPage.status, 404);
});

test('rate limits /api/chat per client', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  const statuses = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: ' ' })
    });
    statuses.push(r.status);
  }

  assert.ok(statuses.includes(429), `expected a 429, got ${statuses.join(',')}`);
});

test('spam commands are gone and risky ones are admin-only', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const cmds = fs.readdirSync(path.join(__dirname, '../cmds'));
  assert.ok(!cmds.includes('sms.js'));
  assert.ok(!cmds.includes('ngl.js'));
  for (const f of ['freesms.js', 'scrape.js', 'imgur.js']) {
    assert.equal(require(`../cmds/${f}`).role, 0, `${f} should be admin-only`);
  }
});

test('no API keys are hardcoded in command files', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '../cmds');
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile()) continue;
    const src = fs.readFileSync(full, 'utf8');
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}|EAA[0-9A-Za-z]{20,}/, `${f} has a hardcoded provider key`);
    assert.doesNotMatch(
      src,
      /(?:api[_-]?key|apikey)\s*[:=]\s*(?!(?:process\.env|KAIZ_API_KEY|\$\{|YOUR_))["'`]?[A-Za-z0-9_-]{6,}/i,
      `${f} has a hardcoded API key`
    );
    assert.doesNotMatch(
      src,
      /access[_-]?token\s*:\s*(?!(?:process\.env|authToken|pageAccessToken))(?:"[^"]+"|'[^']+'|[A-Za-z0-9_-]{8,})/i,
      `${f} has a hardcoded access token`
    );
  }
});
