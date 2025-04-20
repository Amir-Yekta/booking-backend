require('dotenv').config();
const express   = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 5000;      // use Render‑provided port in prod

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors());              // allow all origins while testing
// app.use(cors({ origin: 'https://your‑wp‑site.com' })); // ← lock down later

app.use(bodyParser.json());

// ─── ROOT ROUTE ──────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.send('Booking API is live!  Endpoints: /api/availability  •  /api/book');
});

// ─── GOOGLE AUTH SETUP ───────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// ─── ROUTE: CHECK AVAILABILITY (next 7 days) ─────────────────
app.get('/api/availability', async (_req, res) => {
  try {
    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        timeZone: 'America/Vancouver',
        items: [{ id: 'primary' }]
      }
    });

    res.json({ busy: data.calendars.primary.busy });
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).send('Failed to fetch availability');
  }
});

// ─── ROUTE: BOOK APPOINTMENT ─────────────────────────────────
app.post('/api/book', async (req, res) => {
  try {
    const { summary, description, startTime, endTime } = req.body;

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime, timeZone: 'America/Vancouver' },
        end:   { dateTime: endTime,   timeZone: 'America/Vancouver' }
      }
    });

    res.json({ success: true, event: response.data });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).send('Failed to book event');
  }
});

// ─── START SERVER ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
