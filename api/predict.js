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
          content: `You are an expert AP exam question predictor. Analyze this syllabus and generate 10 likely exam questions.

IMPORTANT: Identify the specific AP subject from the syllabus (from all 39 AP courses including: AP Biology, AP Chemistry, AP Physics 1, AP Physics 2, AP Physics C: Mechanics, AP Physics C: Electricity & Magnetism, AP Calculus AB, AP Calculus BC, AP Statistics, AP Computer Science A, AP Computer Science Principles, AP English Language, AP English Literature, AP US History, AP World History, AP European History, AP US Government, AP Comparative Government, AP Human Geography, AP Psychology, AP Economics (Micro/Macro), AP Spanish Language, AP Spanish Literature, AP French, AP German, AP Italian, AP Japanese, AP Latin, AP Chinese, AP Art History, AP Music Theory, AP Studio Art, AP 2-D Art, AP 3-D Art, AP Drawing, AP Seminar, AP Research, AP African American Studies, AP Precalculus).

Generate questions SPECIFIC to that subject's exam format and content.

Syllabus: ${syllabus}${styleNote}

Return ONLY valid JSON in this exact format:
{"questions":[{"num":1,"question":"exam question here","confidence":85,"topic":"specific topic from syllabus"}],"answer":"4-5 sentence model answer to question #1"}

Make questions that mimic the actual AP exam for that subject (MCQ, FRQ, DBQ, etc. as appropriate).`
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('API Error:', data);
      return res.status(200).json(getDefaultQuestions(syllabus, writing));
    }

    let text = data.content[0].text;
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
    
    if (!result.questions || !Array.isArray(result.questions)) {
      result.questions = [];
    }
    
    while (result.questions.length < 10) {
      result.questions.push({
        num: result.questions.length + 1,
        question: `Explain the key concepts from ${syllabus.substring(0, 50)}`,
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
    
    result.answer = result.answer || generateDefaultAnswer(detectSubject(syllabus), writing);
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(200).json(getDefaultQuestions(syllabus, writing));
  }
}

function detectSubject(syllabus) {
  const text = syllabus.toLowerCase();
  
  const subjects = {
    // Sciences
    "ap biology": ["biology", "cell", "dna", "evolution", "photosynthesis", "mitosis", "meiosis", "ecology"],
    "ap chemistry": ["chemistry", "molecule", "reaction", "acid", "base", "periodic", "stoichiometry", "thermochemistry"],
    "ap physics 1": ["physics 1", "force", "motion", "energy", "momentum", "rotation", "waves", "algebra-based"],
    "ap physics 2": ["physics 2", "fluid", "thermodynamics", "electricity", "magnetism", "optics", "quantum"],
    "ap physics c: mechanics": ["physics c", "mechanics", "calculus-based", "kinematics", "dynamics", "rotational"],
    "ap physics c: e&m": ["electricity", "magnetism", "gauss", "circuit", "faraday", "maxwell"],
    
    // Math
    "ap calculus ab": ["calculus ab", "derivative", "integral", "limit", "continuity", "definite integral"],
    "ap calculus bc": ["calculus bc", "series", "polar", "parametric", "vector", "taylor", "maclaurin"],
    "ap statistics": ["statistics", "probability", "distribution", "regression", "hypothesis", "inference", "chi-square"],
    "ap precalculus": ["precalculus", "function", "trigonometry", "polynomial", "exponential", "logarithmic", "matrix"],
    
    // Computer Science
    "ap computer science a": ["computer science a", "java", "object-oriented", "class", "inheritance", "array", "recursion"],
    "ap computer science principles": ["csp", "computing", "internet", "data", "algorithm", "programming", "innovation"],
    
    // English
    "ap english language": ["english language", "rhetoric", "argument", "synthesis", "analysis", "composition", "nonfiction"],
    "ap english literature": ["english literature", "poetry", "prose", "drama", "fiction", "literary analysis", "close reading"],
    
    // History & Social Sciences
    "ap us history": ["us history", "american history", "colonies", "revolution", "civil war", "reconstruction", "cold war"],
    "ap world history": ["world history", "global", "civilization", "empire", "trade", "revolution", "modern"],
    "ap european history": ["european history", "renaissance", "reformation", "enlightenment", "revolution", "world war"],
    "ap us government": ["government", "politics", "constitution", "congress", "president", "court", "civil rights"],
    "ap comparative government": ["comparative", "political systems", "china", "russia", "mexico", "nigeria", "iran", "uk"],
    "ap human geography": ["human geography", "population", "migration", "culture", "urban", "agriculture", "industrialization"],
    
    // Economics
    "ap microeconomics": ["microeconomics", "supply", "demand", "market", "consumer", "producer", "elasticity", "monopoly"],
    "ap macroeconomics": ["macroeconomics", "gdp", "inflation", "unemployment", "fiscal", "monetary", "trade", "exchange"],
    
    // Psychology
    "ap psychology": ["psychology", "brain", "behavior", "cognitive", "developmental", "social", "personality", "abnormal"],
    
    // World Languages & Cultures
    "ap spanish language": ["spanish language", "español", "comunicación", "cultura", "escritura", "conversación"],
    "ap spanish literature": ["spanish literature", "literatura española", "garcilaso", "cervantes", "garcía márquez"],
    "ap french": ["french language", "français", "communication", "culture", "écriture", "conversation"],
    "ap german": ["german language", "deutsch", "kommunikation", "kultur", "schreiben", "konversation"],
    "ap italian": ["italian language", "italiano", "comunicazione", "cultura", "scrittura", "conversazione"],
    "ap japanese": ["japanese language", "日本語", "communication", "culture", "writing", "conversation"],
    "ap chinese": ["chinese language", "中文", "communication", "culture", "writing", "conversation"],
    "ap latin": ["latin", "caesar", "vergil", "catullus", "horace", "ovid", "roman"],
    
    // Arts
    "ap art history": ["art history", "painting", "sculpture", "architecture", "renaissance", "baroque", "modern"],
    "ap music theory": ["music theory", "harmony", "counterpoint", "rhythm", "melody", "ear training", "analysis"],
    "ap 2-d art": ["2-d art", "drawing", "painting", "printmaking", "graphic design", "photography", "digital art"],
    "ap 3-d art": ["3-d art", "sculpture", "ceramics", "installation", "mixed media", "spatial design"],
    "ap drawing": ["drawing", "sketch", "figure drawing", "still life", "perspective", "composition", "portfolio"],
    "ap studio art": ["studio art", "portfolio", "art", "2d", "3d", "drawing", "sustained investigation"],
    
    // Capstone
    "ap seminar": ["seminar", "research", "argument", "presentation", "team project", "individual essay"],
    "ap research": ["research", "academic paper", "methodology", "literature review", "data analysis", "presentation"],
    
    // African American Studies
    "ap african american studies": ["african american", "black studies", "slavery", "civil rights", "black culture", "african diaspora"],
    
    // Default
    "ap course": []
  };
  
  for (const [subject, keywords] of Object.entries(subjects)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return subject;
      }
    }
  }
  
  return "AP Course";
}

function getTemplatesForSubject(subject) {
  const templates = {
    // Sciences
    "ap biology": [
      "Explain how [specific process] works and why it's important for cellular function.",
      "Compare and contrast [process A] and [process B]. How are they similar and different?",
      "What would happen if [specific component] stopped working? Explain the cascading effects.",
      "Describe the steps of [specific pathway] and identify where regulation occurs.",
      "Design an experiment to test [hypothesis]. Include controls and expected results.",
      "Analyze how [environmental factor] affects [biological process]."
    ],
    "ap chemistry": [
      "Explain the relationship between [concept A] and [concept B] using specific examples.",
      "Predict what would happen if [condition changed]. Justify using chemical principles.",
      "Calculate [quantity] and explain the significance of your answer.",
      "Compare the properties of [substance A] and [substance B].",
      "Describe the steps to determine [unknown] using [lab technique]."
    ],
    "ap physics 1": [
      "Explain the physics principles behind [real-world scenario].",
      "Calculate the [force/energy/velocity] and justify your approach.",
      "Predict what happens when [variable changes]. Use physics laws.",
      "Compare the motion in [scenario A] vs [scenario B].",
      "Design an experiment to test [concept]."
    ],
    "ap physics 2": [
      "Explain [thermodynamics/fluids/electricity/magnetism/optics] concept.",
      "Calculate [quantity] and explain the physics reasoning.",
      "Analyze what happens when [parameter changes].",
      "Compare [phenomenon A] and [phenomenon B]."
    ],
    "ap physics c: mechanics": [
      "Derive the equation for [scenario] using calculus.",
      "Set up and solve the differential equation for [motion].",
      "Calculate [quantity] using integration.",
      "Explain the relationship between [concept A] and [concept B] mathematically."
    ],
    "ap physics c: e&m": [
      "Use Gauss's law to find [electric field] for [charge distribution].",
      "Derive the [magnetic field] using Ampere's law.",
      "Calculate [capacitance/inductance/resistance] for [circuit].",
      "Explain [EM phenomenon] using Maxwell's equations."
    ],
    
    // Math
    "ap calculus ab": [
      "Find the derivative of [function] and explain its meaning.",
      "Evaluate the integral and interpret the result.",
      "Determine the [max/min] and justify using calculus.",
      "Set up an integral to represent [real-world quantity].",
      "Analyze the behavior of [function] using first/second derivatives."
    ],
    "ap calculus bc": [
      "Find the Taylor series for [function] and determine interval of convergence.",
      "Solve the differential equation [equation] with initial condition.",
      "Find the length of the parametric/polar curve.",
      "Determine convergence/divergence of [series] using [test]."
    ],
    "ap statistics": [
      "Calculate the probability of [event] and interpret.",
      "Construct and interpret a confidence interval for [parameter].",
      "Perform a hypothesis test for [claim] and state conclusion.",
      "Explain what [p-value/confidence level] means in context.",
      "Identify potential biases in [sampling method]."
    ],
    "ap precalculus": [
      "Find the [zeros/domain/range/asymptotes] of [function].",
      "Solve the [equation/inequality] and justify steps.",
      "Model [scenario] with a [linear/quadratic/exponential] function.",
      "Convert between [rectangular/polar] coordinates.",
      "Find the [magnitude/direction] of the vector."
    ],
    
    // Computer Science
    "ap computer science a": [
      "Write a method that [performs task]. Include pre/post conditions.",
      "Explain how [inheritance/polymorphism/recursion] works in this code.",
      "Trace this code and determine the output.",
      "Identify and fix the bugs in this [algorithm].",
      "Compare [array] vs [ArrayList] in this context."
    ],
    "ap computer science principles": [
      "Explain how [algorithm] solves [problem].",
      "Identify potential security/privacy concerns with [technology].",
      "Describe how the Internet works for [scenario].",
      "Convert [number] between binary/decimal/hex.",
      "Explain the impact of [computing innovation] on society."
    ],
    
    // English
    "ap english language": [
      "Analyze the rhetorical strategies used in [passage].",
      "Write an argument essay on [topic] using evidence.",
      "Synthesize sources to support [claim].",
      "Explain how [author] achieves [purpose].",
      "Compare the rhetorical choices in [text A] and [text B]."
    ],
    "ap english literature": [
      "Analyze how [author] uses [literary device] to convey meaning.",
      "Discuss the development of [theme] in [work].",
      "Explain the significance of [symbol] in [text].",
      "Compare how [poet/author] treats [subject] in [poems/works].",
      "Analyze the characterization of [character] in [work]."
    ],
    
    // History
    "ap us history": [
      "Analyze the causes and effects of [event].",
      "Compare the perspectives of [group A] and [group B] on [issue].",
      "Evaluate the extent to which [policy] changed America.",
      "Explain continuity and change in [theme] over time.",
      "How did [previous event] influence [later event]?"
    ],
    "ap world history": [
      "Analyze the development and impact of [civilization/empire].",
      "Explain how [trade route] connected and transformed societies.",
      "Compare [revolution A] and [revolution B].",
      "Evaluate the causes and consequences of [global phenomenon].",
      "Analyze continuity and change in [region] over time."
    ],
    "ap european history": [
      "Analyze how [Renaissance/Reformation/Enlightenment] changed Europe.",
      "Explain the causes and consequences of [revolution/war].",
      "Compare [nationalism/imperialism] in [country A] and [country B].",
      "Evaluate the impact of [industrialization] on society."
    ],
    
    // Government & Politics
    "ap us government": [
      "Explain how the [Constitution/Bill of Rights] applies to [scenario].",
      "Analyze how [branch] checks the power of [other branch].",
      "Describe the process of [policy-making/campaigns/elections].",
      "Explain the role of [court case] in shaping [rights/powers].",
      "Compare [federalist/anti-federalist] views on [issue]."
    ],
    "ap comparative government": [
      "Compare political systems of [country A] and [country B].",
      "Analyze how [institution] functions in [authoritarian/democratic] system.",
      "Explain the relationship between [citizens] and [state] in [country].",
      "Compare electoral systems across [countries]."
    ],
    "ap human geography": [
      "Explain how [geographic concept] shapes [population/culture/urban] patterns.",
      "Analyze the causes and effects of [migration/urbanization].",
      "Compare agricultural practices in [region A] and [region B].",
      "Explain how [globalization] affects [local culture/economy]."
    ],
    
    // Economics
    "ap microeconomics": [
      "Analyze how [change] affects supply/demand/equilibrium.",
      "Calculate elasticity and explain what it means.",
      "Explain how [firm] maximizes profit in [market structure].",
      "Analyze the effects of [tax/subsidy/price control].",
      "Explain the concept of [externality/public good]."
    ],
    "ap macroeconomics": [
      "Explain how [fiscal/monetary policy] affects [GDP/inflation/unemployment].",
      "Analyze the effects of [change] using AD/AS model.",
      "Explain the role of [banks/Fed] in [money creation/control].",
      "Analyze [international trade/exchange rates] scenario.",
      "Explain the [Phillips curve/trade-off] in context."
    ],
    
    // Psychology
    "ap psychology": [
      "Explain how [biological/cognitive/social] factors influence [behavior].",
      "Design an experiment to test [hypothesis].",
      "Analyze [case study] using psychological perspectives.",
      "Compare [theory A] and [theory B] of [memory/learning/personality].",
      "Explain how [research method] is used to study [topic]."
    ],
    
    // Languages
    "ap spanish language": [
      "Escribe un ensayo argumentativo sobre [tema].",
      "Compara y contrasta [aspecto cultural] en [países].",
      "Analiza el mensaje de [texto/audio].",
      "Escribe una respuesta a [correo electrónico/artículo].",
      "Participa en una conversación sobre [tema]."
    ],
    "ap spanish literature": [
      "Analiza el tema de [tema] en [obra].",
      "Compara el tratamiento de [motivo] en [texto A] y [texto B].",
      "Explica el contexto histórico/social de [obra].",
      "Analiza los recursos literarios en [poema/obra]."
    ],
    "ap french": [
      "Rédigez un essai argumentatif sur [sujet].",
      "Comparez et contrastez [aspect culturel] dans [pays].",
      "Analysez le message de [texte/audio].",
      "Participez à une conversation sur [sujet]."
    ],
    "ap german": [
      "Schreiben Sie einen argumentativen Aufsatz über [Thema].",
      "Vergleichen Sie [kultureller Aspekt] in [Ländern].",
      "Analysieren Sie die Botschaft von [Text/Audio]."
    ],
    "ap italian": [
      "Scrivi un saggio argomentativo su [tema].",
      "Confronta [aspetto culturale] in [paesi].",
      "Analizza il messaggio di [testo/audio]."
    ],
    "ap japanese": [
      "[テーマ]について論証エッセイを書いてください。",
      "[国々]の[文化的側面]を比較対照してください。"
    ],
    "ap chinese": [
      "就[主题]写一篇议论文。",
      "比较[国家]的[文化方面]。"
    ],
    "ap latin": [
      "Translate and analyze [passage from Caesar/Vergil].",
      "Discuss [literary device] in [poem by Catullus/Ovid].",
      "Explain the historical/cultural context of [text]."
    ],
    
    // Arts
    "ap art history": [
      "Analyze [artwork] in its historical/cultural context.",
      "Compare [artwork A] and [artwork B].",
      "Explain how [artist] used [technique/material].",
      "Identify the characteristics of [art movement/period].",
      "Discuss the function/purpose of [artwork/architecture]."
    ],
    "ap music theory": [
      "Analyze the harmony/form in [musical excerpt].",
      "Complete the [melody/harmony/counterpoint].",
      "Identify errors in the [part writing/orchestration].",
      "Transcribe the [melody/rhythm].",
      "Analyze the [chord progression/modulation]."
    ],
    "ap 2-d art": [
      "Explain how [artwork] demonstrates [principle/technique].",
      "Analyze the composition/color choices in [artwork].",
      "Describe the process of creating [type of art].",
      "Compare [2D medium A] and [2D medium B]."
    ],
    "ap 3-d art": [
      "Explain how [sculpture] uses [space/form/material].",
      "Analyze the construction techniques of [artwork].",
      "Describe the relationship between [artwork] and its environment."
    ],
    "ap drawing": [
      "Analyze the use of [line/value/perspective] in [drawing].",
      "Explain how [artist] creates [illusion/form/texture].",
      "Describe the composition/technique of [drawing]."
    ],
    "ap studio art": [
      "Explain how your portfolio demonstrates [sustained investigation].",
      "Analyze the materials/techniques used in [artwork].",
      "Describe how [artwork] shows [idea/theme/concept]."
    ],
    
    // Capstone
    "ap seminar": [
      "Analyze the argument in [source] for [credibility/validity].",
      "Construct an evidence-based argument for [claim].",
      "Evaluate the perspectives on [issue].",
      "Design a research question for [problem]."
    ],
    "ap research": [
      "Explain your research methodology and justify choices.",
      "Analyze your findings and their significance.",
      "Discuss limitations and future directions for research.",
      "Connect your research to existing literature."
    ],
    
    // African American Studies
    "ap african american studies": [
      "Analyze the impact of [institution/event] on African American communities.",
      "Explain how [cultural movement] shaped identity/expression.",
      "Compare [leader A] and [leader B]'s approaches to [issue].",
      "Analyze the significance of [art/literature/music] in the African American experience."
    ],
    
    // Default
    "ap course": [
      "Explain the key concepts from [topic] and why they matter.",
      "Compare and contrast [concept A] and [concept B].",
      "What would happen if [something went wrong]? Explain.",
      "Analyze the factors that influence [outcome].",
      "Evaluate the importance of [concept] in context.",
      "Apply [concept] to a new situation and explain."
    ]
  };
  
  return templates[subject] || templates["ap course"];
}

function generateDefaultAnswer(subject, writing) {
  const answers = {
    "ap biology": "Focus on understanding the core biological processes, how they're regulated, and what happens when normal function is disrupted. Be prepared to explain cause-and-effect relationships and design experiments.",
    "ap chemistry": "Focus on understanding chemical principles, predicting outcomes of reactions, and justifying your reasoning using fundamental concepts. Practice calculations and explaining the chemistry behind phenomena.",
    "ap physics": "Focus on understanding the physical principles, applying equations correctly, and explaining your reasoning. Practice solving problems and designing experiments.",
    "ap calculus": "Focus on understanding the meaning behind derivatives and integrals, not just computation. Practice setting up problems and interpreting results in context.",
    "ap history": "Focus on analyzing cause/effect, continuity/change, and comparing perspectives. Use specific evidence to support arguments.",
    "ap english": "Focus on close reading, analyzing rhetorical/literary choices, and writing clear, evidence-based arguments.",
    "ap psychology": "Focus on connecting concepts across units and applying psychological principles to real-world scenarios.",
    "ap computer science": "Focus on understanding algorithms, writing clean code, and explaining your logic clearly."
  };
  
  let answer = answers[subject] || "Focus on understanding the core concepts, making connections between topics, and applying knowledge to new situations. Practice explaining your reasoning clearly.";
  
  if (writing) {
    answer = writing.substring(0, 150) + "... " + answer;
  }
  
  return answer;
}

function getDefaultQuestions(syllabus, writing) {
  const subject = detectSubject(syllabus);
  const templates = getTemplatesForSubject(subject);
  const questions = [];
  
  for (let i = 1; i <= 10; i++) {
    const template = templates[(i - 1) % templates.length];
    questions.push({
      num: i,
      question: template.replace(/\[.*?\]/g, "the relevant concept from your syllabus"),
      confidence: 70 + Math.floor(Math.random() * 20),
      topic: extractTopicFromSyllabus(syllabus, i)
    });
  }
  
  return { 
    questions, 
    answer: generateDefaultAnswer(subject, writing) 
  };
}

function extractTopicFromSyllabus(syllabus, index) {
  const words = syllabus.split(/\s+/);
  const possibleTopics = [];
  
  for (let i = 0; i < words.length; i++) {
    if (words[i].length > 6 && words[i][0] === words[i][0].toUpperCase()) {
      possibleTopics.push(words[i]);
    }
  }
  
  if (possibleTopics.length > 0) {
    return possibleTopics[index % possibleTopics.length];
  }
  
  const defaultTopics = [
    "Foundational Concepts", "Key Processes", "Important Mechanisms",
    "Core Principles", "Major Themes", "Critical Analysis",
    "Application of Knowledge", "Synthesis of Ideas", "Evaluation of Evidence",
    "Integration of Concepts"
  ];
  
  return defaultTopics[index % defaultTopics.length];
}
