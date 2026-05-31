export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  // Return detailed error if no API key
  if (!API_KEY) {
    return res.status(200).json({
      error: 'API_KEY_MISSING',
      message: 'Add ANTHROPIC_API_KEY to Vercel environment variables',
      questions: getFallbackQuestions(syllabus),
      answer: "API key not configured. Please add your Anthropic API key to Vercel environment variables."
    });
  }

  const styleNote = writing ? `\n\nMatch this writing style: "${writing}"` : '';

  try {
    console.log('Attempting API call with key starting with:', API_KEY.substring(0, 15));
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Generate 10 AP exam questions based on this syllabus.

Syllabus: ${syllabus}${styleNote}

Return ONLY valid JSON. No markdown, no backticks.

Format: {"questions":[{"num":1,"question":"specific question","confidence":85,"topic":"topic"}],"answer":"4-5 sentence answer"}`
        }]
      })
    });

    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (!response.ok) {
      console.error('API Error Details:', JSON.stringify(data, null, 2));
      return res.status(200).json({
        error: `API_ERROR: ${data.error?.message || 'Unknown error'}`,
        questions: getFallbackQuestions(syllabus),
        answer: `API Error: ${data.error?.message || 'Check Vercel logs for details'}. Using fallback questions.`
      });
    }

    let text = data.content[0].text;
    console.log('Raw response:', text);
    
    // Clean the response
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      console.error('No JSON found');
      return res.status(200).json({
        error: 'NO_JSON_FOUND',
        questions: getFallbackQuestions(syllabus),
        answer: "Could not parse API response. Using fallback questions."
      });
    }
    
    const jsonStr = cleaned.substring(start, end + 1);
    let result;
    
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      return res.status(200).json({
        error: 'JSON_PARSE_ERROR',
        questions: getFallbackQuestions(syllabus),
        answer: "Error parsing API response. Using fallback questions."
      });
    }
    
    // Ensure proper structure
    if (!result.questions || !Array.isArray(result.questions)) {
      result.questions = getFallbackQuestions(syllabus);
    }
    
    while (result.questions.length < 10) {
      result.questions.push({
        num: result.questions.length + 1,
        question: `Explain: ${syllabus.substring(0, 100)}`,
        confidence: 75,
        topic: "Course Content"
      });
    }
    
    result.questions = result.questions.slice(0, 10).map((q, i) => ({
      num: i + 1,
      question: q.question || `Question ${i + 1}`,
      confidence: Number(q.confidence) || 75,
      topic: q.topic || "Key Concept"
    }));
    
    result.answer = result.answer || "Based on your syllabus, focus on understanding the core concepts and how they connect.";
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(200).json({
      error: error.message,
      questions: getFallbackQuestions(syllabus),
      answer: `Server error: ${error.message}. Using fallback questions.`
    });
  }
}

function getFallbackQuestions(syllabus) {
  // Extract actual topics from syllabus
  const topics = extractRealTopics(syllabus);
  
  return topics.map((topic, i) => ({
    num: i + 1,
    question: generateQuestionFromTopic(topic, syllabus),
    confidence: 75 + Math.floor(Math.random() * 15),
    topic: topic
  }));
}

function extractRealTopics(syllabus) {
  const topics = [];
  const lines = syllabus.split(/\n/);
  
  for (const line of lines) {
    // Look for bullet points or numbered items
    if (line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/)) {
      const topic = line.replace(/^[-•*\d.]+\s*/, '').substring(0, 50);
      if (topic.length > 5 && topics.length < 10) {
        topics.push(topic);
      }
    }
    // Look for capitalized phrases
    else {
      const matches = line.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
      if (matches) {
        for (const match of matches) {
          if (match.length > 5 && match.length < 40 && topics.length < 10) {
            if (!topics.includes(match)) {
              topics.push(match);
            }
          }
        }
      }
    }
  }
  
  // If no topics found, use default based on keywords
  if (topics.length === 0) {
    if (syllabus.toLowerCase().includes('psych')) {
      return ["Behaviorism", "Cognitive Psychology", "Neuroscience", "Developmental Psychology", "Social Psychology", "Clinical Psychology", "Research Methods", "Sensation and Perception", "Learning and Memory", "Motivation and Emotion"];
    } else if (syllabus.toLowerCase().includes('chem')) {
      return ["Atomic Structure", "Chemical Bonding", "Stoichiometry", "Thermodynamics", "Kinetics", "Equilibrium", "Acids and Bases", "Electrochemistry", "Organic Chemistry", "Lab Techniques"];
    } else if (syllabus.toLowerCase().includes('history')) {
      return ["Colonial Era", "Revolution", "Constitution", "Civil War", "Industrialization", "World Wars", "Cold War", "Civil Rights", "Modern America", "Foreign Policy"];
    } else {
      return ["Core Concepts", "Key Principles", "Important Theories", "Major Findings", "Critical Analysis", "Application Methods", "Research Evidence", "Practical Implications", "Theoretical Frameworks", "Contemporary Understanding"];
    }
  }
  
  return topics.slice(0, 10);
}

function generateQuestionFromTopic(topic, syllabus) {
  const questionStems = [
    `Explain the key principles of ${topic} and why they matter.`,
    `How does ${topic} relate to other concepts in this course?`,
    `What evidence supports our current understanding of ${topic}?`,
    `Analyze the strengths and limitations of different approaches to ${topic}.`,
    `How would you apply ${topic} to a real-world scenario?`,
    `Compare and contrast different perspectives on ${topic}.`,
    `What would happen if a key component of ${topic} failed?`,
    `Evaluate the most important findings related to ${topic}.`,
    `Create a framework for understanding ${topic}.`,
    `Justify the importance of studying ${topic} in this course.`
  ];
  
  return questionStems[Math.floor(Math.random() * questionStems.length)];
}
