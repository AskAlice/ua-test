const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const axios = require("axios").default;
const request = require("request");
const { post } = require("request");
const pino = require("pino");
require("dotenv").config();
const transport = pino.transport({
  targets: [
    { target: "pino-pretty", options: { destination: 1 } },
    { target: "pino/file", options: { destination: "results.log" } },
  ],
});
const logger = pino(transport);

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

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
    type: "authorized_user",
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
  const { TEST_PHONE_NUMBER: phoneNumber, YOUR_LAST_NAME: lastName, SENTRY_ID_NUMBER: sentryId } = process.env;
  const options = {
    method: "POST",
    url: "https://sentry.cordanths.com/Sentry/WebCheckin/Log",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    form: { phone: phoneNumber, last_name: lastName, ivr_code: sentryId, lang: "en" },
    jar: "JAR",
  };
  logger.debug(JSON.stringify(options));
  request(options, async function (error, response, body) {
    const testRequiredWebhook = process.env.TEST_REQUIRED_WEBHOOK;
    const noTestWebhook = process.env.NO_TEST_WEBHOOK;
    if (error) {
      logger.error(error);
      throw new Error(error);
    }
    const results = JSON.parse(body);
    if (results[0]?.required_test === 1) {
      logger.info(JSON.stringify(results));
      if (typeof testRequiredWebhook === "string") {
        request({ method: "POST", uri: testRequiredWebhook }, function (error, response, body) {
          if (error) logger.info(error);
        });
      }
      //add to feed
      await createEvent(auth);
    } else {
      logger.error(JSON.stringify(results));
      const content = await fs.readFile("error.json");
      const json = JSON.parse(content);
      const newResults = {
        date: new Date().toISOString(),
        msg: results[0].error_msg,
        field: results[0].error_field,
        donor: results[0].donor,
      };
      json.push(newResults);
      const err = "[\n" + json.map((e) => "  " + JSON.stringify(e)).join(",\n") + "\n]";
      await fs.writeFile("error.json", err);
      if (typeof noTestWebhook === "string") {
        request({ method: "POST", uri: noTestWebhook }, function (error, response, body) {
          if (error) logger.info(error);
          logger.info(body);
        });
      }
    }
  });
}

async function createEvent(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const eventSummary = "Get tested";

  // Check if an event with the same name already exists
  const eventsList = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const existingEvent = eventsList.data.items.find((event) => {
    const eventDate = new Date(event.start.dateTime || event.start.date);
    return (
      event.summary === eventSummary &&
      eventDate.getDate() === now.getDate() &&
      eventDate.getMonth() === now.getMonth() &&
      eventDate.getFullYear() === now.getFullYear()
    );
  });

  if (existingEvent) {
    logger.info("Event already exists today:", existingEvent.htmlLink);
    return;
  }

  // Create a new event
  const event = {
    summary: eventSummary,
    location: process.env.TEST_LOCATION,
    description: process.env.TEST_EVENT_DESCRIPTION,
    start: {
      dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 00, 0, 0),
      timeZone: process.env.TIMEZONE || "America/Denver",
    },
    end: {
      dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0, 0),
      timeZone: process.env.TIMEZONE || "America/Denver",
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 4 * 60 },
        { method: "popup", minutes: 30 },
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 90 },
        { method: "popup", minutes: 120 },
      ],
    },
  };
  const event2 = {
    ...event,
    start: {
      dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 00, 0, 0),
      timeZone: process.env.TIMEZONE || "America/Denver",
    },
    end: {
      dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0, 0),
      timeZone: process.env.TIMEZONE || "America/Denver",
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 90 },
        { method: "popup", minutes: 180 },
        { method: "popup", minutes: 240 },
      ],
    },
  };
  await calendar.events.insert(
    {
      auth: auth,
      calendarId: "primary",
      resource: event,
    },
    function (err, event) {
      if (err) {
        logger.info("There was an error contacting the Calendar service: " + err);
        return;
      }
      logger.info(`Event created: ${event.htmlLink}`);
    }
  );
  await calendar.events.insert(
    {
      auth: auth,
      calendarId: "primary",
      resource: event2,
    },
    function (err, event) {
      if (err) {
        logger.info("There was an error contacting the Calendar service: " + err);
        return;
      }
      logger.info(`Event created: ${event.htmlLink}`);
    }
  );
}
authorize()
  .then(checkAPI)
  .catch((e) => logger.error(e.message));
