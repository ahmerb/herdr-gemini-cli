#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const distCli = path.join(__dirname, '..', 'dist', 'cli', 'doctor.js');
if (!fs.existsSync(distCli)) {
  console.error('Error: herdr-gemini-cli build artifacts not found. Please run npm run build first.');
  process.exit(1);
}

require(distCli);
