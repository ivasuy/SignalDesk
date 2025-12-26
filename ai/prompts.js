

export const REPLY_PROMPT = `Write a structured, professional first-person reply to this opportunity.

CRITICAL RULES:
- 4-5 lines max
- First person only
- Reference 1-2 specific skills from resume that match the opportunity
- Explain briefly how you can contribute
- Professional closing: "Happy to discuss further" or "Let me know if you'd like to connect"
- NEVER use generic phrases like "DM me", "Excited about", or vague enthusiasm
- Be specific about your value proposition

Candidate Resume:
{resume}

Post:
Title: {title}
Content: {content}
Category: {category}

Reply:
`;

export const COVER_LETTER_PROMPT = `Write a professional cover letter with exactly 3 paragraphs.

CRITICAL REQUIREMENTS:
- Minimum 100 words (aim for 100-150 words)
- Exactly 3 paragraphs:
  1. Introduction: Context about the opportunity + why you're interested
  2. Skills & Relevance: Specific skills from your resume that match the opportunity + how you can contribute
  3. Closing: Clear intent to discuss further + professional closing
- Human, non-corporate tone
- Reference 2-3 specific skills or projects from resume
- No filler or generic phrases
- Be specific about your value proposition

Post:
{title}
{content}

Resume:
{resume}

Cover Letter:
`;

export const RESUME_PROMPT = `IMPORTANT:
- Use ONLY resume data provided.
- Return STRICT JSON only.

Refactor the candidate's existing resume data into STRICT JSON format, tailored to highlight relevance for this opportunity. ONLY USE DATA FROM THE PROVIDED RESUME - DO NOT ADD, INVENT, OR CREATE NEW INFORMATION.

JSON Schema:
{
  "summary": "Refactor the existing profile summary to emphasize aspects matching this opportunity (use only existing summary text, reword if needed, 2-3 sentences)",
  "experience": [
    {
      "title": "Use exact role from resume",
      "company": "Use exact company name from resume",
      "period": "Use exact duration from resume",
      "description": "Refactor existing work_description to emphasize relevant aspects (use only existing information, 1-2 sentences)",
      "achievements": ["Extract 5 detailed bullet points from existing work_description that match the opportunity. Break down the work_description into specific, actionable achievements. Each bullet should be a complete sentence describing a specific task, feature, or accomplishment."]
    }
  ],
  "skills": {
    "languages": ["Select languages from resume that match the opportunity"],
    "frameworks": ["Select frameworks/libraries from resume that match the opportunity"],
    "databases": ["Select databases from resume that match the opportunity"],
    "tools": ["Select tools/cloud platforms from resume that match the opportunity"],
    "other": ["Select other relevant skills from resume that match the opportunity"]
  },
  "projects": [
    {
      "name": "Use exact project name from resume",
      "description": "Refactor existing description to emphasize relevant aspects (use only existing information, 1-2 sentences)",
      "technologies": ["Use exact technologies from resume tech_stack"],
      "achievements": ["Extract 5 detailed bullet points from existing project description that match the opportunity. Break down the description into specific features, implementations, or technical accomplishments. Each bullet should describe a specific aspect of the project."]
    }
  ],
}

CRITICAL RULES:
- Return ONLY valid JSON, no markdown, no code blocks, no explanations
- ONLY use data that exists in the provided resume - DO NOT invent or add new information
- NEVER return empty arrays - always include at least one item in each array field
- ONE PAGE REQUIREMENT: The resume MUST fit exactly one page - balance content accordingly
- experience: MUST include AT LEAST 2 most relevant experience roles (can include 3 if it fits on one page, prioritize the most relevant ones)
  - If 2 experiences: Each MUST have exactly 5 achievement bullet points
  - If 3 experiences: Each MUST have 3-4 bullet points to ensure one-page fit
  - Extract bullet points by breaking down the work_description into specific tasks, features, implementations, or accomplishments
  - Each bullet point should be a complete sentence describing a specific contribution
  - Prioritize achievements that match the job requirements (tech stack, responsibilities, domain)
  - Keep bullet points concise but informative
- projects: MUST include AT LEAST 2 most relevant projects (can include 3 if it fits on one page, prioritize the most relevant ones)
  - If 2 projects: Each MUST have exactly 5 achievement bullet points in the "achievements" array
  - If 3 projects: Each MUST have 3-4 bullet points to ensure one-page fit
  - Extract bullet points by breaking down the project description into specific features, technical implementations, or accomplishments
  - Each bullet point should describe a specific aspect: features built, technologies used, problems solved, integrations implemented
  - Prioritize projects that match the job requirements
  - Keep bullet points concise but informative
- skills: MUST organize skills into categories (languages, frameworks, databases, tools, other)
  - Include AT LEAST 3-5 items per category that match the opportunity
  - MINIMUM REQUIREMENT: Total MUST be AT LEAST 15 skills across all categories (aim for 15-25)
  - If a category has fewer relevant skills, include more from other categories to reach the 15 minimum
  - This saves space and makes the resume more organized and scannable
  - Format: {"languages": [...], "frameworks": [...], "databases": [...], "tools": [...], "other": [...]}
  - CRITICAL: Never return fewer than 15 total skills - always ensure the sum of all categories equals at least 15
- summary: MUST always be provided (use existing profile summary, reword to emphasize relevance, 2-3 sentences max)
- Use exact institution names, degrees, locations, graduation dates, and CGPA from resume
- Refactor/reword existing descriptions to emphasize relevance, but use only existing facts
- Extract multiple bullet points from longer descriptions - break down sentences into individual achievements
- Use exact names, dates, and details from resume - do not modify them
- If work_description or project description is long, extract distinct points from it
- If description is short, expand by breaking it into more granular points based on what's mentioned
- Prioritize quality and relevance over quantity - better to have fewer, highly relevant points than many generic ones

Post title: {title}
Post content: {content}
Category: {category}
Resume data: {resume}

Return ONLY the JSON object:`;


