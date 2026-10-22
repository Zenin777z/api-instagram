require('dotenv').config();
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

app.get('/profile-pic/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    let highResUrl = null;

    // Escuta requisições de rede para pegar a versão 640x640 do CDN
    page.on('response', (response) => {
      const url = response.url();
      if (
        (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) &&
        url.includes('s640x640')
      ) {
        highResUrl = url;
      }
    });

    await page.goto(`https://www.threads.net/@${username}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    if (!highResUrl) {
      const html = await page.content();
      const unescaped = html.replace(/\\u0026/g, '&').replace(/\\/g, '');
      const match = unescaped.match(/https:\/\/[^"'\s]+(?:cdninstagram|fbcdn)[^"'\s]+s640x640[^"'\s]*/);
      if (match) {
        highResUrl = match[0].replace(/&amp;/g, '&');
      }
    }

    await page.close();

    if (!highResUrl) {
      return res.status(404).json({ error: 'Foto de alta qualidade não encontrada' });
    }

    // Baixa a imagem diretamente e entrega na tela em tamanho grande
    const imgResponse = await axios.get(highResUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const base64Img = Buffer.from(imgResponse.data).toString('base64');

    res.set('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>@${username} - Alta Qualidade (640x640)</title>
        <style>
          body {
            margin: 0;
            background: #111;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          img {
            width: 640px;
            max-width: 90vw;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.7);
          }
        </style>
      </head>
      <body>
        <img src="data:image/jpeg;base64,${base64Img}" alt="@${username}" />
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao extrair imagem', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
