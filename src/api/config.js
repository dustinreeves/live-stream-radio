const authService = require('./auth');
const nodePath = require('path');
const fs = require('fs-extra');
const configFile = require('../configFile');

const getFullConfig = async path => {
  // Return the current config
  return [200, await configFile.readConfig(nodePath.join(path, 'config.json'))];
};

const getConfigByKey = async (path, key) => {
  const config = await configFile.readConfig(nodePath.join(path, 'config.json'));

  // Return 200 if the key exists (even for values like false or 0) and 404 if it does not
  const configValue = configFile.getValue(config, key);
  if (configValue !== undefined) {
    return [200, configValue];
  } else {
    return [404, null];
  }
};

// value is JSON text (e.g. from a form), or an already parsed JSON body value
const parseValue = value => {
  if (typeof value !== 'string') {
    return value;
  }
  return JSON.parse(value);
};

const changeConfig = async (path, key, value) => {
  let newValue;
  try {
    newValue = parseValue(value);
  } catch (e) {
    return [400, { message: 'value must be JSON, e.g. "\\"text\\"", 5 or true' }];
  }
  if (newValue === undefined) {
    return [400, { message: 'value is required' }];
  }

  // Change config
  const configPath = nodePath.join(path, 'config.json');
  const config = await configFile.readConfig(configPath);
  const currentValue = configFile.getValue(config, key);
  configFile.setValue(config, key, newValue);

  const problem = configFile.findConfigProblem(config);
  if (problem) {
    return [400, { message: problem }];
  }
  await configFile.writeConfig(configPath, config);

  return [200, { key: key, oldValue: currentValue, newValue: newValue }];
};

const replaceConfig = async (path, newConfig) => {
  const problem = configFile.findConfigProblem(newConfig);
  if (problem) {
    return [400, { message: problem }];
  }

  // Keep the previous version next to it, in case of a bad edit
  const configPath = nodePath.join(path, 'config.json');
  await fs.copy(configPath, `${configPath}.bak`);
  await configFile.writeConfig(configPath, newConfig);

  return [200, { message: 'OK', backup: 'config.json.bak' }];
};

// A bad key (e.g. "a..b" or "__proto__") is the request's fault
const badKeyResponse = (reply, e) => {
  reply.type('application/json').code(400);
  return { message: e.message };
};

module.exports = (fastify, path, stream, getConfig) => {
  // Replace the whole config.json, body is { config: {...} }
  fastify.put(
    '/config',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const response = await replaceConfig(path, request.body && request.body.config);

      reply.type('application/json').code(response[0]);
      return response[1];
    })
  );

  fastify.get(
    '/config',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      // Returns full config is "key" is not set, otherwise only return the requested key
      let response;
      try {
        if (request.query.key) {
          response = await getConfigByKey(path, request.query.key);
        } else {
          response = await getFullConfig(path);
        }
      } catch (e) {
        return badKeyResponse(reply, e);
      }

      reply.type('application/json').code(response[0]);
      return {
        key: request.query.key,
        value: response[1]
      };
    })
  );

  // Change a setting
  fastify.post(
    '/config',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const body = request.body || {};
      if (typeof body.key !== 'string' || body.key.length === 0) {
        reply.type('application/json').code(400);
        return { message: 'key is required' };
      }

      let response;
      try {
        response = await changeConfig(path, body.key, body.value);
      } catch (e) {
        return badKeyResponse(reply, e);
      }

      reply.type('application/json').code(response[0]);
      return {
        response: response[1]
      };
    })
  );
};
