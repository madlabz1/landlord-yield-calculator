/**
 * Vercel Serverless Function - Webhook Target for Lead Captures
 * Resolves POST /api/leads in Vercel production hosting.
 */

export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle Options preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const payload = req.body;
      
      // Basic validation
      if (!payload || !payload.lead || !payload.lead.name || !payload.lead.email || !payload.lead.phone) {
        return res.status(400).json({ status: 'error', message: 'Invalid lead capture payload schema.' });
      }

      const { lead, calculatorState } = payload;
      
      // Beautiful console logs in Vercel logs
      console.log('--- NEW LEAD CAPTURED ON VERCEL ---');
      console.log('Timestamp:', lead.timestamp);
      console.log('Name:', lead.name);
      console.log('Email:', lead.email);
      console.log('Phone:', lead.phone);
      console.log('Valuation Request:', lead.requestValuation ? 'Yes' : 'No');
      console.log('--- CALCULATOR METRICS ---');
      console.log('Purchase Price:', calculatorState.inputs.purchasePrice);
      console.log('Monthly Rent:', calculatorState.inputs.monthlyRent);
      console.log('LTV %:', calculatorState.inputs.ltvPercent);
      console.log('Gross Yield:', calculatorState.grossYield.toFixed(2) + '%');
      console.log('Net Yield:', calculatorState.netYield.toFixed(2) + '%');
      console.log('S24 Impact:', calculatorState.section24Impact);
      console.log('Monthly Cashflow:', calculatorState.netMonthlyCashFlow.toFixed(2));
      console.log('-----------------------------------');

      // Vercel serverless functions have a read-only filesystem, so we cannot permanently 
      // write to a local JSON file like Express. But we can log to stdout and return success.
      return res.status(201).json({
        status: 'success',
        message: 'Lead captured successfully on Vercel Serverless!',
        leadId: 'vc_' + Math.random().toString(36).substr(2, 9)
      });

    } catch (error) {
      console.error('Serverless execution failure:', error);
      return res.status(500).json({ status: 'error', message: 'Serverless processing failure' });
    }
  } else if (req.method === 'GET') {
    return res.status(200).json({
      status: 'success',
      message: 'UK Yield Optimisation Calculator Serverless API is online.'
    });
  } else {
    res.setHeader('Allow', ['POST', 'GET', 'OPTIONS']);
    return res.status(405).json({ status: 'error', message: `Method ${req.method} not allowed` });
  }
}
