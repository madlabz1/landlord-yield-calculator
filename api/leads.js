const https = require('https');

// Unique obscured key for this workspace session to store leads securely in the cloud
const KV_KEY = 'madlabz_premier_leads_7fadd7aa';
const WEBHOOK_KEY = 'madlabz_premier_webhook_7fadd7aa';

// Native HTTPS helper to read from KVdb.io
function kvdbGet(key, callback) {
  https.get(`https://kvdb.io/keys/${key}`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        callback(null, data);
      } else if (res.statusCode === 404) {
        callback(null, '[]'); // Default to empty array if key not found
      } else {
        callback(new Error(`KVdb GET status: ${res.statusCode}`));
      }
    });
  }).on('error', (err) => callback(err));
}

// Native HTTPS helper to write to KVdb.io
function kvdbPut(key, value, callback) {
  const options = {
    hostname: 'kvdb.io',
    path: `/keys/${key}`,
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(value)
    }
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        callback(null, data);
      } else {
        callback(new Error(`KVdb PUT status: ${res.statusCode}`));
      }
    });
  });
  req.on('error', (err) => callback(err));
  req.write(value);
  req.end();
}

// Native HTTPS helper to forward data to an external webhook URL
function forwardToWebhook(webhookUrl, payload) {
  try {
    const parsedUrl = new URL(webhookUrl);
    const bodyString = JSON.stringify(payload);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString)
      }
    };
    const req = https.request(options, (res) => {
      console.log(`Webhook forward responded with status: ${res.statusCode}`);
    });
    req.on('error', (err) => {
      console.error('Webhook forwarding error:', err);
    });
    req.write(bodyString);
    req.end();
  } catch (err) {
    console.error('Failed to forward lead to webhook. Invalid URL:', webhookUrl);
  }
}

export default function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Preflight handler
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET handler - Secure lead retrieval
  if (req.method === 'GET') {
    const { secret, action } = req.query;

    if (secret !== 'premier123') {
      return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid secret key.' });
    }

    if (action === 'webhook') {
      // Get current CRM webhook URL
      return kvdbGet(WEBHOOK_KEY, (err, data) => {
        if (err) {
          return res.status(500).json({ status: 'error', message: 'Failed to retrieve webhook URL.' });
        }
        let parsed = { webhookUrl: '' };
        try {
          if (data && data !== '[]') {
            parsed = JSON.parse(data);
          }
        } catch (e) {}
        return res.status(200).json(parsed);
      });
    }

    // Default: Get all captured leads
    return kvdbGet(KV_KEY, (err, data) => {
      if (err) {
        console.error('Error fetching leads from KVdb:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to load leads from cloud store.' });
      }
      let database = [];
      try {
        database = JSON.parse(data);
      } catch (e) {
        database = [];
      }
      return res.status(200).json(database);
    });
  }

  // POST handler - Submit lead or configure webhook
  if (req.method === 'POST') {
    const { secret, action, webhookUrl } = req.body;

    // Webhook Configuration
    if (action === 'webhook') {
      if (secret !== 'premier123') {
        return res.status(401).json({ status: 'error', message: 'Unauthorized.' });
      }
      const newConfig = JSON.stringify({ webhookUrl: webhookUrl || '' });
      return kvdbPut(WEBHOOK_KEY, newConfig, (err) => {
        if (err) {
          return res.status(500).json({ status: 'error', message: 'Failed to update CRM Webhook.' });
        }
        return res.status(200).json({ status: 'success', message: 'CRM Webhook URL updated successfully!' });
      });
    }

    // Lead Capture
    const payload = req.body;
    if (!payload || !payload.lead || !payload.lead.name || !payload.lead.email || !payload.lead.phone) {
      return res.status(400).json({ status: 'error', message: 'Invalid lead capture payload schema.' });
    }

    const { lead, calculatorState } = payload;
    const timestamp = lead.timestamp || new Date().toISOString();

    // 1. Get current list from Cloud KV
    kvdbGet(KV_KEY, (err, data) => {
      let database = [];
      if (!err) {
        try {
          database = JSON.parse(data);
        } catch (e) {
          database = [];
        }
      }

      // Create new lead record
      const newRecord = {
        id: database.length + 1,
        timestamp,
        lead: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          requestValuation: !!lead.requestValuation
        },
        inputs: calculatorState?.inputs || {},
        results: {
          grossYield: calculatorState?.grossYield || 0,
          netYield: calculatorState?.netYield || 0,
          postTaxYield: calculatorState?.postTaxYield || 0,
          netMonthlyCashFlow: calculatorState?.netMonthlyCashFlow || 0,
          section24Impact: calculatorState?.section24Impact || 0,
          ltdCoTaxSavings: calculatorState?.ltdCoTaxSavings || 0
        }
      };

      database.push(newRecord);

      // 2. Put back to Cloud KV
      kvdbPut(KV_KEY, JSON.stringify(database, null, 2), (putErr) => {
        if (putErr) {
          console.error('Error writing leads to KVdb:', putErr);
        }

        console.log('--- NEW CLOUD LEAD CAPTURED ---', lead.name, lead.email);

        // 3. Mirror to CRM Webhook if configured
        kvdbGet(WEBHOOK_KEY, (hookErr, hookData) => {
          if (!hookErr && hookData && hookData !== '[]') {
            try {
              const parsed = JSON.parse(hookData);
              if (parsed && parsed.webhookUrl) {
                console.log('Forwarding lead to CRM webhook:', parsed.webhookUrl);
                forwardToWebhook(parsed.webhookUrl, newRecord);
              }
            } catch (e) {}
          }
        });

        return res.status(201).json({
          status: 'success',
          message: 'Lead captured and synced successfully on Cloud KV!',
          leadId: 'vc_' + Math.random().toString(36).substr(2, 9)
        });
      });
    });
  }
}
