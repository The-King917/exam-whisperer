export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { syllabus, writing } = req.body;
  if (!syllabus) return res.status(400).json({ error: 'No syllabus provided' });

  // HARDCODED FALLBACK: Paste your actual "sk-ant-..." key inside the quotes below
  const BACKUP_KEY = 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;

  const styleNote = writing ? `\n\nStudent writing style to match exactly: "${writing}"` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BACKUP_KEY.trim(), // Bypasses Vercel's dashboard variables completely
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are an expert AP exam analyst. Analyze these materials and predict exam questions:\n\n${syllabus}${styleNote}\n\nRespond ONLY with valid JSON, no markdown, no backticks, no extra text:\n{"questions":[{"num":1,"question":"question text","confidence":91,"topic":"topic name"},{"num":2,"question":"question text","confidence":78,"topic":"topic name"}],"answer":"full model answer to question 1 in the student's exact voice, 4-5 sentences"}`
        }]
      })
    });

    const claude = await response.json();
    if (claude.error) return res.status(500).json({ error: `Anthropic API Error: ${claude.error.message}` });

    const text = claude.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not parse response: ' + text.substring(0, 100) });

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
