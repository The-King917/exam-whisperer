export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Validate input parameters
  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  // 3. HARD FAIL CHECK: Verify if Vercel is actually providing your environment variable
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ 
      error: "Vercel Environment Error: 'ANTHROPIC_API_KEY' is missing or undefined in your Vercel project settings." 
    });
  }

  const styleNote = writing ? `\n\nStudent writing style to match exactly: "${writing}"` : '';

  try {
    // 4. Send request to Anthropic Messages API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), // Strips any accidental whitespace from Vercel dashboard copy-paste
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620', // Fixed from invalid 'claude-opus-4-5'
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are an expert AP exam analyst. Analyze these materials and predict exam questions:\n\n${syllabus}${styleNote}\n\nRespond ONLY with valid JSON, no markdown, no backticks, no extra text:\n{"questions":[{"num":1,"question":"question text","confidence":91,"topic":"topic name"},{"num":2,"question":"question text","confidence":78,"topic":"topic name"}],"answer":"full model answer to question 1 in the student's exact voice, 4-5 sentences"}`
        }]
      })
    });

    const claude = await response.json();

    // 5. Catch API-level errors (like invalid tokens) before trying to process response text
    if (claude.error) {
      return res.status(500).json({ error: `Anthropic API Error: ${claude.error.message}` });
    }

    if (!claude.content || !claude.content[0] || !claude.content[0].text) {
      return res.status(500).json({ error: 'Unexpected response format received from Anthropic.' });
    }

    // 6. Clean and parse JSON data
    const text = claude.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: 'Could not extract valid JSON layout from model response.' });
    }

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);

  } catch(e) {
    // Catch any network execution errors
    return res.status(500).json({ error: `Server exception: ${e.message}` });
  }
}
