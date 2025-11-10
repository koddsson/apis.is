#!/usr/bin/env node

/**
 * Script to parse a GitHub issue and add a meetup to meetups.json
 * 
 * Usage: node add-meetup.js <issue-body>
 */

const fs = require('fs');
const path = require('path');

function parseIssueBody(issueBody) {
  const lines = issueBody.split('\n');
  const meetup = {
    title: '',
    description: null,
    url: '',
    data: {
      start: '',
      end: null
    }
  };

  let currentField = null;
  let descriptionLines = [];
  let skipEmptyLine = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for field headers
    if (line === '### Meetup Title') {
      currentField = 'title';
      skipEmptyLine = true;
      continue;
    } else if (line === '### Description') {
      currentField = 'description';
      descriptionLines = [];
      skipEmptyLine = true;
      continue;
    } else if (line === '### Event URL') {
      // Save accumulated description
      if (descriptionLines.length > 0) {
        const desc = descriptionLines.join('\n').trim();
        meetup.description = desc === '_No response_' ? null : desc;
      }
      currentField = 'url';
      skipEmptyLine = true;
      continue;
    } else if (line === '### Start Date and Time') {
      currentField = 'start';
      skipEmptyLine = true;
      continue;
    } else if (line === '### End Date and Time') {
      currentField = 'end';
      skipEmptyLine = true;
      continue;
    }

    // Skip the first empty line after a header
    if (skipEmptyLine && line === '') {
      skipEmptyLine = false;
      continue;
    }

    // Capture the value after the field header
    if (currentField && line && !line.startsWith('###')) {
      if (currentField === 'title') {
        meetup.title = line;
        currentField = null;
      } else if (currentField === 'description') {
        descriptionLines.push(lines[i]); // Use original line with whitespace
      } else if (currentField === 'url') {
        meetup.url = line;
        currentField = null;
      } else if (currentField === 'start') {
        meetup.data.start = line;
        currentField = null;
      } else if (currentField === 'end') {
        meetup.data.end = line === '_No response_' ? null : line;
        currentField = null;
      }
    }
  }

  // Save description if it wasn't saved yet
  if (descriptionLines.length > 0 && meetup.description === null) {
    const desc = descriptionLines.join('\n').trim();
    meetup.description = desc === '_No response_' ? null : desc;
  }

  return meetup;
}

function validateMeetup(meetup) {
  const errors = [];

  if (!meetup.title || meetup.title.trim() === '') {
    errors.push('Title is required');
  }

  if (!meetup.url || meetup.url.trim() === '') {
    errors.push('URL is required');
  } else if (!meetup.url.match(/^https?:\/\/.+/)) {
    errors.push('URL must be a valid HTTP(S) URL');
  }

  if (!meetup.data.start || meetup.data.start.trim() === '') {
    errors.push('Start date is required');
  } else {
    // Validate ISO 8601 format
    const date = new Date(meetup.data.start);
    if (isNaN(date.getTime())) {
      errors.push('Start date must be in ISO 8601 format');
    }
  }

  if (meetup.data.end && meetup.data.end.trim() !== '') {
    const date = new Date(meetup.data.end);
    if (isNaN(date.getTime())) {
      errors.push('End date must be in ISO 8601 format');
    }
  }

  return errors;
}

function addMeetupToJson(meetup) {
  const jsonPath = path.join(__dirname, '../../src/data/meetups.json');
  
  // Read existing meetups
  let meetups = [];
  try {
    const data = fs.readFileSync(jsonPath, 'utf8');
    meetups = JSON.parse(data);
  } catch (error) {
    console.error('Error reading meetups.json:', error.message);
    process.exit(1);
  }

  // Add new meetup to the beginning
  meetups.unshift(meetup);

  // Write back to file with proper formatting
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(meetups, null, 2) + '\n', 'utf8');
    console.log('✅ Meetup added successfully!');
  } catch (error) {
    console.error('Error writing meetups.json:', error.message);
    process.exit(1);
  }
}

// Main execution
const issueBody = process.env.ISSUE_BODY || process.argv[2];

if (!issueBody) {
  console.error('Error: No issue body provided');
  console.error('Usage: node add-meetup.js <issue-body>');
  process.exit(1);
}

const meetup = parseIssueBody(issueBody);
const errors = validateMeetup(meetup);

if (errors.length > 0) {
  console.error('❌ Validation errors:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log('Parsed meetup:');
console.log(JSON.stringify(meetup, null, 2));

addMeetupToJson(meetup);
