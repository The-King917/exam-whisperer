export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { syllabus, writing } = req.body;
  if (!syllabus) return res.status(400).json({ error: 'No syllabus provided' });

  // Log all environment variables for debugging (remove in production!)
  console.log('All env vars:', Object.keys(process.env));
  console.log('ANTHROPIC_API_KEY exists?', !!process.env.ANTHROPIC_API_KEY);
  
  // Try multiple ways to get the API key
  const API_KEY = process.env.ANTHROPIC_API_KEY || 
                  process.env.anthropic_api_key || 
                  "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";
  
  if (!API_KEY) {
    console.error('No API key found in environment variables');
    return res.status(500).json({ 
      error: 'API key not configured',
      details: 'Please set ANTHROPIC_API_KEY in Vercel environment variables'
    });
  }

  console.log('API Key found, first 10 chars:', API_KEY.substring(0, 10) + '...');

  const styleNote = writing ? `\n\nThe student's writing style (match this EXACTLY): "${writing}"` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `You are an expert AP exam question predictor. Analyze these materials and predict the 10 most likely exam questions.

MATERIALS:
${syllabus}
${styleNote}

Return ONLY valid JSON in this exact format:
{"questions":[{"num":1,"question":"question text","confidence":85,"topic":"topic"}],"answer":"model answer"}

Generate 10 questions. Return ONLY the JSON.`
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API response not OK:', response.status, errorText);
      return res.status(500).json({ error: `API Error: ${response.status} - ${errorText}` });
    }

    const claude = await response.json();
    
    if (claude.error) {
      return res.status(500).json({ error: `Anthropic Error: ${claude.error.message}` });
    }

    let text = claude.content[0].text.trim();
    let cleaned = text.replace(/```json\s*|\```\s*/g, '');
    
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);
    
    // Ensure we have questions array
    if (!parsed.questions) {
      parsed.questions = [];
    }
    
    return res.status(200).json(parsed);

  } catch(e) {
    console.error('Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
