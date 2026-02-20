/**
 * Markdown Parser
 * 
 * Parses markdown documents and extracts structure, frontmatter, and sections
 */

export type DocumentType = 'transcript' | 'setup_notes' | 'documentation' | 'general';

export interface Section {
  heading: string;
  level: number;
  content: string;
}

export interface ParsedDocument {
  title: string;
  frontmatter?: Record<string, any>;
  sections: Section[];
  documentType: DocumentType;
}

/**
 * Parse markdown document and extract structure
 */
export function parseMarkdown(markdown: string): ParsedDocument {
  // Extract frontmatter
  const { frontmatter, content } = extractFrontmatter(markdown);
  
  // Extract sections
  const sections = extractSections(content);
  
  // Determine document type
  const documentType = identifyDocumentType(frontmatter, content, sections);
  
  // Extract title
  const title = extractTitle(frontmatter, sections);
  
  return {
    title,
    frontmatter,
    sections,
    documentType,
  };
}

/**
 * Extract YAML frontmatter from markdown
 */
function extractFrontmatter(markdown: string): { frontmatter?: Record<string, any>; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = markdown.match(frontmatterRegex);
  
  if (!match) {
    return { content: markdown };
  }
  
  const yamlContent = match[1];
  const content = markdown.slice(match[0].length);
  
  // Parse YAML (simple implementation)
  const frontmatter = parseYAML(yamlContent);
  
  return { frontmatter, content };
}

/**
 * Simple YAML parser for frontmatter
 */
function parseYAML(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  
  let currentKey: string | null = null;
  let currentIndent = 0;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const indent = line.match(/^\s*/)?.[0].length || 0;
    
    // Array item
    if (line.trim().startsWith('-')) {
      const value = line.trim().slice(1).trim();
      if (currentKey && Array.isArray(result[currentKey])) {
        result[currentKey].push(value);
      }
      continue;
    }
    
    // Key-value pair
    const keyValueMatch = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, , key, value] = keyValueMatch;
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();
      
      if (indent === 0) {
        // Top-level key
        currentKey = trimmedKey;
        currentIndent = indent;
        
        if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
          // Inline array
          const arrayContent = trimmedValue.slice(1, -1);
          result[trimmedKey] = arrayContent.split(',').map(v => v.trim());
        } else if (trimmedValue) {
          result[trimmedKey] = trimmedValue;
        } else {
          // Nested object or array
          result[trimmedKey] = {};
        }
      } else if (indent > currentIndent && currentKey) {
        // Nested key
        if (typeof result[currentKey] !== 'object' || Array.isArray(result[currentKey])) {
          result[currentKey] = {};
        }
        result[currentKey][trimmedKey] = trimmedValue;
      }
    }
  }
  
  return result;
}

/**
 * Extract sections with headings and content
 */
function extractSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split('\n');
  
  let currentSection: Section | null = null;
  let currentContent: string[] = [];
  
  for (const line of lines) {
    // Check if line is a heading
    const headingMatch = line.match(/^(#{1,6})\s*(.+)$/);
    
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }
      
      // Start new section
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      
      currentSection = {
        heading,
        level,
        content: '',
      };
      currentContent = [];
    } else if (currentSection) {
      // Add content to current section
      currentContent.push(line);
    } else if (line.trim()) {
      // Content before first heading - create a default section
      if (sections.length === 0 && !currentSection) {
        currentSection = {
          heading: '',
          level: 0,
          content: '',
        };
      }
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }
  
  return sections.filter(s => s.heading || s.content);
}

/**
 * Identify document type from frontmatter and content
 */
function identifyDocumentType(
  frontmatter: Record<string, any> | undefined,
  content: string,
  sections: Section[]
): DocumentType {
  // Check frontmatter first
  if (frontmatter?.type) {
    const type = frontmatter.type.toLowerCase();
    if (type === 'transcript' || type === 'setup_notes' || type === 'documentation') {
      return type as DocumentType;
    }
  }
  
  // Check content patterns for transcript
  const transcriptPatterns = [
    /\*\*\w+\s*\(\d{1,2}:\d{2}\)\*\*:/,  // **Name (10:00):**
    /^\w+:\s+/m,  // Name: at start of line
    /call_date:/i,
    /participants:/i,
  ];
  
  if (transcriptPatterns.some(pattern => pattern.test(content))) {
    return 'transcript';
  }
  
  // Check for setup notes
  const setupPatterns = [
    /setup\s+notes/i,
    /credentials?/i,
    /configuration/i,
    /initial\s+setup/i,
  ];
  
  const setupHeadings = sections.filter(s => 
    setupPatterns.some(pattern => pattern.test(s.heading))
  );
  
  if (setupHeadings.length > 0 || setupPatterns.some(pattern => pattern.test(content))) {
    return 'setup_notes';
  }
  
  // Check for documentation
  const docPatterns = [
    /table\s+of\s+contents/i,
    /api\s+reference/i,
    /introduction/i,
    /getting\s+started/i,
  ];
  
  const docHeadings = sections.filter(s => 
    docPatterns.some(pattern => pattern.test(s.heading))
  );
  
  if (docHeadings.length >= 2) {
    return 'documentation';
  }
  
  return 'general';
}

/**
 * Extract title from frontmatter or first heading
 */
function extractTitle(
  frontmatter: Record<string, any> | undefined,
  sections: Section[]
): string {
  // Check frontmatter first
  if (frontmatter?.title) {
    return frontmatter.title;
  }
  
  // Find first H1 heading
  const firstH1 = sections.find(s => s.level === 1);
  if (firstH1) {
    return firstH1.heading;
  }
  
  // Find first heading of any level
  const firstHeading = sections.find(s => s.heading);
  if (firstHeading) {
    return firstHeading.heading;
  }
  
  // Default title
  return 'Untitled Document';
}
