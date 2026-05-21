const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend cross-origin requests
app.use(cors());

// Enable JSON body parsing
app.use(express.json());

// Serve static assets from the root and src directories
app.use(express.static(path.join(__dirname)));
app.use('/src', express.static(path.join(__dirname, 'src')));

// Webhook forward helper (handles http and https)
function forwardToWebhook(webhookUrl, payload) {
    try {
        const parsedUrl = new URL(webhookUrl);
        const bodyString = JSON.stringify(payload);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyString)
            }
        };

        const req = client.request(options, (res) => {
            console.log(`[Webhook forward] Responded with status: ${res.statusCode}`);
        });

        req.on('error', (err) => {
            console.error('[Webhook error] Forwarding failed:', err.message);
        });

        req.write(bodyString);
        req.end();
    } catch (err) {
        console.error('[Webhook error] Invalid URL:', webhookUrl);
    }
}

// GET /api/leads - Retrieve Captured Leads (Secure)
app.get('/api/leads', (req, res) => {
    try {
        const { secret, action } = req.query;

        if (secret !== 'premier123') {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Invalid secret key.'
            });
        }

        if (action === 'webhook') {
            const configPath = path.join(__dirname, 'webhook_config.json');
            let config = { webhookUrl: '' };
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
            return res.json(config);
        }

        const dbPath = path.join(__dirname, 'leads_db.json');
        let database = [];
        if (fs.existsSync(dbPath)) {
            try {
                const rawData = fs.readFileSync(dbPath, 'utf8');
                database = JSON.parse(rawData);
            } catch (err) {
                console.error('[DB ERROR] Failed to parse leads_db.json:', err);
            }
        }

        return res.json(database);
    } catch (error) {
        console.error('[SERVER ERROR] Failed to fetch leads:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve database.' });
    }
});

// POST /api/leads - Webhook endpoint to capture leads
app.post('/api/leads', (req, res) => {
    try {
        const payload = req.body;
        const { secret, action, webhookUrl } = payload;

        // If action is webhook configuration, handle it and return
        if (action === 'webhook') {
            if (secret !== 'premier123') {
                return res.status(401).json({ status: 'error', message: 'Unauthorized.' });
            }
            const configPath = path.join(__dirname, 'webhook_config.json');
            fs.writeFileSync(configPath, JSON.stringify({ webhookUrl: webhookUrl || '' }, null, 2), 'utf8');
            return res.json({
                status: 'success',
                message: 'CRM Webhook URL updated successfully!'
            });
        }

        const { lead, calculatorState } = payload;

        if (!lead || !lead.name || !lead.email || !lead.phone) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid payload: Name, Email, and Phone are required.'
            });
        }

        const timestamp = lead.timestamp || new Date().toISOString();
        const dbPath = path.join(__dirname, 'leads_db.json');

        // Read and parse current database
        let database = [];
        if (fs.existsSync(dbPath)) {
            try {
                const rawData = fs.readFileSync(dbPath, 'utf8');
                database = JSON.parse(rawData);
            } catch (err) {
                console.error('[DB ERROR] Failed to parse leads_db.json.', err);
            }
        }

        // Add new lead
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

        // Write back to leads_db.json
        fs.writeFileSync(dbPath, JSON.stringify(database, null, 2), 'utf8');

        // Beautiful Colorized Log Output to Terminal
        console.log('\n\x1b[36m======================================================================\x1b[0m');
        console.log('\x1b[32;1m🚀 NEW LOCAL LEAD CAPTURED SUCCESSFULLY!\x1b[0m');
        console.log(`\x1b[33mReceived At:\x1b[0m  ${new Date(timestamp).toLocaleString()}`);
        console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');
        console.log('\x1b[1m👤 CONTACT DETAILS:\x1b[0m');
        console.log(`  \x1b[35mName:\x1b[0m       ${lead.name}`);
        console.log(`  \x1b[35mEmail:\x1b[0m      ${lead.email}`);
        console.log(`  \x1b[35mPhone:\x1b[0m      ${lead.phone}`);
        console.log(`  \x1b[35mValuation:\x1b[0m  ${lead.requestValuation ? '\x1b[32;1m✓ Yes, Requested Free Valuation\x1b[0m' : '\x1b[31m✗ No Valuation Requested\x1b[0m'}`);
        console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');
        
        if (calculatorState && calculatorState.inputs) {
            const inputs = calculatorState.inputs;
            console.log('\x1b[1m🏠 PROPERTY SPECIFICATIONS:\x1b[0m');
            console.log(`  \x1b[34mPurchase Price:\x1b[0m  £${new Intl.NumberFormat('en-GB').format(inputs.purchasePrice)}`);
            console.log(`  \x1b[34mMonthly Rent PCM:\x1b[0m £${new Intl.NumberFormat('en-GB').format(inputs.monthlyRent)}`);
            console.log(`  \x1b[34mMortgage LTV:\x1b[0m     ${inputs.ltvPercent}% LTV`);
            console.log(`  \x1b[34mMortgage Rate:\x1b[0m   ${inputs.mortgageRate}%`);
            console.log(`  \x1b[34mTax Bracket:\x1b[0m     ${inputs.taxRate * 100}%`);
            console.log(`  \x1b[34mBuying Vehicle:\x1b[0m  ${inputs.isLimitedCompany ? '\x1b[32;1mSPV Limited Company\x1b[0m' : '\x1b[33mIndividual Ownership\x1b[0m'}`);
            console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');
        }

        if (calculatorState) {
            console.log('\x1b[1m📊 FINANCIAL ANALYTICS:\x1b[0m');
            console.log(`  \x1b[32mGross Yield:\x1b[0m     ${calculatorState.grossYield.toFixed(2)}%`);
            console.log(`  \x1b[32mOperating Yield:\x1b[0m   ${calculatorState.netYield.toFixed(2)}%`);
            console.log(`  \x1b[32mNet Monthly Cashflow:\x1b[0m £${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(calculatorState.netMonthlyCashFlow)}`);
            console.log(`  \x1b[31mSection 24 Tax Drag:\x1b[0m  £${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(calculatorState.section24Impact)} /yr`);
            console.log(`  \x1b[32mEst. Corporate Savings:\x1b[0m £${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(calculatorState.ltdCoTaxSavings)} /yr`);
        }
        console.log('\x1b[36m======================================================================\x1b[0m\n');

        // Check if a Webhook configuration exists and forward the lead
        const configPath = path.join(__dirname, 'webhook_config.json');
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config && config.webhookUrl) {
                    console.log(`[Webhook forward] Sending captured lead data to CRM: ${config.webhookUrl}`);
                    forwardToWebhook(config.webhookUrl, newRecord);
                }
            } catch (e) {
                console.error('[Webhook error] Failed to process webhook configuration:', e.message);
            }
        }

        // Respond with success structure
        return res.status(200).json({
            status: 'success',
            message: 'Lead captured successfully!'
        });

    } catch (error) {
        console.error('\x1b[31m[SERVER ERROR] Failed to process incoming webhook lead:\x1b[0m', error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error occurred while processing lead.'
        });
    }
});

// Serve index.html as the base route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Listen on configured port
app.listen(PORT, () => {
    console.log(`\n\x1b[32;1m======================================================================\x1b[0m`);
    console.log(`\x1b[32;1m⚡ YieldOptima Premium Landlord Yield & Tax Optimisation Backend Server\x1b[0m`);
    console.log(`\x1b[36m🏠 Static Web App:\x1b[0m  \x1b[4mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[36m🔌 Webhook API Endpoint:\x1b[0m \x1b[4mhttp://localhost:${PORT}/api/leads\x1b[0m`);
    console.log(`\x1b[36m📂 Database File:\x1b[0m      ${path.join(__dirname, 'leads_db.json')}`);
    console.log(`\x1b[32;1m======================================================================\x1b[0m\n`);
});
