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

  const styleNote = writing ? `\n\nStudent's writing style to match: "${writing}"` : '';

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
        max_tokens: 1000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `Generate 10 AP exam questions from this syllabus. Return ONLY valid JSON.

Syllabus: ${syllabus}${styleNote}

Required format (example):
{"questions":[{"num":1,"question":"What is photosynthesis?","confidence":85,"topic":"Biology"}],"answer":"Photosynthesis is the process..."}

Now generate for real:`
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('API Error:', data);
      return res.status(200).json(getDefaultQuestions(syllabus, writing));
    }

    let text = data.content[0].text;
    
    // Clean the response
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return res.status(200).json(getDefaultQuestions(syllabus, writing));
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(200).json(getDefaultQuestions(syllabus, writing));
    }
    
    // Ensure proper structure
    if (!result.questions || !Array.isArray(result.questions)) {
      result.questions = [];
    }
    
    // Ensure 10 questions
    while (result.questions.length < 10) {
      result.questions.push({
        num: result.questions.length + 1,
        question: `Explain the key concepts from ${syllabus.substring(0, 50)}`,
        confidence: 75,
        topic: "Course Content"
      });
    }
    
    // Format questions properly
    result.questions = result.questions.slice(0, 10).map((q, i) => ({
      num: i + 1,
      question: q.question || `Question ${i + 1}`,
      confidence: Number(q.confidence) || 75,
      topic: q.topic || "Key Concept"
    }));
    
    result.answer = result.answer || "Based on your syllabus, focus on understanding the main mechanisms and how they connect to each other.";
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(200).json(getDefaultQuestions(syllabus, writing));
  }
}

function getDefaultQuestions(syllabus, writing) {
  const questions = [];
  const topics = ["Cell Communication", "Signal Transduction", "Feedback Loops", "Cell Cycle", "Gene Expression", "Metabolic Pathways", "Energy Transfer", "Membrane Transport", "Protein Synthesis", "Regulation"];
  
  for (let i = 1; i <= 10; i++) {
    questions.push({
      num: i,
      question: `Describe the process of ${topics[i-1]} and explain its importance in cellular function.`,
      confidence: 70 + Math.floor(Math.random() * 20),
      topic: topics[i-1]
    });
  }
  
  let answer = "Based on your materials, focus on understanding the key mechanisms, how they're regulated, and what happens when normal processes are disrupted. Be prepared to explain cause-and-effect relationships.";
  
  if (writing) {
    answer = writing + " " + answer;
  }
  
  return { questions, answer };
}
