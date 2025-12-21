import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseJSONResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON from AI response: ${error.message}`);
  }
}

function escapeLaTeX(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\$/g, '\\$')
    .replace(/\&/g, '\\&')
    .replace(/\#/g, '\\#')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\_/g, '\\_')
    .replace(/\~/g, '\\textasciitilde{}')
    .replace(/\%/g, '\\%');
}

function generateSummaryBlock(data) {
  if (!data.summary) return '';
  
  const summaryText = escapeLaTeX(data.summary);
  return `%-----------SUMMARY-----------
\\section{Professional Summary}
  \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{${summaryText}}}
  \\end{itemize}
\\vspace{-8pt}
`;
}

function generateExperienceBlock(data, originalResume) {
  if (!data.experience || data.experience.length === 0) {
    // Use original resume data as fallback
    if (originalResume && originalResume.experience && originalResume.experience.length > 0) {
      let latex = `%-----------EXPERIENCE-----------
\\section{Experience}
  \\resumeSubHeadingListStart
`;
      
      originalResume.experience.slice(0, 2).forEach((exp, idx) => {
        const company = escapeLaTeX(exp.company || '');
        const role = escapeLaTeX(exp.role || '');
        const period = escapeLaTeX(exp.duration || '');
        const workDesc = exp.work_description || '';
        
        latex += `    \\resumeSubheading
      {${company}}{${period}}
      {${role}}{}
`;
        
        if (workDesc) {
          const descLines = escapeLaTeX(workDesc).split('. ').filter(l => l.trim());
          if (descLines.length > 0) {
            latex += `      \\resumeItemListStart
`;
            // Extract up to 5 bullet points from work description
            descLines.slice(0, 5).forEach(line => {
              if (line.trim()) {
                latex += `        \\resumeItem{${line.trim()}.}\n`;
              }
            });
            latex += `      \\resumeItemListEnd\n`;
          }
        }
        
        if (idx < originalResume.experience.length - 1) {
          latex += `\n`;
        }
      });
      
      latex += `  \\resumeSubHeadingListEnd
\\vspace{-16pt}
`;
      return latex;
    }
    // Return a placeholder to prevent empty section
    return `%-----------EXPERIENCE-----------
\\section{Experience}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      {No experience listed}{}
      {}{}
  \\resumeSubHeadingListEnd
\\vspace{-16pt}
`;
  }
  
  let latex = `%-----------EXPERIENCE-----------
\\section{Experience}
  \\resumeSubHeadingListStart
`;

  // Calculate bullet points per experience based on count
  const expCount = data.experience.length;
  const bulletsPerExp = expCount === 2 ? 5 : expCount === 3 ? 4 : 3;
  
  data.experience.forEach((exp, idx) => {
    const company = escapeLaTeX(exp.company || 'Company');
    const role = escapeLaTeX(exp.title || exp.role || 'Role');
    const period = escapeLaTeX(exp.period || exp.duration || '');
    const location = escapeLaTeX(exp.location || '');
    
    latex += `    \\resumeSubheading
      {${company}}{${period}}
      {${role}}{${location}}
`;
    
    // Prioritize achievements array (should have 5 points from AI, but we'll limit based on count)
    const hasAchievements = exp.achievements && Array.isArray(exp.achievements) && exp.achievements.length > 0;
    const hasDescription = exp.description && exp.description.trim();
    
    if (hasAchievements || hasDescription) {
      latex += `      \\resumeItemListStart
`;
      
      if (hasAchievements) {
        // Use achievements array, limit based on number of experiences
        exp.achievements.slice(0, bulletsPerExp).forEach(ach => {
          if (ach && ach.trim()) {
            latex += `        \\resumeItem{${escapeLaTeX(ach)}}\n`;
          }
        });
      } else if (hasDescription) {
        // Fallback: extract from description if achievements not provided
        const descLines = escapeLaTeX(exp.description).split('. ').filter(l => l.trim());
        descLines.slice(0, bulletsPerExp).forEach(line => {
          if (line.trim()) {
            latex += `        \\resumeItem{${line.trim()}.}\n`;
          }
        });
      }
      
      latex += `      \\resumeItemListEnd\n`;
    }
    
    if (idx < data.experience.length - 1) {
      latex += `\n`;
    }
  });
  
  latex += `  \\resumeSubHeadingListEnd
\\vspace{-16pt}
`;
  
  return latex;
}

function generateProjectsBlock(data, originalResume) {
  if (!data.projects || data.projects.length === 0) {
    // Use original resume data as fallback
    if (originalResume && originalResume.projects && originalResume.projects.length > 0) {
      return originalResume.projects.slice(0, 2).map((project, idx) => {
        const name = escapeLaTeX(project.name || '');
        const duration = escapeLaTeX(project.duration || '');
        const techs = project.tech_stack && Array.isArray(project.tech_stack) 
          ? project.tech_stack.map(t => escapeLaTeX(t)).join(', ')
          : '';
        
        let latex = `      \\resumeProjectHeading
          {\\textbf{${name}}${techs ? ` $|$ \\emph{${techs}}` : ''}}{${duration}}
`;
        
        if (project.description && project.description.trim()) {
          const descLines = escapeLaTeX(project.description).split('. ').filter(l => l.trim());
          if (descLines.length > 0) {
            latex += `          \\resumeItemListStart\n`;
            // Extract up to 5 bullet points from project description
            descLines.slice(0, 5).forEach(line => {
              if (line.trim()) {
                latex += `            \\resumeItem{${line.trim()}.}\n`;
              }
            });
            latex += `          \\resumeItemListEnd\n`;
          }
        }
        
        if (idx < originalResume.projects.length - 1) {
          latex += `          \\vspace{-13pt}\n`;
        }
        
        return latex;
      }).join('\n');
    }
    // Return a placeholder item to prevent empty list
    return '      \\resumeProjectHeading\n          {\\textbf{No projects listed}}{}';
  }
  
  // Calculate bullet points per project based on count
  const projCount = data.projects.length;
  const bulletsPerProj = projCount === 2 ? 5 : projCount === 3 ? 4 : 3;
  
  return data.projects.map((project, idx) => {
    const name = escapeLaTeX(project.name || project.title || 'Project');
    const duration = escapeLaTeX(project.duration || '');
    const techs = project.technologies && Array.isArray(project.technologies) 
      ? project.technologies.map(t => escapeLaTeX(t)).join(', ')
      : '';
    
    let latex = `      \\resumeProjectHeading
          {\\textbf{${name}}${techs ? ` $|$ \\emph{${techs}}` : ''}}{${duration}}
`;
    
    // Prioritize achievements array if available (should have 5 points from AI, but we'll limit based on count)
    if (project.achievements && Array.isArray(project.achievements) && project.achievements.length > 0) {
      latex += `          \\resumeItemListStart\n`;
      project.achievements.slice(0, bulletsPerProj).forEach(ach => {
        if (ach && ach.trim()) {
          latex += `            \\resumeItem{${escapeLaTeX(ach)}}\n`;
        }
      });
      latex += `          \\resumeItemListEnd\n`;
    } else if (project.description && project.description.trim()) {
      // Fallback: extract from description if achievements not provided
      const descLines = escapeLaTeX(project.description).split('. ').filter(l => l.trim());
      if (descLines.length > 0) {
        latex += `          \\resumeItemListStart\n`;
        descLines.slice(0, bulletsPerProj).forEach(line => {
          if (line.trim()) {
            latex += `            \\resumeItem{${line.trim()}.}\n`;
          }
        });
        latex += `          \\resumeItemListEnd\n`;
      }
    }
    
    if (idx < data.projects.length - 1) {
      latex += `          \\vspace{-13pt}\n`;
    }
    
    return latex;
  }).join('\n');
}

function generateSkillsBlock(data) {
  if (!data.skills) return ' \\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{}}\n \\end{itemize}';
  
  // Check if skills is organized by category (object) or flat array
  if (typeof data.skills === 'object' && !Array.isArray(data.skills)) {
    // Skills organized by category
    const categories = [];
    
    if (data.skills.languages && data.skills.languages.length > 0) {
      categories.push(`\\textbf{Languages}{: ${data.skills.languages.map(s => escapeLaTeX(s)).join(', ')}}`);
    }
    if (data.skills.frameworks && data.skills.frameworks.length > 0) {
      categories.push(`\\textbf{Frameworks}{: ${data.skills.frameworks.map(s => escapeLaTeX(s)).join(', ')}}`);
    }
    if (data.skills.databases && data.skills.databases.length > 0) {
      categories.push(`\\textbf{Databases}{: ${data.skills.databases.map(s => escapeLaTeX(s)).join(', ')}}`);
    }
    if (data.skills.tools && data.skills.tools.length > 0) {
      categories.push(`\\textbf{Tools/Cloud}{: ${data.skills.tools.map(s => escapeLaTeX(s)).join(', ')}}`);
    }
    if (data.skills.other && data.skills.other.length > 0) {
      categories.push(`\\textbf{Other}{: ${data.skills.other.map(s => escapeLaTeX(s)).join(', ')}}`);
    }
    
    if (categories.length > 0) {
      return ` \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     ${categories.join(' $|$ ')}
    }}
 \\end{itemize}`;
    }
  }
  
  // Fallback: flat array
  const skills = Array.isArray(data.skills) ? data.skills : Object.values(data.skills).flat();
  const skillsText = skills.slice(0, 30).map(s => escapeLaTeX(s)).join(', ');
  
  return ` \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     \\textbf{Technical Skills}{: ${skillsText}}
    }}
 \\end{itemize}`;
}

async function compileLaTeX(texPath, outputDir) {
  let compiler = null;
  let compilerType = null;
  
  // First check for tectonic (preferred, modern LaTeX engine)
  const tectonicPaths = [
    '/usr/local/bin/tectonic',
    '/opt/homebrew/bin/tectonic',
    '/usr/bin/tectonic',
    'tectonic'
  ];
  
  for (const path of tectonicPaths) {
    try {
      if (path === 'tectonic') {
        execSync('which tectonic', { stdio: 'ignore' });
        compiler = 'tectonic';
        compilerType = 'tectonic';
        break;
      } else if (existsSync(path)) {
        compiler = path;
        compilerType = 'tectonic';
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  // Fall back to pdflatex if tectonic not found
  if (!compiler) {
    const pdflatexPaths = [
      '/usr/local/bin/pdflatex',
      '/usr/bin/pdflatex',
      '/Library/TeX/texbin/pdflatex',
      'pdflatex'
    ];
    
    for (const path of pdflatexPaths) {
      try {
        if (path === 'pdflatex') {
          execSync('which pdflatex', { stdio: 'ignore' });
          compiler = 'pdflatex';
          compilerType = 'pdflatex';
          break;
        } else if (existsSync(path)) {
          compiler = path;
          compilerType = 'pdflatex';
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  if (!compiler) {
    throw new Error('No LaTeX compiler found. Please install Tectonic (https://tectonic-typesetting.github.io/) or TeX Live/MacTeX (https://www.tug.org/texlive/ or https://www.tug.org/mactex/)');
  }
  
  try {
    const baseName = texPath.replace('.tex', '');
    const fileName = baseName.split('/').pop();
    
    if (compilerType === 'tectonic') {
      // Tectonic outputs PDF to the same directory as the .tex file
      // Increase timeout for Tectonic as it may need to download packages
      execSync(`${compiler} --outdir="${outputDir}" "${texPath}"`, {
        stdio: 'pipe',
        timeout: 60000,
        cwd: outputDir
      });
      
      const pdfPath = join(outputDir, `${fileName}.pdf`);
      if (existsSync(pdfPath)) {
        return pdfPath;
      }
    } else {
      // pdflatex command
      execSync(`${compiler} -interaction=nonstopmode -output-directory="${outputDir}" "${texPath}"`, {
        stdio: 'pipe',
        timeout: 30000,
        cwd: outputDir
      });
      
      const pdfPath = join(outputDir, `${fileName}.pdf`);
      if (existsSync(pdfPath)) {
        return pdfPath;
      }
    }
    
    throw new Error('PDF compilation failed - output file not found');
  } catch (error) {
    const logPath = texPath.replace('.tex', '.log');
    let logContent = '';
    if (existsSync(logPath)) {
      logContent = readFileSync(logPath, 'utf8').substring(0, 500);
    }
    throw new Error(`LaTeX compilation failed: ${error.message}${logContent ? '\nLog: ' + logContent : ''}`);
  }
}

export async function generateResumePDF(resumeJSON, outputPath = null) {
  const data = typeof resumeJSON === 'string' ? parseJSONResponse(resumeJSON) : resumeJSON;
  
  const templatePath = join(__dirname, 'Resume.tex');
  const templateContent = readFileSync(templatePath, 'utf8');
  
  const resumeDataPath = join(__dirname, '..', 'resume.json');
  const resumeData = JSON.parse(readFileSync(resumeDataPath, 'utf8'));
  
  // Only generate dynamic blocks (summary, experience, projects, skills)
  // Name, contact, education, coursework, and achievements are hardcoded in Resume.tex
  const summaryBlock = generateSummaryBlock(data);
  const experienceBlock = generateExperienceBlock(data, resumeData);
  const projectsBlock = generateProjectsBlock(data, resumeData);
  const skillsBlock = generateSkillsBlock(data);
  
  const filledTemplate = templateContent
    .replace('{{SUMMARY_BLOCK}}', summaryBlock)
    .replace('{{EXPERIENCE_BLOCK}}', experienceBlock)
    .replace('{{PROJECTS_BLOCK}}', projectsBlock)
    .replace('{{SKILLS_BLOCK}}', skillsBlock);
  
  const outputDir = join(__dirname, '..', 'output');
  await mkdir(outputDir, { recursive: true });
  
  const timestamp = Date.now();
  const texPath = join(outputDir, `resume-${timestamp}.tex`);
  writeFileSync(texPath, filledTemplate, 'utf8');
  
  try {
    const pdfPath = await compileLaTeX(texPath, outputDir);
    
    if (!outputPath) {
      outputPath = join(outputDir, `resume-${timestamp}.pdf`);
    }
    
    if (pdfPath !== outputPath) {
      const pdfContent = readFileSync(pdfPath);
      writeFileSync(outputPath, pdfContent);
      if (existsSync(pdfPath)) unlinkSync(pdfPath);
    }
    
    const auxPath = join(outputDir, `resume-${timestamp}.aux`);
    const logPath = join(outputDir, `resume-${timestamp}.log`);
    const outPath = join(outputDir, `resume-${timestamp}.out`);
    
    if (existsSync(auxPath)) unlinkSync(auxPath);
    if (existsSync(logPath)) unlinkSync(logPath);
    if (existsSync(outPath)) unlinkSync(outPath);
    if (existsSync(texPath)) unlinkSync(texPath);
    
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}
