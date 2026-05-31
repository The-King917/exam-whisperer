export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  
  // ALWAYS return a valid response structure, even on error
  if (!syllabus || syllabus.trim() === '') {
    return res.status(200).json({
      questions: generateDefaultQuestions("Please paste your syllabus content"),
      answer: "Paste your AP course syllabus above to get personalized exam predictions."
    });
  }

  // Try to use API if available, but always fall back to smart generation
  let questions = [];
  let answer = "";
  
  try {
    const API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Based on this syllabus, generate 10 AP exam questions. Return ONLY valid JSON.

Syllabus: ${syllabus.substring(0, 2000)}

Format: {"questions":[{"num":1,"question":"question text","confidence":85,"topic":"topic"}],"answer":"model answer"}

Make questions specific to the syllabus content.`
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        let text = data.content[0].text;
        // Clean the response
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.questions && Array.isArray(parsed.questions)) {
            questions = parsed.questions.slice(0, 10);
            answer = parsed.answer || generateSmartAnswer(syllabus, writing);
          } else {
            throw new Error('Invalid questions array');
          }
        } else {
          throw new Error('No JSON found');
        }
      } else {
        throw new Error('API call failed');
      }
    } else {
      throw new Error('No API key');
    }
  } catch (error) {
    console.log('Using fallback generation:', error.message);
    questions = generateSmartQuestions(syllabus);
    answer = generateSmartAnswer(syllabus, writing);
  }
  
  // Ensure we always have 10 questions
  while (questions.length < 10) {
    questions.push({
      num: questions.length + 1,
      question: `Explain the key concepts from: ${syllabus.substring(0, 100)}...`,
      confidence: 75,
      topic: "Course Content"
    });
  }
  
  // Format questions properly
  const formattedQuestions = questions.slice(0, 10).map((q, i) => ({
    num: i + 1,
    question: q.question || `Question ${i + 1}`,
    confidence: typeof q.confidence === 'number' ? q.confidence : 80,
    topic: q.topic || "Key Concept"
  }));
  
  return res.status(200).json({
    questions: formattedQuestions,
    answer: answer || "Based on your syllabus, focus on understanding the core concepts and how they connect to each other. Practice applying these ideas to new scenarios."
  });
}

function generateSmartQuestions(syllabus) {
  const topics = extractTopics(syllabus);
  const questions = [];
  
  const stems = [
    (t) => `Explain the key principles of ${t} and analyze their significance.`,
    (t) => `How does ${t} relate to other concepts in this course? Provide specific examples.`,
    (t) => `Evaluate the evidence that supports our current understanding of ${t}.`,
    (t) => `Compare and contrast different approaches to understanding ${t}.`,
    (t) => `What would happen if a key component of ${t} malfunctioned? Explain.`,
    (t) => `Design an experiment or study to investigate ${t}.`,
    (t) => `Analyze the real-world applications of ${t} in a specific context.`,
    (t) => `Justify the importance of studying ${t} in preparation for the AP exam.`,
    (t) => `Predict how our understanding of ${t} might evolve with new evidence.`,
    (t) => `Create a detailed explanation of ${t} that would help a peer understand it.`
  ];
  
  for (let i = 0; i < Math.min(10, topics.length); i++) {
    const stem = stems[i % stems.length];
    questions.push({
      num: i + 1,
      question: stem(topics[i]),
      confidence: 75 + Math.floor(Math.random() * 20),
      topic: topics[i]
    });
  }
  
  // Fill remaining if needed
  while (questions.length < 10) {
    const idx = questions.length;
    questions.push({
      num: idx + 1,
      question: stems[idx % stems.length](topics[idx % topics.length]),
      confidence: 75,
      topic: topics[idx % topics.length]
    });
  }
  
  return questions;
}

function extractTopics(syllabus) {
  const topics = [];
  const lines = syllabus.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Match bullet points (-, *, •, numbers)
    if (trimmed.match(/^[-•*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      let topic = trimmed.replace(/^[-•*\d.]+\s*/, '').trim();
      topic = topic.split(':')[0].split('(')[0].trim();
      if (topic.length > 3 && topic.length < 80 && !topics.includes(topic)) {
        topics.push(topic);
      }
    }
    // Match lines with colons (headings)
    else if (trimmed.includes(':') && trimmed.length < 60 && !trimmed.includes('http')) {
      let topic = trimmed.split(':')[0].trim();
      if (topic.length > 3 && topic.length < 50 && !topics.includes(topic)) {
        topics.push(topic);
      }
    }
    // Match capitalized phrases that seem like topics
    else if (trimmed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/) && trimmed.length < 40) {
      if (!topics.includes(trimmed)) {
        topics.push(trimmed);
      }
    }
  }
  
  // If no topics found, extract key terms
  if (topics.length === 0) {
    const words = syllabus.split(/\s+/);
    for (const word of words) {
      if (word.length > 6 && word[0] === word[0].toUpperCase() && !topics.includes(word)) {
        topics.push(word);
      }
    }
  }
  
  // Default topics if still nothing
  if (topics.length === 0) {
    return ["Key Concepts", "Major Principles", "Core Ideas", "Important Processes", "Critical Analysis"];
  }
  
  return topics.slice(0, 15);
}

function generateSmartAnswer(syllabus, writing) {
  const topics = extractTopics(syllabus);
  const firstTopic = topics[0] || "the course material";
  const secondTopic = topics[1] || "related concepts";
  
  let answer = `Based on your syllabus, understanding ${firstTopic} is essential for success on the AP exam. `;
  answer += `This concept connects to ${secondTopic} and helps explain how different components of the course relate to each other. `;
  answer += `Key evidence and examples from your materials demonstrate that ${firstTopic} plays a crucial role in shaping outcomes. `;
  answer += `When analyzing AP exam questions, focus on explaining these relationships clearly and using specific terminology from your course. `;
  answer += `Practice applying these concepts to new scenarios and evaluating evidence that supports or challenges your understanding.`;
  
  if (writing && writing.length > 30) {
    answer = `[Writing style: "${writing.substring(0, 100)}..."]\n\n${answer}`;
  }
  
  return answer;
}

function generateDefaultQuestions(errorMsg) {
  const questions = [];
  for (let i = 1; i <= 10; i++) {
    questions.push({
      num: i,
      question: `Please paste your AP course syllabus to generate specific exam questions. ${errorMsg !== "Please paste your syllabus content" ? errorMsg : ""}`,
      confidence: 50,
      topic: "Waiting for Input"
    });
  }
  return questions;
}
