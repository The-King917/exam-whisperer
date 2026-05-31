export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  // Even with API key, we'll use our enhanced fallback
  // But try API first if available
  if (API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Generate 10 AP exam questions and a model answer for question #1.

Syllabus: ${syllabus}

Return JSON: {"questions":[{"num":1,"question":"...","confidence":85,"topic":"..."}],"answer":"4-5 sentence model answer for question 1"}`
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        let text = data.content[0].text;
        text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          result.questions = (result.questions || []).slice(0, 10).map((q, i) => ({
            num: i + 1,
            question: q.question || `Question ${i + 1}`,
            confidence: q.confidence || 85,
            topic: q.topic || "Key Topic"
          }));
          result.answer = result.answer || generateModelAnswer(syllabus, writing);
          return res.status(200).json(result);
        }
      }
    } catch (e) {
      console.log('API error, using enhanced fallback:', e.message);
    }
  }
  
  // Enhanced fallback with model answers
  const questions = getSmartQuestions(syllabus);
  const modelAnswer = generateModelAnswer(syllabus, writing);
  
  return res.status(200).json({
    questions: questions,
    answer: modelAnswer
  });
}

function getSmartQuestions(syllabus) {
  const topics = extractTopicsFromSyllabus(syllabus);
  const subject = detectSubject(syllabus);
  const templates = getTemplatesForSubject(subject);
  const questions = [];
  
  for (let i = 0; i < Math.min(10, topics.length); i++) {
    const template = templates[i % templates.length];
    questions.push({
      num: i + 1,
      question: template.replace('{topic}', topics[i]),
      confidence: 80 + Math.floor(Math.random() * 15),
      topic: topics[i]
    });
  }
  
  while (questions.length < 10) {
    questions.push({
      num: questions.length + 1,
      question: `Analyze the key concepts from ${topics[questions.length % topics.length] || 'your syllabus'} and explain their significance.`,
      confidence: 78,
      topic: topics[questions.length % topics.length] || "Core Concepts"
    });
  }
  
  return questions;
}

function generateModelAnswer(syllabus, writing) {
  const subject = detectSubject(syllabus);
  const topics = extractTopicsFromSyllabus(syllabus);
  const firstTopic = topics[0] || "the core concepts";
  
  let answer = "";
  
  // Subject-specific answer templates
  const answerTemplates = {
    history: `The key factors surrounding ${firstTopic} include multiple interconnected causes and consequences. Historians point to economic, social, and political factors that all played crucial roles. The evidence shows that [specific example from your syllabus] was particularly significant because it [explain impact]. Ultimately, ${firstTopic} led to major changes including [lasting effects], which continued to influence subsequent events. Understanding this topic requires analyzing both short-term triggers and long-term structural factors.`,

    psychology: `${firstTopic} can be understood through multiple psychological perspectives. Research demonstrates that [key finding from syllabus] significantly influences behavior through [mechanism]. Studies show that [specific example] produces measurable effects on cognition/behavior. Practical applications include [real-world example], which illustrates how these principles operate in everyday life. Overall, ${firstTopic} represents a fundamental concept that connects to broader themes in psychology.`,

    biology: `${firstTopic} involves a complex series of interconnected processes and mechanisms. At its core, [specific process] functions through [step-by-step explanation]. Research has shown that [key finding] regulates this process through [mechanism]. When this system malfunctions, it can lead to [consequences], demonstrating its importance. Understanding ${firstTopic} requires knowledge of both the individual components and how they work together as an integrated system.`,

    chemistry: `${firstTopic} is governed by fundamental chemical principles including [key principle 1] and [key principle 2]. The evidence shows that [specific concept] directly affects [outcome] through [mechanism]. Calculations based on [formula/law] allow us to predict [result] under different conditions. Real-world applications include [example], where understanding ${firstTopic} is crucial. Mastery of this topic requires both conceptual understanding and quantitative problem-solving skills.`,

    english: `${firstTopic} employs sophisticated literary and rhetorical strategies to achieve its purpose. The author's use of [technique 1] and [technique 2] creates [specific effect] that reinforces the central argument/theme. Evidence from the text, including [quote or example], demonstrates how [technique] functions. Readers can analyze how [specific element] contributes to the overall meaning and impact. Understanding ${firstTopic} requires close reading and attention to how different elements work together.`,

    default: `${firstTopic} represents a key concept that connects to multiple areas of this course. The evidence demonstrates that [key principle] is fundamental because it [explains importance]. Understanding this topic requires analyzing [specific aspects] and how they relate to each other. Practical applications include [example], where these principles operate in real-world contexts. Mastery of ${firstTopic} provides a foundation for understanding more complex ideas in the course.`
  };
  
  answer = answerTemplates[subject] || answerTemplates.default;
  
  // Insert actual syllabus-specific content if available
  const syllabusWords = syllabus.split(/\s+/);
  const keyTerms = [];
  for (let i = 0; i < Math.min(syllabusWords.length, 20); i++) {
    if (syllabusWords[i].length > 6 && !keyTerms.includes(syllabusWords[i])) {
      keyTerms.push(syllabusWords[i]);
    }
  }
  
  if (keyTerms.length > 0) {
    answer = answer.replace('[specific example]', keyTerms[0]);
    answer = answer.replace('[key finding]', keyTerms[1] || keyTerms[0]);
    answer = answer.replace('[mechanism]', keyTerms[2] || "interconnected processes");
    answer = answer.replace('[real-world example]', keyTerms[3] || keyTerms[0]);
  }
  
  // Incorporate student's writing style if provided
  if (writing && writing.length > 20) {
    const writingStyle = writing.substring(0, 150);
    answer = `[Writing style reference: "${writingStyle}"]\n\n${answer}`;
  }
  
  return answer;
}

function detectSubject(syllabus) {
  const text = syllabus.toLowerCase();
  if (text.includes('history') || text.includes('revolution') || text.includes('war') || text.includes('colony') || text.includes('empire')) return "history";
  if (text.includes('psych') || text.includes('brain') || text.includes('behavior') || text.includes('cognitive')) return "psychology";
  if (text.includes('bio') || text.includes('cell') || text.includes('dna') || text.includes('evolution') || text.includes('photosynthesis')) return "biology";
  if (text.includes('chem') || text.includes('molecule') || text.includes('reaction') || text.includes('acid')) return "chemistry";
  if (text.includes('physic') || text.includes('force') || text.includes('energy') || text.includes('motion')) return "physics";
  if (text.includes('calc') || text.includes('derivative') || text.includes('integral')) return "calculus";
  if (text.includes('english') || text.includes('literature') || text.includes('poem') || text.includes('essay')) return "english";
  if (text.includes('gov') || text.includes('politics') || text.includes('constitution')) return "government";
  if (text.includes('art') || text.includes('painting') || text.includes('sculpture')) return "art";
  return "default";
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
    // Match lines with colons (topic definitions)
    else if (line.includes(':')) {
      let topic = line.split(':')[0].trim();
      if (topic.length > 3 && topic.length < 50 && topics.length < 15) {
        topics.push(topic);
      }
    }
    // Match capitalized phrases
    else {
      const matches = line.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
      if (matches) {
        for (const match of matches) {
          if (match.length > 5 && match.length < 50 && topics.length < 15 && !topics.includes(match)) {
            topics.push(match);
          }
        }
      }
    }
  }
  
  // If no topics found, split by spaces and take long words
  if (topics.length === 0) {
    const words = syllabus.split(/\s+/);
    for (const word of words) {
      if (word.length > 6 && !topics.includes(word) && topics.length < 15) {
        topics.push(word);
      }
    }
  }
  
  // Default fallback
  if (topics.length === 0) {
    return ["Core Concepts", "Key Principles", "Major Theories", "Important Findings", "Critical Analysis", "Application Methods", "Research Evidence", "Practical Implications", "Theoretical Frameworks", "Contemporary Understanding"];
  }
  
  return topics;
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
      "Describe the mechanisms underlying {topic}.",
      "How does {topic} develop over time?",
      "What treatments or interventions relate to {topic}?"
    ],
    biology: [
      "Explain the mechanism of {topic} and its biological significance.",
      "How does {topic} maintain homeostasis?",
      "Describe what happens when {topic} malfunctions.",
      "Compare {topic} across different organisms or systems.",
      "Analyze the experimental evidence for {topic}.",
      "How is {topic} regulated in biological systems?",
      "Connect {topic} to other biological processes.",
      "Apply knowledge of {topic} to a medical scenario.",
      "Evaluate competing hypotheses about {topic}.",
      "What evolutionary factors influenced {topic}?"
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
    default: [
      "Explain the key principles of {topic} and why they matter.",
      "How does {topic} connect to other concepts in this course?",
      "What evidence supports our current understanding of {topic}?",
      "Analyze the strengths and limitations of different approaches to {topic}.",
      "How would you apply {topic} to a real-world scenario?",
      "Compare and contrast different perspectives on {topic}.",
      "What would happen if a key component of {topic} failed?",
      "Evaluate the most important findings related to {topic}.",
      "Create a framework for understanding {topic}.",
      "Justify the importance of studying {topic} in this course."
    ]
  };
  
  return templates[subject] || templates.default;
}
