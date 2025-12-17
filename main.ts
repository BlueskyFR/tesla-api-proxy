import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { basicAuth } from "hono/basic-auth";
import { createMiddleware } from "hono/factory";
import { cors } from "hono/cors";

import ky, { HTTPError } from "ky";
import {
  Credentials,
  FrunkOpeningResult,
  PreconditionResult,
  ShareRequest,
  ShareResult,
  StateResult,
  TokenAnswer,
} from "./types.ts";

// Filename holding the app secrets
const credsFilename = "credentials.json";

// Parse the API tokens (file overwritten later if a new token is retrieved)
let credentials: Credentials = JSON.parse(
  await Deno.readTextFile(credsFilename),
);

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

const app = new Hono();
// REST api, direct access
const api = ky.create({
  prefixUrl: `https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles/${credentials.VIN}`,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
  },
  timeout: 10000,
  retry: 3,
  hooks: {
    beforeRequest: [
      (request) => {
        request.headers.set("Authorization", `Bearer ${credentials.token}`);
      },
    ],
    afterResponse: [
      // Refresh the token and retry on 401 errors (token expired)
      async (request, _options, response) => {
        if (response.status === 401) {
          console.log("Renewing token...");
          // Get a fresh token
          /// Refresh the access token
          /// POST to https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token
          /// with {grant_type: "refresh_token", client_id: "abc123", refresh_token: "XXX"}
          /// giving {access_token: "XXX", refresh_token: "XXX"}
          const newCreds = await ky
            .post("https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token", {
              json: {
                grant_type: "refresh_token",
                client_id: credentials.clientID,
                refresh_token: credentials.refreshToken,
              },
            })
            .json<TokenAnswer>();

          credentials = {
            ...credentials,
            token: newCreds.access_token,
            refreshToken: newCreds.refresh_token,
          };
          await Deno.writeTextFile(
            credsFilename,
            JSON.stringify(credentials, null, 2),
          );
          console.log("Done! Retrying request...");

          // Finally, retry with the new token
          // For some reason the pre-request hook doesn't seem to be run again, so set the new token here
          request.headers.set("Authorization", `Bearer ${credentials.token}`);
          return ky(request);
        }
      },
    ],
  },
});

// Proxies requests through the vehicle command proxy container
const apiProxy = api.extend((_) => ({
  prefixUrl: `https://vehicle-command-proxy/api/1/vehicles/${credentials.VIN}`,
}));

// Signed vehicle commands shortcut, always requiring proxy
const command = apiProxy.extend((options) => ({
  prefixUrl: `${options.prefixUrl}/command`,
}));

// CORS - allow access from anywhere
// (allowing a single domain doesn't appear to be working)
app.use("*", cors());

// Endpoints authentication
app.use(
  "*",
  basicAuth({
    username: credentials.basicAuth.username,
    password: credentials.basicAuth.password,
    invalidUserMessage: ({
      success: false,
      error: "Invalid user/password, sorry!",
    }),
  }),
);

async function isVehicleOnline(): Promise<boolean> {
  const state = await apiProxy.get("").json<StateResult>();
  return state.response.state === "online";
}

// Simple middleware that ensures the vehicle is online before proceeding.
// `next()` is only called if the vehicle is online
const ensureVehicleOnline = createMiddleware(async (c, next) => {
  // Poll the vehicle's current state
  if (!await isVehicleOnline()) {
    console.log("Waking up the car...");
    await apiProxy.post("wake_up");
    // It always takes at least 10 seconds to wake up the vehicle
    await wait(10000);
  }

  // Wait for the vehicle to come online, every 5 seconds.
  // Give up after 60 seconds
  let timeout = 60000;
  const interval = 5000;
  while (!await isVehicleOnline()) {
    timeout -= interval;
    // If timeout
    if (timeout < 0) {
      return c.json({ success: false, error: "Failed to wake up vehicle :(" });
    }

    await wait(interval);
  }

  console.log("Vehicle online, proceeding!");
  await next();
});

app
  .get("/", (c) => c.text("Hello there!"))
  .get(
    "/share",
    // Validate the incoming JSON
    /// On error, { sucess: false, error: "XXX" } is returned
    zValidator("query", ShareRequest),
    async (c) => {
      const params = c.req.valid("query");

      // navigation_request is a non-proxied command, straight to the REST api
      // because of backend server processing needs
      let res;
      try {
        res = await api.post("command/navigation_request", {
          json: {
            type: "share_ext_content_raw",
            locale: "en-US",
            timestamp_ms: Date.now(),
            value: {
              "android.intent.extra.TEXT": params.content,
            },
          },
        }).json<ShareResult>();
      } catch (e: unknown) {
        if (e instanceof HTTPError && e.name === "HTTPError") {
          const error = await e.response.json();
          console.error(`Error sharing url ${params.content}: ${error.error_description}`);
          return c.json({ success: false, error: error.error_description });
        }
        console.error(e);
      }

      return c.json({ success: res?.response?.result === true });
    },
  )
  // This endpoint requires the vehicle to be online (~70-75 seconds max)
  // and then preconditions the car, so a request timeout of 120 seconds
  // is prefered for callers
  .get("/precondition", ensureVehicleOnline, async (c) => {
    const res = await command.post("auto_conditioning_start")
      .json<PreconditionResult>();
    return c.json({ success: res.response?.result === true });
  })
  .get("/open-frunk", ensureVehicleOnline, async (c) => {
    const res = await command.post("actuate_trunk", {
      json: { which_trunk: "front" },
    }).json<FrunkOpeningResult>();

    if (res?.response?.result === true) {
      return c.json({ success: true });
    }
    return c.json({ success: false, error: res.response?.reason });
  });

Deno.serve({ port: Deno.env.has("DEV_MODE") ? 1234 : 80 }, app.fetch);
