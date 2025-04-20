require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;

app.use(bodyParser.json());

// --- GOOGLE AUTH SETUP ---
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// --- ROUTE: CHECK AVAILABILITY ---
app.get('/api/availability', async (req, res) => {
  try {
    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // next 7 days
        timeZone: 'America/Vancouver',
        items: [{ id: 'primary' }]
      },
    });

    const busySlots = data.calendars.primary.busy;
    res.json({ busy: busySlots });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to fetch availability');
  }
});

// --- ROUTE: BOOK APPOINTMENT ---
app.post('/api/book', async (req, res) => {
  try {
    const { summary, description, startTime, endTime } = req.body;

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: {
          dateTime: startTime,
          timeZone: 'America/Vancouver',
        },
        end: {
          dateTime: endTime,
          timeZone: 'America/Vancouver',
        },
      },
    });

    res.status(200).json({ success: true, event: response.data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to book event');
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
