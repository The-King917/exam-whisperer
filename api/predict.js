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
    return res.status(200).json({
      questions: getSmartQuestions(syllabus),
      answer: "API key not configured. Please add your Anthropic API key to Vercel environment variables."
    });
  }

  const styleNote = writing ? `\n\nMatch this writing style: "${writing}"` : '';

  // TRY THESE MODEL NAMES - ONE WILL WORK:
  const modelsToTry = [
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307', 
    'claude-3-opus-20240229',
    'claude-2.1',
    'claude-2.0'
  ];
  
  let lastError = null;
  
  for (const model of modelsToTry) {
    try {
      console.log(`Trying model: ${model}`);
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Generate 10 specific AP exam questions from this syllabus.

Syllabus: ${syllabus}${styleNote}

Return ONLY valid JSON. No markdown, no backticks.

Example:
{"questions":[{"num":1,"question":"Analyze the causes of the American Revolution","confidence":88,"topic":"Revolution"}],"answer":"The American Revolution was caused by..."}

Now generate questions based on the ACTUAL syllabus above. Use SPECIFIC terms from the syllabus.`
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        let text = data.content[0].text;
        
        // Clean and parse JSON
        text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          result.questions = (result.questions || []).slice(0, 10).map((q, i) => ({
            num: i + 1,
            question: q.question || `Question ${i + 1}`,
            confidence: q.confidence || 80,
            topic: q.topic || "Key Topic"
          }));
          result.answer = result.answer || "Based on your syllabus, focus on understanding cause-effect relationships and comparing different perspectives.";
          
          console.log(`Success with model: ${model}`);
          return res.status(200).json(result);
        }
      } else {
        const error = await response.json();
        console.log(`Model ${model} failed:`, error.error?.message);
        lastError = error.error?.message;
      }
    } catch (e) {
      console.log(`Model ${model} error:`, e.message);
      lastError = e.message;
    }
  }
  
  // If all models fail, return smart fallback questions
  console.log('All models failed. Last error:', lastError);
  return res.status(200).json({
    questions: getSmartQuestions(syllabus),
    answer: `Using enhanced questions based on your syllabus. (Note: API error: ${lastError || 'Unknown'})`
  });
}

function getSmartQuestions(syllabus) {
  const text = syllabus.toLowerCase();
  let subject = "general";
  
  // Detect subject
  if (text.includes('psych')) subject = "psychology";
  else if (text.includes('history') || text.includes('revolution') || text.includes('war') || text.includes('colony')) subject = "history";
  else if (text.includes('chem')) subject = "chemistry";
  else if (text.includes('bio') || text.includes('cell') || text.includes('dna')) subject = "biology";
  else if (text.includes('physic')) subject = "physics";
  else if (text.includes('calc')) subject = "calculus";
  else if (text.includes('english') || text.includes('literature')) subject = "english";
  else if (text.includes('gov') || text.includes('politics')) subject = "government";
  
  // Extract key topics from syllabus
  const topics = extractTopicsFromSyllabus(syllabus);
  
  const questions = [];
  const questionTemplates = getTemplatesForSubject(subject);
  
  for (let i = 0; i < Math.min(10, topics.length); i++) {
    const template = questionTemplates[i % questionTemplates.length];
    questions.push({
      num: i + 1,
      question: template.replace('{topic}', topics[i]),
      confidence: 80 + Math.floor(Math.random() * 15),
      topic: topics[i]
    });
  }
  
  // Fill remaining with custom questions
  while (questions.length < 10) {
    questions.push({
      num: questions.length + 1,
      question: `Analyze the key concepts from ${topics[questions.length % topics.length] || 'your syllabus'}.`,
      confidence: 78,
      topic: topics[questions.length % topics.length] || "Core Concepts"
    });
  }
  
  return questions;
}

function extractTopicsFromSyllabus(syllabus) {
  const topics = [];
  const lines = syllabus.split(/\n/);
  
  for (const line of lines) {
    // Match bullet points
    if (line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/)) {
      let topic = line.replace(/^[-•*\d.]+\s*/, '').trim();
      if (topic.length > 3 && topic.length < 100 && topics.length < 15) {
        topics.push(topic);
      }
    }
    // Match capitalized phrases
    else {
      const matches = line.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
      if (matches) {
        for (const match of matches) {
          if (match.length > 5 && match.length < 50 && topics.length < 15) {
            if (!topics.includes(match)) {
              topics.push(match);
            }
          }
        }
      }
    }
  }
  
  // Default topics if none found
  if (topics.length === 0) {
    const words = syllabus.split(/\s+/);
    for (const word of words) {
      if (word.length > 6 && !topics.includes(word) && topics.length < 15) {
        topics.push(word);
      }
    }
  }
  
  return topics.length > 0 ? topics : ["Core Concepts", "Key Principles", "Major Theories", "Important Findings", "Critical Analysis", "Application Methods", "Research Methods", "Historical Context", "Contemporary Issues", "Future Directions"];
}

function getTemplatesForSubject(subject) {
  const templates = {
    history: [
      "Analyze the causes and consequences of {topic}.",
      "Compare and contrast different perspectives on {topic}.",
      "Evaluate the significance of {topic} in its historical context.",
      "Explain how {topic} influenced subsequent events.",
      "What were the major debates surrounding {topic}?",
      "How did {topic} change over time?",
      "Assess the impact of {topic} on different groups of people.",
      "What evidence do historians use to understand {topic}?",
      "Connect {topic} to broader historical themes.",
      "Why was {topic} controversial at the time?"
    ],
    psychology: [
      "Explain the key findings of {topic} and their implications.",
      "How does {topic} influence human behavior?",
      "Compare different theoretical approaches to {topic}.",
      "What research methods are used to study {topic}?",
      "Evaluate the strengths and limitations of {topic}.",
      "How would you apply {topic} to a real-world situation?",
      "What ethical considerations relate to {topic}?",
      "Describe the neural mechanisms underlying {topic}.",
      "How does {topic} develop across the lifespan?",
      "What treatments or interventions relate to {topic}?"
    ],
    chemistry: [
      "Explain the principles of {topic} with specific examples.",
      "Calculate and interpret results related to {topic}.",
      "Describe the experimental evidence for {topic}.",
      "How does {topic} apply to real-world scenarios?",
      "Compare and contrast different models of {topic}.",
      "What happens when conditions change in {topic}?",
      "Predict the outcome of reactions involving {topic}.",
      "Justify the importance of {topic} in chemical systems.",
      "Analyze the limitations of current understanding of {topic}.",
      "Design an experiment to investigate {topic}."
    ],
    biology: [
      "Explain the mechanism of {topic} at the cellular level.",
      "How does {topic} contribute to homeostasis?",
      "Describe the evolutionary significance of {topic}.",
      "What happens when {topic} malfunctions?",
      "Compare {topic} across different organisms.",
      "Analyze the experimental evidence for {topic}.",
      "How is {topic} regulated in biological systems?",
      "Connect {topic} to other biological processes.",
      "Apply knowledge of {topic} to a medical scenario.",
      "Evaluate competing hypotheses about {topic}."
    ],
    default: [
      "Explain the key principles of {topic}.",
      "How does {topic} connect to other concepts?",
      "Analyze the evidence supporting {topic}.",
      "What are the practical applications of {topic}?",
      "Compare different approaches to {topic}.",
      "Evaluate the strengths and limitations of {topic}.",
      "How would you teach {topic} to others?",
      "What are common misconceptions about {topic}?",
      "Justify the importance of studying {topic}.",
      "Create a study guide for {topic}."
    ]
  };
  
  return templates[subject] || templates.default;
}
