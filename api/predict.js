export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  // Read from environment variable (NEVER hardcode)
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  // Debug: Check if it exists (remove in production)
  console.log('API_KEY exists:', !!API_KEY);
  console.log('API_KEY length:', API_KEY ? API_KEY.length : 0);
  
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set in environment');
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'API key not configured. Please add ANTHROPIC_API_KEY to your environment variables.'
    });
  }

  // Optional: Validate key format
  if (!API_KEY.startsWith('sk-ant-')) {
    console.error('API_KEY has invalid format');
    return res.status(500).json({ error: 'Invalid API key format' });
  }

  const styleNote = writing ? `\n\nMatch this writing style: "${writing}"` : '';

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
        messages: [{
          role: 'user',
          content: `Generate 10 AP exam questions from this syllabus. Return ONLY JSON.

Syllabus: ${syllabus}${styleNote}

Format: {"questions":[{"num":1,"question":"text","confidence":85,"topic":"topic"}],"answer":"model answer"}`
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('API Error:', response.status, error);
      return res.status(response.status).json({ 
        error: `API Error: ${response.status}`,
        details: error
      });
    }

    const claude = await response.json();
    const text = claude.content[0].text;
    
    // Clean and parse JSON
    let cleanJson = text.replace(/```json\s*|\```\s*/g, '');
    const match = cleanJson.match(/\{[\s\S]*\}/);
    
    if (!match) {
      throw new Error('No JSON found');
    }
    
    const result = JSON.parse(match[0]);
    
    // Ensure minimum structure
    if (!result.questions) result.questions = [];
    if (!result.answer) result.answer = "No answer generated";
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
