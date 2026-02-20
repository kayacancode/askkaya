/**
 * Markdown Parser Tests
 * 
 * Tests for parsing markdown documents and extracting structure
 */

import { parseMarkdown, ParsedDocument, Section, DocumentType } from '../../src/processing/parser';

describe('Markdown Parser', () => {
  describe('YAML Frontmatter Extraction', () => {
    it('should extract YAML frontmatter if present', () => {
      const markdown = `---
title: Test Document
author: John Doe
date: 2024-01-15
tags: [setup, vapi, webhooks]
---

# Main Content

This is the content.`;

      const result = parseMarkdown(markdown);

      expect(result.frontmatter).toBeDefined();
      expect(result.frontmatter?.title).toBe('Test Document');
      expect(result.frontmatter?.author).toBe('John Doe');
      expect(result.frontmatter?.date).toBe('2024-01-15');
      expect(result.frontmatter?.tags).toEqual(['setup', 'vapi', 'webhooks']);
    });

    it('should handle documents without frontmatter', () => {
      const markdown = `# Document Title

This is a document without frontmatter.`;

      const result = parseMarkdown(markdown);

      expect(result.frontmatter).toBeUndefined();
      expect(result.title).toBe('Document Title');
    });

    it('should handle empty frontmatter', () => {
      const markdown = `---
---

# Content`;

      const result = parseMarkdown(markdown);

      expect(result.frontmatter).toBeDefined();
      expect(Object.keys(result.frontmatter || {}).length).toBe(0);
    });

    it('should parse frontmatter with nested objects', () => {
      const markdown = `---
title: Complex Document
metadata:
  client: acme-corp
  project: integration
  phase: 1
---

# Content`;

      const result = parseMarkdown(markdown);

      expect(result.frontmatter).toBeDefined();
      expect(result.frontmatter?.metadata).toBeDefined();
      expect(result.frontmatter?.metadata.client).toBe('acme-corp');
      expect(result.frontmatter?.metadata.project).toBe('integration');
    });
  });

  describe('Heading Hierarchy Extraction', () => {
    it('should extract heading hierarchy with correct levels', () => {
      const markdown = `# Main Title

Some content

## Section 1

Content 1

### Subsection 1.1

Content 1.1

### Subsection 1.2

Content 1.2

## Section 2

Content 2`;

      const result = parseMarkdown(markdown);

      expect(result.sections).toHaveLength(5);
      
      expect(result.sections[0]).toMatchObject({
        heading: 'Main Title',
        level: 1
      });
      
      expect(result.sections[1]).toMatchObject({
        heading: 'Section 1',
        level: 2
      });
      
      expect(result.sections[2]).toMatchObject({
        heading: 'Subsection 1.1',
        level: 3
      });
    });

    it('should include content for each section', () => {
      const markdown = `# Title

Introduction text

## Setup

Setup instructions here

## Configuration

Config details here`;

      const result = parseMarkdown(markdown);

      expect(result.sections[0].content).toContain('Introduction text');
      expect(result.sections[1].content).toContain('Setup instructions here');
      expect(result.sections[2].content).toContain('Config details here');
    });

    it('should handle headings with special characters', () => {
      const markdown = `# Getting Started with VAPI & Webhooks

Content

## OAuth 2.0 Setup (Advanced)

More content`;

      const result = parseMarkdown(markdown);

      expect(result.sections[0].heading).toBe('Getting Started with VAPI & Webhooks');
      expect(result.sections[1].heading).toBe('OAuth 2.0 Setup (Advanced)');
    });

    it('should handle sections with code blocks', () => {
      const markdown = `# API Reference

## Example

Here's an example:

\`\`\`javascript
const result = await api.call();
console.log(result);
\`\`\`

That's it!`;

      const result = parseMarkdown(markdown);

      expect(result.sections[1].content).toContain('```javascript');
      expect(result.sections[1].content).toContain('const result = await api.call();');
      expect(result.sections[1].content).toContain('```');
    });

    it('should handle sections with lists', () => {
      const markdown = `# Features

## List of Features

- Feature 1
- Feature 2
  - Sub-feature 2.1
  - Sub-feature 2.2
- Feature 3

1. First item
2. Second item
3. Third item`;

      const result = parseMarkdown(markdown);

      expect(result.sections[1].content).toContain('- Feature 1');
      expect(result.sections[1].content).toContain('- Sub-feature 2.1');
      expect(result.sections[1].content).toContain('1. First item');
    });
  });

  describe('Document Type Identification', () => {
    it('should identify transcript type from frontmatter', () => {
      const markdown = `---
type: transcript
call_date: 2024-01-15
participants: [john, jane]
---

# Call Transcript

John: Hello
Jane: Hi there`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('transcript');
    });

    it('should identify transcript from content patterns', () => {
      const markdown = `# Client Call - Jan 15, 2024

**John (10:00):** We need to discuss the integration.

**Jane (10:02):** Sure, let's go through the requirements.

**John (10:05):** The main issue is with the webhook configuration.`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('transcript');
    });

    it('should identify setup_notes type from frontmatter', () => {
      const markdown = `---
type: setup_notes
client: acme-corp
date: 2024-01-15
---

# Setup Notes

Initial setup configuration for ACME Corp.`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('setup_notes');
    });

    it('should identify setup_notes from heading patterns', () => {
      const markdown = `# Setup Notes for VAPI Integration

## Initial Configuration

- API Key: xxx
- Webhook URL: https://...

## Credentials

Username: admin`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('setup_notes');
    });

    it('should identify documentation type from frontmatter', () => {
      const markdown = `---
type: documentation
category: api-reference
---

# API Documentation

## Endpoints

### GET /api/v1/users`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('documentation');
    });

    it('should identify documentation from structure patterns', () => {
      const markdown = `# VAPI Integration Guide

## Table of Contents

- [Introduction](#introduction)
- [Setup](#setup)
- [API Reference](#api-reference)

## Introduction

This guide covers...

## Setup

To set up VAPI...

## API Reference

### Authentication`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('documentation');
    });

    it('should default to general type for unknown patterns', () => {
      const markdown = `# Random Notes

Just some random thoughts and notes.`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('general');
    });

    it('should identify general type for mixed content', () => {
      const markdown = `# Meeting Notes

We discussed various topics today.

## Action Items

- Follow up with client
- Update documentation

## Random Thoughts

Some ideas for the future.`;

      const result = parseMarkdown(markdown);

      expect(result.documentType).toBe('general');
    });
  });

  describe('ParsedDocument Structure', () => {
    it('should return ParsedDocument with all required fields', () => {
      const markdown = `---
title: Complete Document
---

# Main Title

## Section 1

Content`;

      const result = parseMarkdown(markdown);

      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('frontmatter');
      expect(result).toHaveProperty('sections');
      expect(result).toHaveProperty('documentType');
      
      expect(Array.isArray(result.sections)).toBe(true);
    });

    it('should extract title from frontmatter if present', () => {
      const markdown = `---
title: Frontmatter Title
---

# Heading Title

Content`;

      const result = parseMarkdown(markdown);

      expect(result.title).toBe('Frontmatter Title');
    });

    it('should extract title from first H1 heading if no frontmatter', () => {
      const markdown = `# First Heading

Content

# Second Heading

More content`;

      const result = parseMarkdown(markdown);

      expect(result.title).toBe('First Heading');
    });

    it('should handle documents with no title', () => {
      const markdown = `Just some content without any heading.

More content here.`;

      const result = parseMarkdown(markdown);

      expect(result.title).toBeDefined();
      expect(typeof result.title).toBe('string');
    });
  });

  describe('Section Structure', () => {
    it('should return Section with heading, level, and content', () => {
      const markdown = `# Title

## Section

Content here`;

      const result = parseMarkdown(markdown);

      result.sections.forEach(section => {
        expect(section).toHaveProperty('heading');
        expect(section).toHaveProperty('level');
        expect(section).toHaveProperty('content');
        
        expect(typeof section.heading).toBe('string');
        expect(typeof section.level).toBe('number');
        expect(typeof section.content).toBe('string');
        expect(section.level).toBeGreaterThanOrEqual(1);
        expect(section.level).toBeLessThanOrEqual(6);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty markdown', () => {
      const markdown = '';

      const result = parseMarkdown(markdown);

      expect(result).toBeDefined();
      expect(result.sections).toHaveLength(0);
    });

    it('should handle markdown with only whitespace', () => {
      const markdown = '   \n\n   \n   ';

      const result = parseMarkdown(markdown);

      expect(result).toBeDefined();
      expect(result.sections.length).toBeLessThanOrEqual(1);
    });

    it('should handle very long documents', () => {
      let markdown = '# Title\n\n';
      for (let i = 0; i < 100; i++) {
        markdown += `## Section ${i}\n\nContent for section ${i}\n\n`;
      }

      const result = parseMarkdown(markdown);

      expect(result.sections.length).toBeGreaterThan(50);
    });

    it('should handle documents with unconventional spacing', () => {
      const markdown = `#Title
##Section
Content`;

      const result = parseMarkdown(markdown);

      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('should preserve inline code and formatting', () => {
      const markdown = `# Title

This has \`inline code\` and **bold** and *italic* text.`;

      const result = parseMarkdown(markdown);

      expect(result.sections[0].content).toContain('`inline code`');
      expect(result.sections[0].content).toContain('**bold**');
      expect(result.sections[0].content).toContain('*italic*');
    });
  });
});
