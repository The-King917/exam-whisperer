export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { syllabus, writing } = req.body;
  if (!syllabus) {
    return res.status(400).json({ error: 'No syllabus provided' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  // Detect subject from syllabus
  const subject = detectSubject(syllabus);
  
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
          model: 'claude-3-haiku-20240307',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: getAPStylePrompt(syllabus, subject, writing)
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        let text = data.content[0].text;
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          result.questions = (result.questions || []).slice(0, 10).map((q, i) => ({
            num: i + 1,
            question: q.question || `Question ${i + 1}`,
            confidence: q.confidence || 85,
            topic: q.topic || "Key Concept"
          }));
          result.answer = result.answer || generateAPAnswer(syllabus, subject, writing);
          return res.status(200).json(result);
        }
      }
    } catch (e) {
      console.log('API error, using fallback:', e.message);
    }
  }
  
  // Fallback - generates AP-style questions from syllabus
  const questions = generateAPQuestions(syllabus, subject);
  const answer = generateAPAnswer(syllabus, subject, writing);
  
  return res.status(200).json({ questions, answer });
}

function getAPStylePrompt(syllabus, subject, writing) {
  const taskVerbs = getTaskVerbs(subject);
  const questionStems = getQuestionStems(subject);
  const writingNote = writing ? `\n\nMatch the student's writing style: "${writing}"` : '';
  
  return `You are an expert AP exam writer for ${subject}. Generate 10 authentic AP-style questions based on this syllabus.

Syllabus: ${syllabus}${writingNote}

REAL AP TASK VERBS TO USE:
${taskVerbs.map(v => `- ${v}`).join('\n')}

REAL QUESTION STEMS TO USE:
${questionStems.map(s => `- "${s}"`).join('\n')}

REQUIREMENTS FOR EACH QUESTION:
1. MUST use one of the task verbs above
2. MUST be application-based (testing analysis, not just recall)
3. MUST reference SPECIFIC terms from the syllabus
4. MUST mimic real College Board AP exam format
5. MUST include a confidence score (70-95%) based on how likely this topic appears on exams

FORMAT: Return ONLY valid JSON:
{"questions":[
  {"num":1,"question":"[AP-style question using task verb]","confidence":85,"topic":"[specific topic from syllabus]"},
  {"num":2,"question":"...","confidence":82,"topic":"..."}
],"answer":"[5-6 sentence AP-level sample answer for question #1]"}`
}

function detectSubject(syllabus) {
  const text = syllabus.toLowerCase();
  
  const subjects = {
    'AP Biology': ['biology', 'cell', 'dna', 'evolution', 'photosynthesis', 'mitosis', 'meiosis', 'ecology', 'enzyme', 'protein'],
    'AP Chemistry': ['chemistry', 'molecule', 'reaction', 'acid', 'base', 'periodic', 'stoichiometry', 'thermochemistry', 'molar'],
    'AP Physics 1': ['physics 1', 'force', 'motion', 'energy', 'momentum', 'rotation', 'wave', 'kinematic'],
    'AP Physics 2': ['physics 2', 'fluid', 'thermodynamics', 'electricity', 'magnetism', 'optics', 'quantum'],
    'AP Physics C': ['physics c', 'calculus-based', 'mechanics', 'e&m', 'electromagnetism'],
    'AP Calculus AB': ['calculus ab', 'derivative', 'integral', 'limit', 'continuity'],
    'AP Calculus BC': ['calculus bc', 'series', 'polar', 'parametric', 'vector', 'taylor'],
    'AP Statistics': ['statistics', 'probability', 'distribution', 'regression', 'hypothesis', 'inference'],
    'AP Computer Science A': ['computer science a', 'java', 'object-oriented', 'class', 'inheritance', 'array'],
    'AP Computer Science Principles': ['csp', 'computing', 'internet', 'data', 'algorithm', 'programming'],
    'AP English Language': ['english language', 'rhetoric', 'argument', 'synthesis', 'composition', 'nonfiction'],
    'AP English Literature': ['english literature', 'poetry', 'prose', 'drama', 'literary analysis', 'fiction'],
    'AP US History': ['us history', 'american history', 'colonies', 'revolution', 'civil war', 'cold war'],
    'AP World History': ['world history', 'global', 'civilization', 'empire', 'trade', 'revolution'],
    'AP European History': ['european history', 'renaissance', 'reformation', 'enlightenment', 'world war'],
    'AP US Government': ['government', 'politics', 'constitution', 'congress', 'president', 'court', 'civil rights'],
    'AP Comparative Government': ['comparative', 'political systems', 'china', 'russia', 'mexico', 'nigeria', 'iran'],
    'AP Human Geography': ['human geography', 'population', 'migration', 'culture', 'urban', 'agriculture'],
    'AP Microeconomics': ['microeconomics', 'supply', 'demand', 'market', 'consumer', 'producer', 'elasticity'],
    'AP Macroeconomics': ['macroeconomics', 'gdp', 'inflation', 'unemployment', 'fiscal', 'monetary', 'trade'],
    'AP Psychology': ['psychology', 'brain', 'behavior', 'cognitive', 'developmental', 'social', 'personality'],
    'AP Art History': ['art history', 'painting', 'sculpture', 'architecture', 'renaissance', 'baroque'],
    'AP Music Theory': ['music theory', 'harmony', 'counterpoint', 'rhythm', 'melody', 'ear training'],
    'AP Spanish Language': ['spanish', 'español', 'comunicación', 'cultura', 'escritura'],
    'AP French': ['french', 'français', 'communication', 'culture', 'écriture'],
    'AP German': ['german', 'deutsch', 'kommunikation', 'kultur', 'schreiben'],
    'AP Latin': ['latin', 'caesar', 'vergil', 'catullus', 'horace', 'ovid']
  };
  
  for (const [subject, keywords] of Object.entries(subjects)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return subject;
      }
    }
  }
  
  return 'AP Course';
}

function getTaskVerbs(subject) {
  const commonVerbs = ['Identify', 'Describe', 'Explain', 'Analyze', 'Compare', 'Evaluate', 'Justify'];
  
  const subjectSpecific = {
    'AP Biology': ['Predict', 'Calculate', 'Construct', 'Support', 'Refute', 'Pose', 'Represent', 'Determine'],
    'AP Chemistry': ['Calculate', 'Predict', 'Determine', 'Identify', 'Justify', 'Represent', 'Draw'],
    'AP Physics': ['Calculate', 'Derive', 'Determine', 'Sketch', 'Label', 'Rank', 'Describe'],
    'AP Calculus': ['Find', 'Evaluate', 'Determine', 'Justify', 'Interpret', 'Approximate', 'Solve'],
    'AP Statistics': ['Calculate', 'Interpret', 'Construct', 'Perform', 'State', 'Verify', 'Estimate'],
    'AP History': ['Analyze', 'Compare', 'Evaluate', 'Explain', 'Support', 'Refute', 'Describe'],
    'AP English': ['Analyze', 'Argue', 'Synthesize', 'Evaluate', 'Select', 'Explain', 'Support']
  };
  
  for (const [key, verbs] of Object.entries(subjectSpecific)) {
    if (subject.includes(key)) {
      return [...commonVerbs, ...verbs];
    }
  }
  
  return commonVerbs;
}

function getQuestionStems(subject) {
  const stems = {
    'AP Biology': [
      'Explain how {topic} contributes to homeostasis',
      'Describe the role of {topic} in cellular communication',
      'Predict the effect of a mutation in {topic}',
      'Analyze how {topic} affects metabolic pathways',
      'Compare the mechanisms of {topic} and {related topic}',
      'Justify the importance of {topic} in evolutionary processes'
    ],
    'AP Chemistry': [
      'Calculate the {quantity} and explain your reasoning',
      'Predict the effect of changing {variable} on {topic}',
      'Identify the type of {bond/reaction} and justify',
      'Explain how {topic} determines the properties of {substance}',
      'Compare the strength of {force A} and {force B}',
      'Design an experiment to determine {unknown}'
    ],
    'AP Physics': [
      'Calculate the {quantity} and justify your approach',
      'Derive an expression for {quantity} in terms of {variables}',
      'Explain how {topic} affects the motion of {object}',
      'Predict the outcome when {condition} changes',
      'Rank the {quantities} from greatest to least, justifying your order',
      'Sketch and label a graph showing {relationship}'
    ],
    'AP Calculus': [
      'Find the {derivative/integral/limit} and interpret its meaning',
      'Determine the {maximum/minimum} value and justify',
      'Evaluate the limit and explain your reasoning',
      'Solve the differential equation for {scenario}',
      'Approximate the value using {method} and justify'
    ],
    'AP Statistics': [
      'Calculate the probability of {event} and interpret',
      'Construct and interpret a confidence interval for {parameter}',
      'Perform a hypothesis test for {claim} and state conclusion',
      'Explain what the p-value means in this context',
      'Identify potential biases in this sampling method'
    ],
    'AP History': [
      'Analyze the causes of {topic} and its consequences',
      'Compare the perspectives of {group A} and {group B} on {issue}',
      'Evaluate the extent to which {event} changed {society/country}',
      'Explain how {topic} influenced subsequent events',
      'Support or refute the claim that {statement}'
    ],
    'AP English': [
      'Analyze how the author uses {device} to achieve {purpose}',
      'Write an argument essay supporting or refuting {claim}',
      'Synthesize the sources to develop a position on {issue}',
      'Explain the function of {element} in the passage',
      'Select the evidence that best supports {claim}'
    ],
    'AP Psychology': [
      'Explain how {topic} influences human behavior',
      'Design an experiment to test {hypothesis} about {topic}',
      'Analyze the case study using {perspective}',
      'Compare {theory A} and {theory B} of {topic}',
      'Apply the concept of {topic} to a real-world example'
    ],
    'AP Economics': [
      'Explain how {change} affects supply/demand/equilibrium',
      'Calculate elasticity and interpret its meaning',
      'Analyze the effects of {policy} on {market/economy}',
      'Graph and label the {curve/shift} showing {effect}',
      'Justify the government\'s intervention using {concept}'
    ]
  };
  
  for (const [key, stemsList] of Object.entries(stems)) {
    if (subject.includes(key)) {
      return stemsList;
    }
  }
  
  // Default stems for any subject
  return [
    'Explain how {topic} functions and why it matters',
    'Analyze the relationship between {topic} and {related concept}',
    'Evaluate the evidence supporting our understanding of {topic}',
    'Compare different approaches to {topic}',
    'Justify the importance of {topic} in this course',
    'Predict what would happen if {condition} changed',
    'Apply {topic} to a new scenario and explain your reasoning'
  ];
}

function generateAPQuestions(syllabus, subject) {
  const topics = extractTopics(syllabus);
  const stems = getQuestionStems(subject);
  const questions = [];
  
  for (let i = 0; i < Math.min(10, topics.length); i++) {
    const stem = stems[i % stems.length];
    const topic = topics[i];
    const relatedTopic = topics[(i + 1) % topics.length];
    
    let question = stem
      .replace(/{topic}/g, topic)
      .replace(/{related topic}/g, relatedTopic)
      .replace(/{quantity}/g, getQuantityForSubject(subject))
      .replace(/{variable}/g, 'temperature, concentration, or pressure')
      .replace(/{bond\/reaction}/g, 'bond or reaction')
      .replace(/{substance}/g, topic)
      .replace(/{force A}/g, topic)
      .replace(/{force B}/g, relatedTopic)
      .replace(/{unknown}/g, 'an unknown substance')
      .replace(/{variables}/g, 'given variables')
      .replace(/{object}/g, 'an object')
      .replace(/{condition}/g, 'a condition')
      .replace(/{quantities}/g, 'quantities')
      .replace(/{relationship}/g, 'the relationship')
      .replace(/{derivative\/integral\/limit}/g, 'derivative, integral, or limit')
      .replace(/{method}/g, 'a numerical method')
      .replace(/{event}/g, topic)
      .replace(/{parameter}/g, 'the population parameter')
      .replace(/{claim}/g, 'a claim')
      .replace(/{group A}/g, topic)
      .replace(/{group B}/g, relatedTopic)
      .replace(/{issue}/g, topic)
      .replace(/{event}/g, topic)
      .replace(/{society\/country}/g, 'society')
      .replace(/{statement}/g, 'a statement about this topic')
      .replace(/{device}/g, 'a literary device')
      .replace(/{purpose}/g, 'a specific purpose')
      .replace(/{element}/g, 'an element')
      .replace(/{perspective}/g, 'a psychological perspective')
      .replace(/{theory A}/g, topic)
      .push(`Analyze the key principles of ${topic} and their significance.`);
    
    questions.push({
      num: i + 1,
      question: question,
      confidence: 75 + Math.floor(Math.random() * 20),
      topic: topic.substring(0, 60)
    });
  }
  
  // Fill remaining if needed
  while (questions.length < 10) {
    questions.push({
      num: questions.length + 1,
      question: `Explain how the key concepts from your syllabus relate to real-world applications in ${subject}.`,
      confidence: 78,
      topic: "Application"
    });
  }
  
  return questions;
}

function generateAPAnswer(syllabus, subject, writing) {
  const topics = extractTopics(syllabus);
  const firstTopic = topics[0] || "the core concepts";
  
  const answers = {
    'AP Biology': `The process of ${firstTopic} involves multiple interconnected components working together. First, [specific mechanism] initiates the response by [step 1]. Then, [specific molecule] amplifies the signal through [step 2]. Finally, [specific outcome] occurs as a result of [step 3]. Evidence from research demonstrates that when ${firstTopic} is disrupted, it leads to [specific consequence]. On the AP Biology exam, you should be able to explain this pathway step-by-step and predict the effects of disruptions or mutations.`,
    
    'AP Chemistry': `${firstTopic} can be understood through fundamental chemical principles. The relationship between [factors] determines the behavior of [substances] under different conditions. Experimental evidence shows that [specific principle] governs how ${firstTopic} affects [observable property]. Calculations using [relevant equation] allow us to predict outcomes quantitatively. For the AP Chemistry exam, practice both conceptual explanations and quantitative problems related to ${firstTopic}.`,
    
    'AP Physics': `${firstTopic} is governed by the relationship between [physical quantities]. According to [relevant law/principle], when [variable] changes, [effect] occurs. The mathematical expression [equation] describes this relationship. In AP Physics, you should be able to derive relevant equations, calculate unknown quantities, and explain the physical reasoning behind your answer.`,
    
    'AP History': `${firstTopic} represents a significant development with multiple causes and consequences. The evidence shows that [specific factor 1] and [specific factor 2] both contributed to this outcome. Different historical perspectives include [perspective A] and [perspective B]. When analyzing ${firstTopic} on the AP exam, use specific evidence, consider multiple perspectives, and explain cause-and-effect relationships.`,
    
    'AP English': `In analyzing ${firstTopic}, the author employs sophisticated rhetorical/literary strategies to achieve their purpose. The use of [device 1] and [device 2] creates [specific effect] that reinforces the central argument/theme. Evidence from the text, including [example], demonstrates how these choices function. On the AP English exam, you should be able to identify these devices and explain how they contribute to meaning and effect.`,
    
    'AP Psychology': `${firstTopic} involves complex psychological processes that influence behavior and cognition. Research studies, including [relevant studies], have demonstrated that [key finding]. The implications include [practical applications]. On the AP Psychology exam, you should be able to apply these concepts to new scenarios, evaluate research methods, and connect ${firstTopic} to other psychological domains.`
  };
  
  let answer = answers[subject] || `Based on your syllabus, understanding ${firstTopic} requires analyzing how different components interact. The evidence demonstrates that [key principle] is fundamental to this concept. Practical applications include real-world scenarios where ${firstTopic} operates. To succeed on the AP exam, focus on explaining these mechanisms clearly, using specific terminology, and connecting ${firstTopic} to broader themes in the course.`;
  
  // Remove placeholder brackets and fill with actual topics
  answer = answer.replace(/\[.*?\]/g, firstTopic);
  
  if (writing && writing.length > 20) {
    answer = `[Using your writing style as reference]\n\n${answer}`;
  }
  
  return answer;
}

function extractTopics(syllabus) {
  const topics = [];
  const lines = syllabus.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Match bullet points
    if (trimmed.match(/^[-•*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      let topic = trimmed.replace(/^[-•*\d.]+\s*/, '').trim();
      topic = topic.split(':')[0].split('(')[0].trim();
      if (topic.length > 3 && topic.length < 80 && !topics.includes(topic)) {
        topics.push(topic);
      }
    }
    // Match lines with colons
    else if (trimmed.includes(':') && trimmed.length < 60) {
      let topic = trimmed.split(':')[0].trim();
      if (topic.length > 3 && topic.length < 50 && !topics.includes(topic)) {
        topics.push(topic);
      }
    }
  }
  
  // If no topics found, split by spaces
  if (topics.length === 0) {
    const words = syllabus.split(/\s+/);
    for (const word of words) {
      if (word.length > 6 && word[0] === word[0].toUpperCase() && !topics.includes(word)) {
        topics.push(word);
      }
    }
  }
  
  // Default topics
  if (topics.length === 0) {
    topics.push('Core Concepts', 'Key Principles', 'Important Processes', 'Major Themes', 'Critical Analysis');
  }
  
  return topics.slice(0, 15);
}

function getQuantityForSubject(subject) {
  if (subject.includes('Chemistry')) return 'concentration, pH, or equilibrium constant';
  if (subject.includes('Physics')) return 'force, velocity, energy, or momentum';
  if (subject.includes('Statistics')) return 'probability, mean, or standard deviation';
  if (subject.includes('Calculus')) return 'derivative, integral, or limit';
  if (subject.includes('Economics')) return 'price, quantity, or elasticity';
  return 'the relevant quantity';
}
