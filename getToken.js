const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Paste the code you got from Google here:
const code = '4/0Ab_5qlkNDDD5ia6BJW-vmX_UcEGzFl4nyz-S0Kr-l1ERyfopBYYpoeoDu7BbGFn9NOwq6g';

oauth2Client.getToken(code, (err, token) => {
  if (err) return console.error('Error retrieving access token', err);
  console.log('Your refresh token is:', token.refresh_token);
});
