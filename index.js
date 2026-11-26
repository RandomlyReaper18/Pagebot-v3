const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { createLimiter } = require('./handles/rateLimit');
const { handleMessage } = require('./handles/handle');
const { handlePostback } = require('./handles/Postback');
const { graphApiUrl } = require('./handles/graphApi');

const app = express();
app.set('trust proxy', 1);
app.use(bodyParser.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer;
  }
}));
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  return next(error);
});

const chatLimiter = createLimiter({ max: 10, windowMs: 60 * 1000 });

function verifySignature(req) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) return false;

  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(actualBytes, expectedBytes);
}

const colors = {
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

if (!process.env.APP_SECRET) {
  console.warn('APP_SECRET is not set: all POST /webhook requests will be rejected until it is.');
}

app.use(express.static(path.join(__dirname, 'wala')));

app.post('/api/chat', async (req, res) => {
  if (!chatLimiter(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const prompt = req.body?.prompt;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Enter a prompt to continue.' });
  }

  if (prompt.length > 10000) {
    return res.status(413).json({ error: 'Prompt must be 10,000 characters or fewer.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Gemini chat is not configured on this server.' });
  }

  try {
    const { data } = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        contents: [{ role: 'user', parts: [{ text: prompt.trim() }] }]
      },
      {
        headers: { 'x-goog-api-key': apiKey },
        timeout: 30000
      }
    );

    const text = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!text) {
      return res.status(502).json({ error: 'Gemini returned no text. Try rephrasing your prompt.' });
    }

    return res.json({ text });
  } catch (error) {
    console.error('Gemini request failed:', error.response?.data || error.message);
    return res.status(502).json({ error: 'Gemini could not process your request. Please try again.' });
  }
});

const loadMenuCommands = async () => {
  if (!PAGE_ACCESS_TOKEN) {
    console.warn('PAGE_ACCESS_TOKEN is not configured; skipping Messenger menu registration.');
    return;
  }

  try {
    const commandsDir = path.join(__dirname, 'cmds');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

    const commandsList = commandFiles.map(file => {
      const command = require(path.join(commandsDir, file));
      return { name: command.name, description: command.description || 'No description available' };
    });

    const loadCmd = await axios.post(`${graphApiUrl('me/messenger_profile')}?access_token=${PAGE_ACCESS_TOKEN}`, {
      commands: [
        {
          locale: "default",
          commands: commandsList
        }
      ]
    }, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (loadCmd.data.result === "success") {
      console.log("Commands loaded!");
    } else {
      console.log("Failed to load commands");
    }
  } catch (error) {
    console.error('Error loading commands:', error);
  }
};

loadMenuCommands();

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (VERIFY_TOKEN && mode === 'subscribe' && token === VERIFY_TOKEN && typeof challenge === 'string') {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    return res.sendStatus(403);
  }

  const body = req.body;

  if (body?.object !== 'page') {
    return res.sendStatus(404);
  }

  res.status(200).send('EVENT_RECEIVED');

  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const events = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const event of events) {
      if (!event || typeof event !== 'object' || !event.sender?.id) continue;

      const work = event.message
        ? handleMessage(event, PAGE_ACCESS_TOKEN)
        : event.postback
          ? handlePostback(event, PAGE_ACCESS_TOKEN)
          : null;
      Promise.resolve(work).catch(error => console.error('Webhook event failed:', error));
    }
  }
});

function logTime() {
  const options = {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };

  const currentTime = new Date().toLocaleString('en-PH', options);
  const logMessage = `Current time (PH): ${currentTime}\n`;
  console.log(logMessage);
}

const packageInfo = require('./package.json');
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  logTime();
  setInterval(logTime, 60 * 60 * 1000);
  app.listen(PORT, () => {
    console.log(`${colors.red} Bot Owner: ${packageInfo.author}`);
  });
}

module.exports = app;
                                     
