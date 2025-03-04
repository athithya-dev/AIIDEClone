const axios = require('axios');

/** @type {string} API key for Gemini */
const GEMINI_API_KEY = 'AIzaSyBGCdHuLaR93yMxDhaLd-FhhyqzYftJaCE'; // Replace with your valid key

/** @type {string} Gemini API endpoint */
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/** @type {{ [query: string]: string }} */
let feedbackStore = {};

async function analyzeCodeWithGemini(input, mode = 'generate') {
  if (!input || typeof input !== 'string') {
    return '// Error: Invalid input provided.';
  }

  let prompt = '';
  if (mode === 'generate') {
    prompt = `
You are an expert coding assistant. Given this prompt:
"${input}"
Generate complete, well-structured code with comments.
If converting to another language (e.g., C, C++, Java, JavaScript, Python), ensure syntax and semantics match the target language accurately.
Return only the code inside triple backticks like this:
\`\`\`
[your code here]
\`\`\`
    `.trim();
  } else if (mode === 'comment') {
    prompt = `
You are an expert coding assistant. Given this code:
\`\`\`
${input}
\`\`\`
Add detailed inline comments explaining each significant part.
Return only the commented code inside triple backticks:
\`\`\`
[your commented code here]
\`\`\`
    `.trim();
  } else if (mode === 'fix_or_extend') {
    prompt = `
You are an expert coding assistant. Given this code:
\`\`\`
${input}
\`\`\`
Fix errors or extend logically, adding comments.
Return only the modified code inside triple backticks:
\`\`\`
[your modified code here]
\`\`\`
    `.trim();
  } else if (mode === 'chat') {
    prompt = `
You are an intelligent coding chatbot. Answer this query:
"${input}"
Provide a detailed, step-by-step solution or explanation, pulling from coding forums, documentation, and best practices.
If applicable, include code inside triple backticks like this: \`\`\`[code here]\`\`\`.
Adjust based on past feedback: ${JSON.stringify(feedbackStore[input] || 'No feedback yet')}.
    `.trim();
  } else if (mode === 'languageOptions') {
    prompt = `
You are an AI coding assistant. Given this code:
\`\`\`
${input}
\`\`\`
Return a JSON object listing all programming languages the code can be converted to.
Include at least: C, C++, Java, JavaScript, Python, Ruby, Go, Rust, PHP, TypeScript.
Return the JSON inside triple backticks like this:
\`\`\`
{"languages": ["C", "C++", "Java", "JavaScript", "Python", "Ruby", "Go", "Rust", "PHP", "TypeScript"]}
\`\`\`
    `.trim();
  } else if (mode === 'autoCorrect') {
    prompt = `
You are an expert coding assistant. Given this code:
\`\`\`
${input}
\`\`\`
Auto-correct syntax errors, improve readability, enforce clean code practices (e.g., proper naming, spacing), and add comments where needed.
Return only the corrected code inside triple backticks like this:
\`\`\`
[corrected code here]
\`\`\`
    `.trim();
  }

  try {
    const requestPayload = { contents: [{ parts: [{ text: prompt }] }] };
    console.log('Sending request to Gemini API:', JSON.stringify(requestPayload, null, 2));

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      requestPayload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('Raw Gemini API response:', JSON.stringify(response.data, null, 2));

    if (!response.data || typeof response.data !== 'object') {
      if (mode === 'languageOptions') {
        return { languages: ['C', 'C++', 'Java', 'JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'PHP', 'TypeScript'] };
      }
      return '// Error: Invalid API response format.';
    }

    const candidates = response.data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || !candidates[0].content.parts[0]) {
      if (mode === 'languageOptions') {
        return { languages: ['C', 'C++', 'Java', 'JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'PHP', 'TypeScript'] };
      }
      return '// Error: No valid candidates in API response.';
    }

    const text = candidates[0].content.parts[0].text;
    if (mode === 'languageOptions') {
      const match = text.match(/```[\s\S]*?```/);
      if (match) {
        try {
          return JSON.parse(match[0].replace(/```/g, '').trim());
        } catch (e) {
          console.error('JSON parse error:', e.message, 'Raw text:', text);
          return { languages: ['C', 'C++', 'Java', 'JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'PHP', 'TypeScript'] };
        }
      }
      return { languages: ['C', 'C++', 'Java', 'JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'PHP', 'TypeScript'] };
    }

    const codeMatch = text.match(/```[\s\S]*?```/) || [];
    return codeMatch.length ? codeMatch[0].replace(/```/g, '').trim() : text.trim();
  } catch (error) {
    console.error('Gemini API error:', error.message || error, 'Response:', error.response?.data);
    if (mode === 'languageOptions') {
      return { languages: ['C', 'C++', 'Java', 'JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'PHP', 'TypeScript'] };
    }
    return `// Error: ${error.message || 'Failed to process request.'}`;
  }
}

function updateFeedback(query, value) {
  feedbackStore[query] = value;
}

module.exports = { analyzeCodeWithGemini, updateFeedback };