import express from "express";
import signUrl from "./sign-url.js";

//tJVsuAvJJ1F2q4EHxUdXq-D9CWsUkTtPHmATM-swZzY

import dotenv, { config } from "dotenv";

dotenv.config({ path: "./.env" });

const CONTENTFUL_API_HOST = process.env.CONTENTFUL_API_HOST;

const ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;

const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;

const ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT_ID || "master";

const PORT = parseInt(process.env.PORT || "8080", 10);

const HOST = process.env.HOST || "";

// The default signed URL lifetime
const URL_LIFETIME = 10 * 1000; // 10 seconds

// An authorization function that checks if a user is allowed to view
// a given path. Replace with your own authorization logic for a given URL.
function canFetch(req) {
  // For example, you might check for the presence of a signed cookie
  // identifying the current user and check the requested URL against
  //  that user's access rights
  console.log("req", req.headers);
  return true;
}

// Middleware that checks if the current user can retrieve the current path
function authorizeRequest(req, res, next) {
  if (!canFetch(req)) {
    next(new Error("Unauthorized"));
  } else {
    next();
  }
}

// Creates a sign-and-redirect handler for a given asset subdomain
function handlerForSubdomain(subdomain) {
  return express
    .Router()
    .get("/:spaceId/*", authorizeRequest, async (req, res, next) => {
      // req.path does not include the /images, /assets etc router mount point,
      // only the path that comes after (including a leading /)
      const path = req.path;

      // This simple service can only sign URLs for the configured space. All
      // other URLs should 404.
      if (req.params.spaceId !== SPACE_ID) {
        return res.sendStatus(404);
      }

      try {
        // Rewrite the path to point to the original URL
        const unsignedUrl = new URL(
          path,
          `https://${subdomain}.secure.ctfassets.net`
        );
        // Re-set the query params from this request on the rewritten URL,
        // for example for image transformations
        for (const [key, values] of Object.entries(req.query)) {
          if (Array.isArray(values)) {
            for (const value of values) {
              unsignedUrl.searchParams.append(key, value);
            }
          } else {
            unsignedUrl.searchParams.set(key, values);
          }
        }
        // Sign the url...
        const signedUrl = await signUrl(
          CONTENTFUL_API_HOST,
          ACCESS_TOKEN,
          SPACE_ID,
          ENVIRONMENT_ID,
          unsignedUrl.toString(),
          Date.now() + URL_LIFETIME
        );
        // ... and redirect the user's browser to it
        res.redirect(signedUrl);
      } catch (err) {
        res.sendStatus(500);
      }
    });
}

const app = express();

app.get("/ping", function (req, res) {
  return res.send("success");
});

app.use("/images", handlerForSubdomain("images"));
app.use("/assets", handlerForSubdomain("assets"));
app.use("/downloads", handlerForSubdomain("downloads"));
app.use("/videos", handlerForSubdomain("videos"));

const server = app.listen(PORT, HOST, (err) => {
  console.log(`Asset service running on ${HOST}:${PORT}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
