// netlify/functions/gas.js

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzWOV0oIy2p1tsBhSQNtABhBWKQ1o3TS09JTX7p1IBNCoLqoQ9SptE6jZ8joN0zRPAi/exec';

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const qs = event.queryStringParameters || {};
    const action = qs.action || (method === 'POST' ? 'addRow' : 'getRows');

    let url = `${GAS_URL}?action=${encodeURIComponent(action)}`;

    let options = {
      method,
    };

    if (method === 'POST') {
      // ส่ง body เป็น text/plain เพื่อเลี่ยง preflight
      options.headers = {
        'Content-Type': 'text/plain;charset=UTF-8'
      };
      options.body = event.body || '';
    }

    const res = await fetch(url, options);

    const text = await res.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};