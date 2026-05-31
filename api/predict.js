export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  // Get API key from environment variable
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const styleNote = writing ? `\n\nWrite the answer in this exact style: "${writing}"` : '';

  try {
    // Correct Anthropic API endpoint
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',  // Changed to a more stable model
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: `You are an AP exam question predictor. Based on this syllabus, generate 10 likely exam questions.

Syllabus: ${syllabus}
${styleNote}

Return ONLY valid JSON in this exact format (no other text, no markdown, no backticks):

{
  "questions": [
    {"num": 1, "question": "question text here", "confidence": 85, "topic": "topic name"},
    {"num": 2, "question": "question text here", "confidence": 78, "topic": "topic name"}
  ],
  "answer": "4-5 sentence model answer to question #1"
}

Generate 10 questions total. Return ONLY the JSON object.`
          }
        ]
      })
    });

    // Log response status for debugging
    console.log('Anthropic response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Anthropic API error: ${response.status}`,
        details: errorText
      });
    }

    const claude = await response.json();
    
    if (!claude.content || !claude.content[0]) {
      console.error('Unexpected response structure:', claude);
      return res.status(500).json({ error: 'Invalid response from Anthropic' });
    }

    let text = claude.content[0].text;
    console.log('Claude response preview:', text.substring(0, 200));
    
    // Extract JSON from response
    let jsonStr = text;
    
    // Remove markdown code blocks
    jsonStr = jsonStr.replace(/```json\s*/g, '');
    jsonStr = jsonStr.replace(/```\s*/g, '');
    
    // Find the JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', text);
      // Return fallback response
      return res.status(200).json(generateFallbackResponse(syllabus));
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      console.error('Failed string:', jsonMatch[0]);
      return res.status(200).json(generateFallbackResponse(syllabus));
    }
    
    // Ensure we have valid data
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      parsed.questions = [];
    }
    
    // Ensure we have 10 questions
    while (parsed.questions.length < 10) {
      parsed.questions.push({
        num: parsed.questions.length + 1,
        question: `Explain the key concepts from your ${parsed.questions.length === 0 ? 'syllabus' : 'materials'}.`,
        confidence: 75,
        topic: 'Key Concepts'
      });
    }
    
    // Clean up questions
    parsed.questions = parsed.questions.slice(0, 10).map((q, i) => ({
      num: i + 1,
      question: q.question || `Question ${i + 1}`,
      confidence: typeof q.confidence === 'number' ? q.confidence : 75,
      topic: q.topic || 'Course Material'
    }));
    
    // Ensure answer exists
    if (!parsed.answer) {
      parsed.answer = 'Based on the syllabus, focus on understanding the main mechanisms and how they relate to each other. Be prepared to explain both normal function and what happens when processes are disrupted.';
    }
    
    return res.status(200).json(parsed);
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(200).json(generateFallbackResponse(syllabus));
  }
}

function generateFallbackResponse(syllabus) {
  const topics = extractTopics(syllabus);
  const questions = [];
  
  for (let i = 1; i <= 10; i++) {
    questions.push({
      num: i,
      question: `Explain the key processes in ${topics[(i - 1) % topics.length]} and how they are regulated.`,
      confidence: 70 + Math.floor(Math.random() * 20),
      topic: topics[(i - 1) % topics.length]
    });
  }
  
  return {
    questions: questions,
    answer: 'Based on your materials, focus on understanding the core mechanisms, how they are controlled, and what happens when normal function is disrupted. Make sure you can explain cause-and-effect relationships between different components.'
  };
}

function extractTopics(syllabus) {
  const commonTopics = [
    'Cell Communication',
    'Signal Transduction', 
    'Feedback Mechanisms',
    'Cell Cycle',
    'Gene Expression',
    'Metabolic Pathways',
    'Energy Transfer',
    'Membrane Transport',
    'Protein Structure',
    'Enzyme Function'
  ];
  
  // Try to find topics mentioned in syllabus
  const foundTopics = [];
  for (const topic of commonTopics) {
    if (syllabus.toLowerCase().includes(topic.toLowerCase())) {
      foundTopics.push(topic);
    }
  }
  
  return foundTopics.length > 0 ? foundTopics : commonTopics;
}      headers: {
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
