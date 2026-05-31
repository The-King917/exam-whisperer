export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { syllabus, writing } = req.body;
  if (!syllabus) return res.status(400).json({ error: 'No syllabus provided' });

  // Get API key from environment variable
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  // Check if key exists
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error: API key missing' });
  }

  const styleNote = writing ? `\n\nThe student's writing style (match this EXACTLY in vocabulary, sentence structure, and tone): "${writing}"` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,  // Make sure this is a string, no extra spaces
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `You are an expert AP exam question predictor. Analyze these materials and predict the 10 most likely exam questions.

SYLLABUS/MATERIALS:
${syllabus}
${styleNote}

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON - no other text, no explanations, no markdown
2. The JSON must match this EXACT structure:
{
  "questions": [
    {"num": 1, "question": "Full exam question text here", "confidence": 85, "topic": "topic name"},
    {"num": 2, "question": "Another exam question", "confidence": 72, "topic": "different topic"}
  ],
  "answer": "A complete 4-5 sentence model answer to question #1, written in the student's exact voice and style"
}

3. Generate 10 questions total (num 1 through 10)
4. Confidence scores should be integers between 60-95
5. Topics should be specific
6. The answer must match the student's writing style if provided

Return ONLY the JSON object, nothing else.`
        }]
      })
    });

    const claude = await response.json();
    
    if (claude.error) {
      console.error('Anthropic API Error:', claude.error);
      return res.status(500).json({ error: `Anthropic API Error: ${claude.error.message || JSON.stringify(claude.error)}` });
    }

    if (!claude.content || !claude.content[0]) {
      console.error('Unexpected Claude response:', claude);
      return res.status(500).json({ error: 'Invalid response from Anthropic API' });
    }

    let text = claude.content[0].text.trim();
    console.log('Raw response from Claude:', text.substring(0, 200));

    // Multiple cleaning strategies
    let cleaned = text;
    
    cleaned = cleaned.replace(/```json\s*/g, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) {
      cleaned = cleaned.substring(firstBrace);
    }
    
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace < cleaned.length - 1) {
      cleaned = cleaned.substring(0, lastBrace + 1);
    }

    // Try to parse
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('First parse attempt failed:', parseError.message);
      
      let fixed = cleaned;
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
      
      try {
        parsed = JSON.parse(fixed);
      } catch (secondError) {
        console.error('Second parse attempt failed:', secondError.message);
        return res.status(500).json({ 
          error: 'AI returned malformed JSON. Please try again.'
        });
      }
    }

    // Validate and fix the structure
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      if (parsed.questions && typeof parsed.questions === 'object') {
        parsed.questions = Object.values(parsed.questions);
      } else {
        parsed.questions = [];
      }
    }

    if (parsed.questions.length < 10) {
      while (parsed.questions.length < 10) {
        parsed.questions.push({
          num: parsed.questions.length + 1,
          question: "Additional predicted question based on your materials",
          confidence: 65,
          topic: "General topic"
        });
      }
    }

    parsed.questions = parsed.questions.slice(0, 10).map((q, idx) => ({
      num: q.num || idx + 1,
      question: q.question || q.text || "Question not available",
      confidence: typeof q.confidence === 'number' ? q.confidence : 70,
      topic: q.topic || q.subject || "Key concept"
    }));

    if (!parsed.answer || typeof parsed.answer !== 'string') {
      parsed.answer = "Based on your materials, here's a model answer. Consider key concepts like mechanisms, pathways, and regulatory processes discussed in your syllabus.";
    }

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: `Failed to generate predictions: ${e.message}` });
  }
}
