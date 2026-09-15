const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const TELEGRAM_API = 'https://api.telegram.org';

app.use(async (req, res) => {
  const targetUrl = TELEGRAM_API + req.originalUrl;
  try {
    const options = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, options);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy running on port ' + PORT));
