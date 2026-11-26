const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { handleMessage } = require('./handles/handle');
const { handlePostback } = require('./handles/Postback');
const { graphApiUrl } = require('./handles/graphApi');

const app = express();
app.use(bodyParser.json());

const colors = {
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.use(express.static(path.join(__dirname, 'wala')));

app.post('/api/chat', async (req, res) => {
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

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message) {
          handleMessage(event, PAGE_ACCESS_TOKEN);
        } else if (event.postback) {
          handlePostback(event, PAGE_ACCESS_TOKEN);
        }
      });
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
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
                                     
