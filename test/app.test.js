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
