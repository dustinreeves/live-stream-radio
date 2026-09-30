// Username / password logins for the web console.
// Users live in config.json under console.users with pbkdf2 hashed passwords,
// set them with: live-stream-radio --set-password [Project Directory]
const crypto = require('crypto');
const { isEnabled } = require('../configValues');

const HASH_ITERATIONS = 150000;
const HASH_DIGEST = 'sha256';
const HASH_BYTES = 32;

const DEFAULT_SESSION_HOURS = 12;

// Lock out an address after too many failed logins
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// In memory, so everyone is signed out when the process restarts
const sessions = {};
const failedLogins = {};

const pbkdf2 = (password, salt, iterations) => {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, HASH_BYTES, HASH_DIGEST, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key);
      }
    });
  });
};

// Stored as pbkdf2$<digest>$<iterations>$<salt hex>$<hash hex>
const hashPassword = async password => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await pbkdf2(password, salt, HASH_ITERATIONS);
  return `pbkdf2$${HASH_DIGEST}$${HASH_ITERATIONS}$${salt}$${hash.toString('hex')}`;
};

const verifyPassword = async (password, storedHash) => {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== HASH_DIGEST) {
    return false;
  }

  const expected = Buffer.from(parts[4], 'hex');
  const actual = await pbkdf2(password, parts[3], parseInt(parts[2], 10));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const getUsers = config => {
  if (config.console && Array.isArray(config.console.users)) {
    return config.console.users.filter(user => user && user.username && user.password_hash);
  }
  return [];
};

const hasUsers = config => {
  return getUsers(config).length > 0;
};

const isLockedOut = address => {
  const entry = failedLogins[address];
  if (!entry) {
    return false;
  }
  if (Date.now() - entry.first > LOCKOUT_MINUTES * 60 * 1000) {
    delete failedLogins[address];
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
};

const recordFailedLogin = address => {
  const entry = failedLogins[address];
  if (!entry || Date.now() - entry.first > LOCKOUT_MINUTES * 60 * 1000) {
    failedLogins[address] = { count: 1, first: Date.now() };
  } else {
    entry.count++;
  }
};

// Returns the session if the token is valid and not expired
const getSession = token => {
  if (typeof token !== 'string' || !sessions.hasOwnProperty(token)) {
    return undefined;
  }
  const session = sessions[token];
  if (Date.now() > session.expires) {
    delete sessions[token];
    return undefined;
  }
  return session;
};

// Sessions are sent as "Authorization: Session <token>"
const getSessionFromRequest = request => {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.indexOf('Session ') === 0) {
    return getSession(header.substr('Session '.length));
  }
  return undefined;
};

const login = async (config, username, password, address) => {
  if (isLockedOut(address)) {
    return [429, { message: `Too many failed logins, try again in ${LOCKOUT_MINUTES} minutes` }];
  }

  const user = getUsers(config).find(user => user.username === username);

  // Always spend the time hashing, so a missing username takes as long as a wrong password
  const passwordOk = await verifyPassword(
    String(password || ''),
    user ? user.password_hash : `pbkdf2$${HASH_DIGEST}$${HASH_ITERATIONS}$00$00`
  );

  if (!user || !passwordOk) {
    recordFailedLogin(address);
    return [401, { message: 'Wrong username or password' }];
  }

  delete failedLogins[address];

  const sessionHours = (config.console && parseFloat(config.console.session_hours)) || DEFAULT_SESSION_HOURS;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + sessionHours * 60 * 60 * 1000;
  sessions[token] = { username: user.username, expires: expires };

  return [200, { token: token, username: user.username, expires: expires }];
};

const isLoopback = address => {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
};

// The address a request came from. Behind a reverse proxy (api.trust_proxy) every request
// arrives from localhost, so use the client address the proxy appends to X-Forwarded-For.
// Only the last entry is trusted: that one was added by our proxy, earlier ones can be faked.
const getAddress = (request, config) => {
  // fastify 1.x keeps the node request on .req
  const raw = request.req || request.raw;
  const address = (raw && raw.connection && raw.connection.remoteAddress) || 'unknown';

  const forwardedFor = request.headers['x-forwarded-for'];
  if (config.api && isEnabled(config.api.trust_proxy) && isLoopback(address) && typeof forwardedFor === 'string') {
    const clientAddress = forwardedFor
      .split(',')
      .pop()
      .trim();
    if (clientAddress) {
      return clientAddress;
    }
  }

  return address;
};

const addRoutes = (fastify, path, stream, getConfig) => {
  fastify.post('/console/login', async (request, reply) => {
    const config = await getConfig();
    const body = request.body || {};
    const address = getAddress(request, config);
    const response = await login(config, body.username, body.password, address);

    if (response[0] === 200) {
      console.log(`Web console login: ${response[1].username} from ${address}`);
    } else {
      console.log(`Web console login failed for "${String(body.username).substr(0, 64)}" from ${address}`);
    }

    reply.type('application/json').code(response[0]);
    return response[1];
  });

  fastify.post('/console/logout', async (request, reply) => {
    const header = request.headers.authorization;
    if (typeof header === 'string' && header.indexOf('Session ') === 0) {
      delete sessions[header.substr('Session '.length)];
    }

    reply.type('application/json').code(200);
    return { message: 'OK' };
  });
};

module.exports = {
  hashPassword: hashPassword,
  hasUsers: hasUsers,
  getSessionFromRequest: getSessionFromRequest,
  addRoutes: addRoutes
};
