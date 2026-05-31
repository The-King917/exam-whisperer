export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!API_KEY) {
    console.error('API key missing');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const styleNote = writing ? `\n\nWrite the answer in this style: "${writing}"` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `Generate 10 AP exam questions based on this syllabus.

Syllabus: ${syllabus}${styleNote}

Return ONLY valid JSON. No markdown, no backticks, no extra text.

Example format for AP Biology:
{"questions":[{"num":1,"question":"Explain how signal transduction pathways regulate cellular responses.","confidence":85,"topic":"Cell Communication"},{"num":2,"question":"Compare and contrast mitosis and meiosis.","confidence":90,"topic":"Cell Division"}],"answer":"Signal transduction pathways convert extracellular signals into cellular responses through a series of molecular interactions..."}

Now generate questions based on the ACTUAL syllabus above. Use SPECIFIC terms from the syllabus.`
        }]
      })
    });

    const data = await response.json();
    
    console.log('API Response status:', response.status);
    
    if (!response.ok) {
      console.error('API Error:', data);
      // Instead of fallback, return error so we can see what's wrong
      return res.status(500).json({ error: `API Error: ${JSON.stringify(data)}` });
    }

    let text = data.content[0].text;
    console.log('Raw response:', text);
    
    // Clean the response
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    
    // Find JSON object
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      console.error('No JSON found in:', cleaned);
      return res.status(500).json({ error: 'No JSON in response', raw: cleaned });
    }
    
    const jsonStr = cleaned.substring(start, end + 1);
    let result;
    
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      console.error('Failed string:', jsonStr);
      return res.status(500).json({ error: 'Invalid JSON', raw: jsonStr });
    }
    
    // Validate structure
    if (!result.questions || !Array.isArray(result.questions)) {
      result.questions = [];
    }
    
    // Ensure 10 questions
    while (result.questions.length < 10) {
      result.questions.push({
        num: result.questions.length + 1,
        question: `Analyze the key concepts from your syllabus.`,
        confidence: 75,
        topic: "Course Content"
      });
    }
    
    // Clean up each question
    result.questions = result.questions.slice(0, 10).map((q, i) => ({
      num: i + 1,
      question: q.question || `Question ${i + 1}`,
      confidence: typeof q.confidence === 'number' ? q.confidence : 75,
      topic: q.topic || "Key Concept"
    }));
    
    result.answer = result.answer || "Based on your syllabus, focus on understanding the core concepts and how they connect to each other.";
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
}
