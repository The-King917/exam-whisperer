export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { syllabus, writing } = req.body;
  if (!syllabus) return res.status(400).json({ error: 'No syllabus provided' });

  // Paste your actual API key here if bypassing Vercel environment configurations
  const API_KEY = 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; 

  const styleNote = writing ? `\n\nStudent writing style to match exactly: "${writing}"` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2000,
        // System prompt instructs Claude explicitly to avoid conversational filler
        system: "You are an expert AP exam analyst. You must respond ONLY with raw, valid JSON. Never include markdown formatting, markdown code blocks, backticks, or introductory text.",
        messages: [{
          role: 'user',
          content: `Analyze these materials and predict exam questions:\n\n${syllabus}${styleNote}\n\nReturn this exact JSON structure and nothing else:\n{"questions":[{"num":1,"question":"question text","confidence":91,"topic":"topic name"},{"num":2,"question":"question text","confidence":78,"topic":"topic name"}],"answer":"full model answer to question 1 in the student's exact voice, 4-5 sentences"}`
        }]
      })
    });

    const claude = await response.json();
    
    if (claude.error) {
      return res.status(500).json({ error: `Anthropic API Error: ${claude.error.message}` });
    }

    let text = claude.content[0].text.trim();

    // BULLETPROOF CLEANING: Strip away markdown backticks if Claude added them anyway
    if (text.startsWith("```")) {
      text = text.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    }

    // Parse the JSON string directly on the backend to guarantee validity
    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);

  } catch(e) {
    return res.status(500).json({ error: `Backend Processing Error: ${e.message}` });
  }
}
