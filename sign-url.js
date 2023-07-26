// sign-url.js, part 1/5

// This example uses auth0's jsonwebtoken library. You're free
// to use any JWT library you'd like.
import jwt from "jsonwebtoken";

// This example uses the node-fetch HTTP library. You're free to
// use any HTTP library you'd like.
import fetch from "node-fetch";

/**
 * Creates an asset key from Contentful
 *
 * @param host string which Contentful API host to use
 * @param accessToken string the Contentful API access token to use
 * @param spaceId string the ID of the space
 * @param environmentId string the ID of the environment
 * @param expiresAtMs number (optional) the JS Unix timestamp (in ms) when the token
 *     should expire. Maximum value of now + 48h.
 * @returns an object with `policy` and `secret` keys
 */
async function createAssetKey(
  host,
  accessToken,
  spaceId,
  environmentId,
  expiresAtMs
) {
  if (expiresAtMs === undefined) {
    // If no expiry is specified, default to longest expiry: 48h
    expiresAtMs = Date.now() + 48 * 60 * 60 * 1000;
  }
  const response = await fetch(
    `https://${host}/spaces/${spaceId}/environments/${environmentId}/asset_keys`,
    {
      method: "POST",
      body: JSON.stringify({
        expiresAt: Math.floor(expiresAtMs / 1000), // in seconds
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to create asset key: ${response.status}`);
  }
  return await response.json();
}

const createDeliveryAssetKey = (...args) =>
  createAssetKey("cdn.contentful.com", ...args);
const createManagementAssetKey = (...args) =>
  createAssetKey("api.contentful.com", ...args);
const createPreviewAssetKey = (...args) =>
  createAssetKey("preview.contentful.com", ...args);

// sign-url.js, part 2/5

const assetKeyCache = new Map();

/**
 * Creates an asset key with a cache. If an asset key is already available, it will
 * be returned immediately. Otherwise, a fresh asset key will be created and cached.
 * Asset keys are always fetched with the greated possible expiry. This allows
 * multiple requests for shorter expiries to be collapsed into one request.
 *
 * @param host string the Contentful API host to contact
 * @param accessToken string the Contentful API access token to use
 * @param spaceId string the space ID for the asset key
 * @param environmentId string the environment ID for the asset key
 * @param minExpiresAtMs number a JS Unix timestamp (in ms) that is the minimum expiry
 *     time that you require for signing
 * @returns a Promise resolving to an asset key with `policy` and `secret` properties
 */
function createCachedAssetKey(
  host,
  accessToken,
  spaceId,
  environmentId,
  minExpiresAtMs
) {
  const cacheKey = `${host}:${spaceId}:${environmentId}`;
  let cacheItem = assetKeyCache.get(cacheKey);
  if (!cacheItem || cacheItem.expiresAtMs < minExpiresAtMs) {
    // Create a new key at the maximum validity, 48h
    const expiresAtMs = Date.now() + 48 * 60 * 60 * 1000;
    if (minExpiresAtMs > expiresAtMs) {
      throw new Error(
        `Cannot fetch an asset key so far in the future: ${minExpiresAtMs} > ${expiresAtMs}`
      );
    }
    const promise = createAssetKey(
      host,
      accessToken,
      spaceId,
      environmentId,
      expiresAtMs
    ).catch((err) => {
      // If we encounter an error, make sure to clear the cache item if
      // this is the most recent fetch.
      const curCacheItem = assetKeyCache.get(cacheKey);
      if (curCacheItem === cacheItem) {
        assetKeyCache.delete(cacheKey);
      }
      return Promise.reject(err);
    });
    cacheItem = { expiresAtMs, promise };
    assetKeyCache.set(cacheKey, cacheItem);
  }
  return cacheItem.promise;
}

const createCachedDeliveryAssetKey = (...args) =>
  createCachedAssetKey("cdn.contentful.com", ...args);
const createCachedManagementAssetKey = (...args) =>
  createCachedAssetKey("api.contentful.com", ...args);
const createCachedPreviewAssetKey = (...args) =>
  createCachedAssetKey("preview.contentful.com", ...args);

// sign-url.js, part 3/5

/**
 * Generates a signed "token" for an embargoed asset
 *
 * @param secret string the secret retrieved from the asset_keys endpoint
 * @param urlWithoutQueryParams string a url, without query parameters
 *   attached, that you'd like to sign
 * @param expiresAtMs number (optional) the JS Unix timestamp (in ms) of
 *   when the signed URL should expire
 * @returns string the signed url
 */
function generateSignedToken(secret, urlWithoutQueryParams, expiresAtMs) {
  // Convert expiresAtMs to seconds, if defined
  const exp = expiresAtMs ? Math.floor(expiresAtMs / 1000) : undefined;
  return jwt.sign(
    {
      sub: urlWithoutQueryParams,
      exp,
    },
    secret,
    { algorithm: "HS256" }
  );
}

// sign-url.js, part 4/5

/**
 * Generates a signed URL, given a policy, secret, and expiry time.
 *
 * @param policy string the policy returned as part of an asset key
 * @param secret string the secret returned as part of an asset key
 * @param url string the url to be signed (may have query parameters)
 * @param expiresAtMs number the JS Unix timestamp (in ms) when this signed
 *     url should expire
 * @returns string the signed url
 */
function generateSignedUrl(policy, secret, url, expiresAtMs) {
  const parsedUrl = new URL(url);

  const urlWithoutQueryParams = parsedUrl.origin + parsedUrl.pathname;
  // See previous section for "generateSignedToken" code
  const token = generateSignedToken(secret, urlWithoutQueryParams, expiresAtMs);

  parsedUrl.searchParams.set("token", token);
  parsedUrl.searchParams.set("policy", policy);

  return parsedUrl.toString();
}

// sign-url.js, part 5/5

/**
 * Creates/uses a cached asset key to sign an asset URL
 *
 * @param host string the Contentful api host to use
 * @param accessToken string the Contentful API access token to use
 * @param spaceId string the space ID from which the asset key should be created
 * @param environmentId string the environment ID form which the asset key should be created
 * @param url string the fully-qualified asset url to sign
 * @param expiresAtMs number a JS Unix timestamp (in ms) when this signed
 *     url should expire
 * @returns string a signed url
 */
async function signUrl(
  host,
  accessToken,
  spaceId,
  environmentId,
  url,
  expiresAtMs
) {
  const { policy, secret } = await createCachedAssetKey(
    host,
    accessToken,
    spaceId,
    environmentId,
    expiresAtMs
  );
  return generateSignedUrl(policy, secret, url, expiresAtMs);
}

export default signUrl;
