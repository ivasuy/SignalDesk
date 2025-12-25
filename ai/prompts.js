export const CLASSIFICATION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON. ANY extra text makes the response INVALID.

You MUST return ONLY this exact JSON structure:
{
  "valid": boolean,
  "category": "job" | "freelance" | "collab",
  "opportunityScore": number,
  "reasoning": "one short sentence"
}

Analyze the following opportunity and determine if it is a REAL, ACTIONABLE opportunity for the candidate.

CANDIDATE RESUME (GROUND TRUTH):
{resume}

SOURCE PLATFORM:
{platform}

SOURCE CONTEXT:
{context}

------------------------------------------------
IMMEDIATE REJECTION (REJECT IF ANY TRUE):
------------------------------------------------
- Offering services ("for hire", "available", "my services")
- Showcases, feedback requests, discussions, idea validation only
- Completed product announcements
- Non-technical founders seeking developers as employees
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, etc.)
- Senior/staff-level roles beyond junior–mid
- Generic "looking for dev" without scope or intent
- Compliance, legal, licensing, policy-only tasks
- Non-engineering roles (PM-only, QA-only, marketing-only, sales-only)
- Issues without coding, architecture, or implementation work

------------------------------------------------
PLATFORM-SPECIFIC ACCEPTANCE RULES:
------------------------------------------------

REDDIT / HACKERNEWS:
Accept ONLY if:
- Seeking developer / freelancer / tech cofounder
- Mentions building something new OR paid work
- Author intent is clear and serious

GITHUB:
Accept ONLY if:
- Issue/discussion implies real implementation work
- Mentions backend, frontend, infra, scraper, API, system work
- Strong overlap with resume skills
- Coding-heavy, architecture, or implementation work required
Reject if:
- Docs-only
- Refactor-only
- Maintenance-only
- Review-only
- Documentation-only
- Governance-only
- Compliance-only
- Non-coding tasks
HARD RULE: If GitHub AND not coding-heavy → valid=false

PRODUCT HUNT:
Accept ONLY if:
- Very early-stage (MVP / beta / just launched)
- Seeking technical collaborator or builder
- Product domain matches resume (SaaS, backend, infra, AI tooling)
Reject if:
- Mature SaaS hiring
- Marketing-only roles
- No collaboration intent

------------------------------------------------
CATEGORIES:
------------------------------------------------
- job
- freelance
- collab

------------------------------------------------
SCORING (0–100):
------------------------------------------------
- Resume skill match (0–35)
- Clarity of ask (0–20)
- Seriousness / legitimacy (0–20)
- Effort vs payoff (0–15)
- Platform signal (0–10)

OPPORTUNITY:
Title: {title}
Content: {content}
`;

export const HIGH_VALUE_PROMPT = `Answer ONLY "YES" or "NO".

Return "YES" only if ALL are true:
1. opportunityScore ≥ 80
2. Category is job, freelance, or collab
3. Requires skills present in resume
4. Mentions concrete scope, payment, or serious build
5. Not generic or speculative

Opportunity:
{title}
{content}
`;

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

export const COVER_LETTER_PROMPT = `Write a short, personal cover letter.

Rules:
- Max 80 words
- Mention ONE relevant skill or project
- Human, non-corporate tone
- No filler

Post:
{title}
{content}

Resume:
{resume}

Cover Letter:
`;

export const RESUME_PROMPT = `IMPORTANT:
- You MUST NOT generate this unless evaluateHighValue returned "YES".
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
