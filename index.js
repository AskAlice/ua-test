const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const logger = require('pino')();
const axios = require('axios').default;
const request = require('request');
const { post } = require('request');
// const Feed = require('feed').default;
// const feed = new Feed({
//   title: 'Feed Title',
//   description: 'This is my personal feed!',
//   id: 'http://tests.birb.emu.sh/',
//   link: 'http://tests.birb.emu.sh/',
//   language: 'en', // optional, used only in RSS 2.0, possible values: http://www.w3.org/TR/REC-html40/struct/dirlang.html#langcodes
//   image: 'http://example.com/image.png',
//   favicon: 'http://example.com/favicon.ico',
//   copyright: 'All rights reserved 2013, John Doe',
//   updated: new Date(), // optional, default = today
//   generator: 'awesome', // optional, default = 'Feed for Node.js'
//   feedLinks: {
//     json: 'https://tests.birb.emu.sh/json',
//     atom: 'https://tests.birb.emu.sh/atom',
//   },
// });

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function checkAPI(auth) {
  const options = {
    method: 'POST',
    url: 'https://sentry.cordanths.com/Sentry/WebCheckin/Log',
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    form: { phone: '3035520646', last_name: 'Knag', ivr_code: '95698599', lang: 'en' },
    jar: 'JAR',
  };

  request(options, async function (error, response, body) {
    if (error) {
      logger.info(error);
      throw new Error(error);
    }
    logger.info(body);
    const results = JSON.parse(body);
    if (results[0]?.required_test === 1) {
      logger.info(JSON.stringify(results));
      //append to results.json file
      const content = await fs.readFile('results.json');
      const json = JSON.parse(content);
      const newResults = {
        date: results[0].date,
        msg: results[0].text,
        required_test: results[0].required_test,
        tx: results[0].transaction_key,
      };
      json.push(newResults);
      const res = '[\n' + json.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]';
      await fs.writeFile('results.json', res);
      request({ method: 'POST', uri: 'https://birb.emu.sh/api/webhook/L4GR7YVo968YNiC1MxwjZVxk' }, function (error, response, body) {
        if (error) logger.info(error);
        logger.info(body);
      });
      //add to feed
      await createEvent(auth);
    } else {
      logger.info(results);
      const content = await fs.readFile('error.json');
      const json = JSON.parse(content);
      const newResults = {
        date: new Date().toISOString(),
        msg: results[0].error_msg,
        field: results[0].error_field,
        donor: results[0].donor,
      };
      json.push(newResults);
      const err = '[\n' + json.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]';
      await fs.writeFile('error.json', err);
      request({ method: 'POST', uri: 'https://birb.emu.sh/api/webhook/L3GR7YVo968YNiC1MxwjZVxk' }, function (error, response, body) {
        if (error) logger.info(error);
        logger.info(body);
      });
    }
  });
}

async function createEvent(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const now = new Date();
  const five = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 00, 0, 0);
  const eleven = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0, 0);

  const event = {
    summary: 'Get tested',
    location: '1651 Kendall Street, Lakewood, CO 80214',
    description: 'https://www.int-cjs.org/',
    start: {
      dateTime: five,
      timeZone: 'America/Denver',
    },
    end: {
      dateTime: eleven,
      timeZone: 'America/Denver',
    },
    attendees: [{ email: 'alice@askalice.me' }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 4 * 60 },
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 90 },
        { method: 'popup', minutes: 120 },
      ],
    },
  };

  await calendar.events.insert(
    {
      auth: auth,
      calendarId: 'primary',
      resource: event,
    },
    function (err, event) {
      if (err) {
        logger.info('There was an error contacting the Calendar service: ' + err);
        return;
      }
      logger.info('Event created: %s', event.htmlLink);
    }
  );
}
authorize().then(checkAPI).catch(console.error);
