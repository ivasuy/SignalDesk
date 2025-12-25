export const HACKERNEWS_SKILL_FILTER_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON.

You MUST return ONLY this exact JSON structure:
{
  "keep": boolean
}

Determine if this HackerNews post matches the candidate's skills and is seeking a developer to BUILD or WORK.

CANDIDATE SKILLS (EXACT MATCH REQUIRED):
Languages: Java, JavaScript, TypeScript, C, C++, HTML, CSS
Frameworks: Spring Boot, Spring Security, Spring Cloud, Hibernate, JPA, React.js, Next.js, NestJS, Tailwind CSS
Databases: MySQL, PostgreSQL, MongoDB
Cloud/Tools: AWS (S3, Route 53, CloudFront), Google Cloud Platform, Docker, Nginx, Firebase
APIs/Integration: REST APIs, Microservices, JWT Authentication, OAuth, OpenAI APIs, Google Gemini/Vertex AI
Experience: Full-stack development, SaaS platforms, dashboards, backend systems, AI integrations, startup environments

OPPORTUNITY:
Title: {title}
Content: {content}

Return {"keep": true} ONLY if ALL are true:
1. Post requires skills from candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, AWS, GCP, etc.)
2. Post is seeking developer / freelancer / tech cofounder to BUILD or WORK
3. Post mentions building something new OR paid work OR collaboration
4. Post is NOT a discussion thread without hiring intent
5. Author intent is clear and serious

Return {"keep": false} if:
- Post is a general discussion thread without hiring intent
- Post requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, etc.)
- Post is offering services ("for hire", "available")
- Post is too vague or lacks clear intent
- Post is seeking senior/staff-level roles (beyond junior–mid level)

Return ONLY the JSON object:`;

export const HACKERNEWS_CLASSIFICATION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON. ANY extra text makes the response INVALID.

You MUST return ONLY this exact JSON structure:
{
  "valid": boolean,
  "category": "job" | "freelance" | "collab",
  "opportunityScore": number,
  "reasoning": "one short sentence"
}

Analyze this HackerNews opportunity and determine if it is a REAL, ACTIONABLE opportunity for the candidate.

CANDIDATE PROFILE:
Name: Vasu Yadav
Role: Software Developer (Junior to Mid-level)
Experience: Full-stack development, SaaS platforms, dashboards, backend systems, startup environments
Skills: Java, JavaScript, TypeScript, Spring Boot, React.js, Next.js, MongoDB, PostgreSQL, MySQL, AWS, GCP, Docker, REST APIs, Microservices, AI integrations (OpenAI, Google Gemini)
Projects: Venture Vault (startup idea platform), Wingman (Chrome extension for AI meeting transcription)

SOURCE CONTEXT:
{context}

OPPORTUNITY:
Title: {title}
Content: {content}

------------------------------------------------
IMMEDIATE REJECTION (REJECT IF ANY TRUE):
------------------------------------------------
- Offering services ("for hire", "available", "my services")
- General discussion threads without hiring intent
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, Swift, Kotlin, etc.)
- Senior/staff-level roles (beyond junior–mid level)
- Non-engineering roles (PM-only, QA-only, marketing-only, sales-only)
- No explicit hiring, paid work, or collaboration intent
- Too vague or unclear intent

HARD RULE: If the post does NOT explicitly seek a developer to BUILD or WORK → valid=false

------------------------------------------------
HACKERNEWS-SPECIFIC ACCEPTANCE RULES:
------------------------------------------------
Accept ONLY if ALL are true:
1. Seeking developer / freelancer / tech cofounder
2. Mentions building something new OR paid work OR collaboration
3. Author intent is clear and serious
4. Skills required match candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, etc.)
5. Appropriate for junior–mid level developer

HackerNews is known for:
- Startup founders seeking technical cofounders
- Early-stage companies hiring first developers
- Freelance/contract opportunities
- Technical collaboration opportunities

Reject if:
- General discussion threads without hiring intent
- Vague or unclear opportunities
- Senior/staff-level requirements
- Skills not in candidate's resume

------------------------------------------------
CATEGORIES:
------------------------------------------------
- job: Full-time employment, startup hiring, company position
- freelance: Contract work, project-based, paid per project/hour
- collab: Collaboration, equity-based, co-founder, early-stage partnership

------------------------------------------------
SCORING (0–100):
------------------------------------------------
- Resume skill match (0–35): How well do required skills match candidate's resume?
- Intent clarity (0–25): Is it clear what the author is seeking?
- Seriousness/legitimacy (0–20): Does it seem like a real, serious opportunity?
- Execution scope (0–15): Is it clear what needs to be built or worked on?
- Effort vs payoff (0–5): Reasonable scope for the opportunity mentioned?

Return ONLY the JSON object:`;

