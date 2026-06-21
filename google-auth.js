import http from 'node:http';
import { google } from 'googleapis';
import 'dotenv/config';

const scopes = [
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly'
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = Number(process.env.GOOGLE_AUTH_PORT || 3000);
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

if (!clientId || !clientSecret) {
  throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env before running this helper.');
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent select_account',
  scope: scopes
});

console.log('\nOpen this URL and approve access:\n');
console.log(authUrl);
console.log(`\nWaiting for Google to redirect back to ${redirectUri}`);

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(400);
        res.end(`OAuth error: ${error}`);
        reject(new Error(`OAuth error: ${error}`));
        server.close();
        return;
      }

      const authCode = url.searchParams.get('code');
      if (!authCode) {
        res.writeHead(400);
        res.end('Missing authorization code.');
        reject(new Error('Missing authorization code.'));
        server.close();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Google authorization complete. You can return to the terminal.');
      resolve(authCode);
      server.close();
    } catch (error) {
      reject(error);
      server.close();
    }
  });

  server.listen(port, '127.0.0.1');
});

const { tokens } = await oauth2.getToken(code);

if (!tokens.refresh_token) {
  throw new Error('Google did not return a refresh token. Re-run with prompt=consent or remove this app from your Google account access list, then try again.');
}

console.log('\nAdd this to your .env:\n');
console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
