export const REDDIT_SKILL_FILTER_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON.

You MUST return ONLY this exact JSON structure:
{
  "keep": boolean
}

Determine if this Reddit post matches the candidate's skills and is seeking a developer to BUILD or WORK.

CANDIDATE SKILLS (EXACT MATCH REQUIRED):
Languages: Java, JavaScript, TypeScript, C, C++, HTML, CSS
Frameworks: Spring Boot, Spring Security, Spring Cloud, Hibernate, JPA, React.js, Next.js, NestJS, Tailwind CSS
Databases: MySQL, PostgreSQL, MongoDB
Cloud/Tools: AWS (S3, Route 53, CloudFront), Google Cloud Platform, Docker, Nginx, Firebase
APIs/Integration: REST APIs, Microservices, JWT Authentication, OAuth, OpenAI APIs, Google Gemini/Vertex AI
Experience: Full-stack development, SaaS platforms, dashboards, backend systems, AI integrations, social media APIs

OPPORTUNITY:
Title: {title}
Content: {content}

Return {"keep": true} ONLY if ALL are true:
1. Post requires skills from candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, AWS, GCP, etc.)
2. Post is explicitly seeking a developer/engineer to BUILD or WORK (not offering services)
3. Post mentions payment, hiring, collaboration, or paid work
4. Post is NOT asking for advice, opinions, validation, or discussion
5. Post is NOT a "for hire" post (candidate offering services)
6. Post has clear execution scope (what needs to be built)

Return {"keep": false} if:
- Post is asking for advice ("Should I...", "What should I...", "How do I...")
- Post is about salary discussions ("What LPA should I ask?", "Is X salary good?")
- Post is seeking opinions or validation
- Post is a discussion thread without hiring intent
- Post requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, etc.)
- Post is offering services ("for hire", "available", "my services")
- Post is too vague or lacks clear execution scope

Return ONLY the JSON object:`;

export const REDDIT_CLASSIFICATION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON. ANY extra text makes the response INVALID.

You MUST return ONLY this exact JSON structure:
{
  "valid": boolean,
  "category": "job" | "freelance" | "collab",
  "opportunityScore": number,
  "reasoning": "one short sentence"
}

Analyze this Reddit opportunity and determine if it is a REAL, ACTIONABLE opportunity for the candidate.

CANDIDATE PROFILE:
Name: Vasu Yadav
Role: Software Developer (Junior to Mid-level)
Experience: Full-stack development, SaaS platforms, dashboards, backend systems
Skills: Java, JavaScript, TypeScript, Spring Boot, React.js, Next.js, MongoDB, PostgreSQL, MySQL, AWS, GCP, Docker, REST APIs, Microservices, AI integrations (OpenAI, Google Gemini)
Projects: Venture Vault (startup idea platform), Wingman (Chrome extension for AI meeting transcription)

SOURCE CONTEXT:
Subreddit: {context}

OPPORTUNITY:
Title: {title}
Content: {content}

------------------------------------------------
IMMEDIATE REJECTION (REJECT IF ANY TRUE):
------------------------------------------------
- Offering services ("for hire", "available", "my services", "I'm available")
- Asking for advice, opinions, validation ("Should I...", "What should I...", "Is X good?")
- Salary discussions ("What LPA should I ask?", "Is X salary good?", "Salary negotiation")
- Career advice requests ("What should I learn?", "Should I take this job?")
- Discussion threads without explicit hiring/collaboration intent
- Ideation/validation posts without execution request
- Market research or community discussion without developer request
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, Swift, Kotlin, etc.)
- Senior/staff-level roles (beyond junior–mid level)
- Non-engineering roles (PM-only, QA-only, marketing-only, sales-only, design-only)
- No explicit payment, hiring, or collaboration mention
- Vague or unclear execution scope

HARD RULE: If the post does NOT explicitly seek a developer to BUILD or WORK → valid=false

------------------------------------------------
REDDIT-SPECIFIC ACCEPTANCE RULES:
------------------------------------------------
Accept ONLY if ALL are true:
1. Explicitly hiring / paying / collaborating (mentions payment, salary, budget, paid work, collaboration)
2. Clear execution scope (what needs to be built: "build a dashboard", "develop an API", "create a SaaS platform")
3. Clear intent directed at developers (not general discussion or community post)
4. NOT asking for advice, opinions, or validation
5. NOT salary discussions, career advice, or market research
6. Skills required match candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, etc.)

Reject if:
- Salary questions ("What LPA should I ask?", "Is X salary good?")
- Advice requests ("Should I take this job?", "What should I learn?", "How do I...")
- Discussion threads without hiring intent
- Ideation/validation posts without explicit developer request
- General community discussion
- "For hire" posts (candidate offering services)

------------------------------------------------
CATEGORIES:
------------------------------------------------
- job: Full-time employment, W2 position, company hiring
- freelance: Contract work, project-based, paid per project/hour
- collab: Collaboration, equity-based, co-founder, early-stage partnership

------------------------------------------------
SCORING (0–100):
------------------------------------------------
- Resume skill match (0–35): How well do required skills match candidate's resume?
- Payment clarity (0–25): Is payment/hiring explicitly mentioned? (Higher if explicit)
- Execution scope clarity (0–20): Is it clear what needs to be built?
- Seriousness/legitimacy (0–15): Does it seem like a real, serious opportunity?
- Effort vs payoff (0–5): Reasonable scope for the compensation mentioned?

Return ONLY the JSON object:`;

export const REDDIT_CAP_SELECTION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON.

You MUST return ONLY this exact JSON structure:
{
  "selectedPostIds": ["id1", "id2", ...]
}

Select the BEST 10 posts from the list below for Reddit.

CANDIDATE PROFILE:
Junior to Mid-level Software Developer
Skills: Java, JavaScript, TypeScript, Spring Boot, React.js, Next.js, MongoDB, PostgreSQL, AWS, GCP
Experience: Full-stack development, SaaS platforms, AI integrations

SELECTION PRIORITY (in order):
1. Explicit payment mentions (salary, budget, paid, compensation)
2. Clear execution scope (specific features, systems, or products to build)
3. Strong skill match with candidate's resume
4. Real, actionable opportunities (not discussions or advice requests)
5. Reasonable scope for junior–mid level developer

REJECT IMMEDIATELY:
- Advice requests, salary questions, opinion seeking
- Discussion threads without hiring intent
- Vague or unclear opportunities
- Senior/staff-level requirements
- Skills not in candidate's resume

CANDIDATE RESUME:
{resume}

POSTS:
{posts}

Return ONLY the JSON object with selectedPostIds array (max 10):`;

