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
    return res.status(500).json({ error: 'API key not configured' });
  }

  const styleNote = writing ? `\n\nIMPORTANT - Write the answer in THIS EXACT voice and style: "${writing}"` : '';

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
        temperature: 0.3,
        system: "You are a JSON generator. You will ONLY output valid JSON. No explanations, no markdown, no text outside the JSON structure.",
        messages: [{
          role: 'user',
          content: `Generate 10 AP exam questions based on this syllabus.

Syllabus: ${syllabus}
${styleNote}

OUTPUT ONLY VALID JSON IN THIS EXACT FORMAT (no other text, no backticks, no markdown):

{
  "questions": [
    {"num": 1, "question": "Write the first exam question here", "confidence": 85, "topic": "Specific topic name"},
    {"num": 2, "question": "Write the second exam question here", "confidence": 78, "topic": "Specific topic name"},
    {"num": 3, "question": "Write the third exam question here", "confidence": 82, "topic": "Specific topic name"},
    {"num": 4, "question": "Write the fourth exam question here", "confidence": 70, "topic": "Specific topic name"},
    {"num": 5, "question": "Write the fifth exam question here", "confidence": 88, "topic": "Specific topic name"},
    {"num": 6, "question": "Write the sixth exam question here", "confidence": 75, "topic": "Specific topic name"},
    {"num": 7, "question": "Write the seventh exam question here", "confidence": 80, "topic": "Specific topic name"},
    {"num": 8, "question": "Write the eighth exam question here", "confidence": 72, "topic": "Specific topic name"},
    {"num": 9, "question": "Write the ninth exam question here", "confidence": 77, "topic": "Specific topic name"},
    {"num": 10, "question": "Write the tenth exam question here", "confidence": 83, "topic": "Specific topic name"}
  ],
  "answer": "Write a 4-5 sentence model answer to question #1 here, matching the student's voice if provided"
}`
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      return res.status(500).json({ error: `API Error: ${response.status}` });
    }

    const claude = await response.json();
    let rawText = claude.content[0].text;
    
    console.log('Raw response length:', rawText.length);
    console.log('First 200 chars:', rawText.substring(0, 200));
    
    // Aggressive cleaning - remove ANYTHING that's not JSON
    let cleaned = rawText.trim();
    
    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    
    // Find the first { and last }
    let start = cleaned.indexOf('{');
    let end = cleaned.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      console.error('No JSON object found in response');
      console.error('Full response:', rawText);
      return res.status(500).json({ 
        error: 'Invalid response format',
        raw: rawText.substring(0, 500)
      });
    }
    
    let jsonStr = cleaned.substring(start, end + 1);
    
    // Try to parse
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (firstError) {
      console.error('First parse failed:', firstError.message);
      
      // Try to fix common issues
      let fixed = jsonStr;
      
      // Fix trailing commas
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix missing quotes around property names
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
      
      // Fix unquoted strings
      fixed = fixed.replace(/:\s*([^"{\[][^,\]}]*[^,\]\s])/g, function(match) {
        return match.replace(/:(.+)/, function(m, str) {
          return ':"' + str.trim() + '"';
        });
      });
      
      try {
        parsed = JSON.parse(fixed);
      } catch (secondError) {
        console.error('Second parse failed:', secondError.message);
        console.error('Failed JSON string:', jsonStr.substring(0, 500));
        
        // Last resort: create a default response
        return res.status(200).json({
          questions: generateDefaultQuestions(syllabus),
          answer: "Based on your syllabus, focus on understanding the key processes and mechanisms. Make sure you can explain how different components interact and what happens when pathways are disrupted."
        });
      }
    }
    
    // Validate and ensure proper structure
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      parsed.questions = [];
    }
    
    // Ensure we have exactly 10 questions
    while (parsed.questions.length < 10) {
      parsed.questions.push({
        num: parsed.questions.length + 1,
        question: `Explain the key concepts from ${syllabus.substring(0, 50)}...`,
        confidence: 70 + Math.floor(Math.random() * 15),
        topic: "Key Concepts"
      });
    }
    
    // Fix question numbers and ensure all fields exist
    parsed.questions = parsed.questions.slice(0, 10).map((q, idx) => ({
      num: idx + 1,
      question: q.question || q.text || `Question ${idx + 1}`,
      confidence: typeof q.confidence === 'number' ? q.confidence : (parseInt(q.confidence) || 75),
      topic: q.topic || q.subject || "Course Content"
    }));
    
    // Ensure answer exists
    if (!parsed.answer || typeof parsed.answer !== 'string') {
      parsed.answer = parsed.answer_1 || parsed.model_answer || "Consider how the different components interact and what happens when normal processes are disrupted.";
    }
    
    return res.status(200).json(parsed);
    
  } catch (error) {
    console.error('Fatal error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      questions: generateDefaultQuestions(syllabus),
      answer: "Please try again with more specific syllabus content."
    });
  }
}

// Fallback function to generate default questions
function generateDefaultQuestions(syllabus) {
  const topics = extractTopics(syllabus);
  const questions = [];
  
  for (let i = 1; i <= 10; i++) {
    const topic = topics[i % topics.length] || "Course material";
    questions.push({
      num: i,
      question: `Explain the key mechanisms and processes involved in ${topic}. Include specific details about how these processes are regulated and what happens when they malfunction.`,
      confidence: 70 + Math.floor(Math.random() * 20),
      topic: topic
    });
  }
  
  return questions;
}

function extractTopics(syllabus) {
  const commonTopics = [
    "Signal transduction pathways",
    "Cellular communication",
    "Feedback mechanisms",
    "Cell cycle regulation",
    "Metabolic pathways",
    "Gene expression",
    "Protein synthesis",
    "Membrane transport",
    "Energy conversion",
    "Molecular interactions"
  ];
  
  // Try to extract topics from syllabus
  const words = syllabus.toLowerCase().split(/\s+/);
  const foundTopics = [];
  
  commonTopics.forEach(topic => {
    const topicLower = topic.toLowerCase();
    if (syllabus.toLowerCase().includes(topicLower)) {
      foundTopics.push(topic);
    }
  });
  
  return foundTopics.length > 0 ? foundTopics : commonTopics;
}
