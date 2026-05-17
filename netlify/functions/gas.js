// netlify/functions/gas.js

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzWOV0oIy2p1tsBhSQNtABhBWKQ1o3TS09JTX7p1IBNCoLqoQ9SptE6jZ8joN0zRPAi/exec';

// ===== CONFIG =====
const MAX_RETRY = 2;
const RATE_LIMIT_WINDOW = 10000; // 10 วิ
const RATE_LIMIT_MAX = 20; // ต่อ IP

// memory rate limit (simple)
const ipStore = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const record = ipStore.get(ip) || { count: 0, time: now };

  if (now - record.time > RATE_LIMIT_WINDOW) {
    ipStore.set(ip, { count: 1, time: now });
    return false;
  }

  record.count++;
  ipStore.set(ip, record);

  return record.count > RATE_LIMIT_MAX;
}

async function fetchWithRetry(url, options, retries = MAX_RETRY) {
  try {
    const res = await fetch(url, options);

    if (!res.ok) throw new Error('HTTP ' + res.status);

    return res;

  } catch (err) {
    if (retries > 0) {
      console.warn('Retrying...', retries);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

exports.handler = async (event) => {
  const ip = event.headers['x-forwarded-for'] || 'unknown';

  // ===== RATE LIMIT =====
  if (rateLimit(ip)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests' })
    };
  }

  try {
    const method = event.httpMethod;
    const qs = event.queryStringParameters || {};
    const action = qs.action || (method === 'POST' ? 'addRow' : 'getRows');

    const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;

    let options = { method };

    if (method === 'POST') {
      options.headers = {
        'Content-Type': 'text/plain;charset=UTF-8'
      };
      options.body = event.body || '';
    }

    console.log('Request:', { ip, action });

    const res = await fetchWithRetry(url, options);

    const text = await res.text();

    // ===== LOG RESPONSE (debug) =====
    console.log('Response length:', text.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };

  } catch (err) {
    console.error('ERROR:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal error',
        message: err.message
      })
    };
  }
};