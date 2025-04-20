/************************************************************
 *  Booking‑Backend — Google Calendar + WordPress + Twilio  *
 ***********************************************************/
require('dotenv').config();
const express     = require('express');
const bodyParser  = require('body-parser');
const cors        = require('cors');
const { google }  = require('googleapis');
const fetch       = require('node-fetch');      // for server‑side HTTP
const { twiml:{ VoiceResponse } } = require('twilio');
const OpenAI      = require('openai').OpenAI;

const app  = express();
const PORT = process.env.PORT || 5000;

/* ─────── MIDDLEWARE ─────────────────────────────────── */
app.use(cors());                       // allow every origin while testing
app.use(bodyParser.json());            // parse JSON
app.use(bodyParser.urlencoded({ extended: false })); // parse Twilio urlencoded

/* ─────── ROOT ROUTE ────────────────────────────────── */
app.get('/', (_req, res) => {
  res.send(
    'Booking API is live!  Endpoints: /api/availability  •  /api/book  •  /voice (Twilio)'
  );
});

/* ─────── GOOGLE CALENDAR SETUP ─────────────────────── */
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

/* ─────── AVAILABILITY (next 7 days) ─────────────────── */
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

/* ─────── BOOK APPOINTMENT ───────────────────────────── */
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

/* ─────── TWILIO + OPENAI VOICE ASSISTANT ────────────── */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* 1 ‑ Initial greeting & speech gather */
app.post('/voice', (_req, res) => {
  const vr = new VoiceResponse();
  const gather = vr.gather({
    input: 'speech',
    language: 'en-US',
    speechTimeout: 'auto',
    action: '/voice/process',
    method: 'POST'
  });
  gather.say(
    'Hi! What service, date and time would you like to book? ' +
    'For example, say: “Oil change next Tuesday at 3 p.m.”'
  );
  res.type('text/xml').send(vr.toString());
});

/* 2 ‑ Process transcript, check calendar, book or ask again */
app.post('/voice/process', async (req, res) => {
  const transcript = req.body.SpeechResult || '';
  const vr = new VoiceResponse();

  try {
    /* 2‑a Parse the sentence with GPT */
    const gpt = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      temperature: 0,
      messages: [
        { role: 'system',
          content: 'Extract appointment info. Return JSON exactly: ' +
                   '{"service":"", "date":"YYYY-MM-DD", "stime":"HH:MM", "etime":"HH:MM"}' },
        { role: 'user', content: transcript }
      ]
    });
    const { service, date, stime, etime } =
          JSON.parse(gpt.choices[0].message.content.trim());

    /* 2‑b Build ISO datetimes */
    const startISO = new Date(`${date}T${stime}:00`).toISOString();
    const endISO   = new Date(`${date}T${etime}:00`).toISOString();

    /* 2‑c Check availability using same Calendar call */
    const fb = await calendar.freebusy.query({
      requestBody:{
        timeMin:startISO,
        timeMax:endISO,
        timeZone:'America/Vancouver',
        items:[{id:'primary'}]
      }
    });
    const busy = fb.data.calendars.primary.busy;
    const clash = busy.length > 0;

    if (clash) {
      vr.say('Sorry, that slot is not available. Please say a different time.');
      vr.redirect('/voice');
    } else {
      /* 2‑d Insert event */
      await calendar.events.insert({
        calendarId:'primary',
        requestBody:{
          summary:service,
          description:'Booked via voice assistant',
          start:{ dateTime:startISO, timeZone:'America/Vancouver' },
          end:  { dateTime:endISO,   timeZone:'America/Vancouver' }
        }
      });
      vr.say(`Great! You are booked for ${service} on ${date} at ${stime}. Goodbye!`);
      vr.hangup();
    }
  } catch (e) {
    console.error('Voice assistant error:', e);
    vr.say('Sorry, I didn’t catch that. Let’s try again.');
    vr.redirect('/voice');
  }

  res.type('text/xml').send(vr.toString());
});

/* ─────── START SERVER ───────────────────────────────── */
app.listen(PORT, () => console.log('Server running on port', PORT));
