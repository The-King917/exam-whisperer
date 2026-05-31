export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  console.log('API Key exists:', !!API_KEY);
  console.log('Syllabus length:', syllabus.length);
  
  if (!API_KEY) {
    console.log('No API key - using fallback');
    return res.status(200).json(getFallbackQuestions(syllabus, writing));
  }

  try {
    console.log('Calling Anthropic API...');
    
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
        messages: [{
          role: 'user',
          content: `Generate 10 AP exam questions from this syllabus. Return ONLY valid JSON.

Syllabus: ${syllabus.substring(0, 1500)}

Format: {"questions":[{"num":1,"question":"question","confidence":85,"topic":"topic"}],"answer":"answer"}`
        }]
      })
    });

    const data = await response.json();
    console.log('API Response status:', response.status);
    
    if (!response.ok) {
      console.log('API Error:', data);
      return res.status(200).json(getFallbackQuestions(syllabus, writing));
    }

    let text = data.content[0].text;
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.questions = (result.questions || []).slice(0, 10).map((q, i) => ({
        num: i + 1,
        question: q.question || `Question ${i + 1}`,
        confidence: q.confidence || 85,
        topic: q.topic || "Key Topic"
      }));
      result.answer = result.answer || getDefaultAnswer(syllabus);
      console.log('API success!');
      return res.status(200).json(result);
    }
  } catch (error) {
    console.log('API call error:', error.message);
  }
  
  console.log('Using fallback');
  return res.status(200).json(getFallbackQuestions(syllabus, writing));
}

function getFallbackQuestions(syllabus, writing) {
  // Extract topics from bullet points
  const topics = [];
  const lines = syllabus.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^[-•*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      let topic = trimmed.replace(/^[-•*\d.]+\s*/, '').substring(0, 50);
      if (topic.length > 3 && topics.length < 10) {
        topics.push(topic);
      }
    }
  }
  
  // If no bullet points, look for capitalized phrases
  if (topics.length === 0) {
    const words = syllabus.split(/\s+/);
    for (const word of words) {
      if (word.length > 5 && word[0] === word[0].toUpperCase() && topics.length < 10) {
        topics.push(word);
      }
    }
  }
  
  // Default topics
  while (topics.length < 10) {
    topics.push(`Concept ${topics.length + 1}`);
  }
  
  const questions = [];
  const stems = [
    (t) => `Explain the key principles of ${t} and why they matter.`,
    (t) => `How does ${t} relate to other concepts in this course?`,
    (t) => `Analyze the evidence that supports our understanding of ${t}.`,
    (t) => `Compare and contrast different approaches to ${t}.`,
    (t) => `What would happen if a key component of ${t} malfunctioned?`,
    (t) => `How would you apply ${t} to a real-world scenario?`,
    (t) => `Evaluate the strengths and limitations of current ${t} theories.`,
    (t) => `Create a detailed explanation of ${t} for a peer.`,
    (t) => `Justify the importance of studying ${t} in this course.`,
    (t) => `Predict how our understanding of ${t} might evolve in the future.`
  ];
  
  for (let i = 0; i < 10; i++) {
    questions.push({
      num: i + 1,
      question: stems[i](topics[i]),
      confidence: 80 + Math.floor(Math.random() * 15),
      topic: topics[i]
    });
  }
  
  return {
    questions: questions,
    answer: getDefaultAnswer(syllabus)
  };
}

function getDefaultAnswer(syllabus) {
  return "Based on your syllabus, focus on understanding the core concepts, how they connect to each other, and be able to apply them to new situations. Practice explaining these ideas clearly and using specific evidence from your course materials to support your answers. On the AP exam, you'll need to demonstrate both conceptual understanding and the ability to analyze scenarios using course concepts.";
}
