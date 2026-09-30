const crypto = require('crypto');
const usersService = require('./users');

// Compare keys in constant time, hashing first so different lengths are safe to compare
const keysMatch = (expectedKey, providedKey) => {
  if (typeof providedKey !== 'string') {
    return false;
  }

  const expectedHash = crypto
    .createHash('sha256')
    .update(String(expectedKey))
    .digest();
  const providedHash = crypto
    .createHash('sha256')
    .update(providedKey)
    .digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
};

// Function to verify a key
const verifyKey = async (getConfig, request) => {
  // Get our returned config
  const config = await getConfig();

  // A signed in web console user
  if (usersService.getSessionFromRequest(request)) {
    return true;
  }

  // With no key and no console users the api is open, as before
  if (!config.api.key) {
    return !usersService.hasUsers(config);
  }

  // Array of places to store the API key
  const supportedApiKeyFields = [request.headers.authorization, request.query.api_key];

  // Also check POST request bodies
  if (request.body) {
    supportedApiKeyFields.push(request.body.api_key);
  }

  return supportedApiKeyFields.some(keyField => {
    return keysMatch(config.api.key, keyField);
  });
};

// Function to wrap a standard route handler
const secureRouteHandler = (getConfig, routeHandler) => {
  return async (request, reply) => {
    const keyResponse = await verifyKey(getConfig, request);
    if (keyResponse) {
      return await routeHandler(request, reply);
    } else {
      reply.type('application/json').code(401);
      return {
        message: 'Unauthorized: Please pass a valid API Key'
      };
    }
  };
};

// File to handle api authentication
module.exports = {
  verifyKey: verifyKey,
  secureRouteHandler: secureRouteHandler
};
