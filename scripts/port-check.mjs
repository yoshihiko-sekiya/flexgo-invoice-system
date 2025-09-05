#!/usr/bin/env node
/**
 * Port 5173 Diagnostic Script
 * Quickly identifies what process is using port 5173
 */

import { execSync } from 'node:child_process';

try {
  const command = process.platform === 'darwin'
    ? "lsof -i tcp:5173"
    : process.platform === 'win32'
      ? "netstat -ano | findstr :5173"
      : "ss -lptn 'sport = :5173' || netstat -tulpn | grep :5173";
  
  const output = execSync(command, { stdio: 'pipe' }).toString();
  
  if (output.trim()) {
    console.log('🔍 Process using port 5173:');
    console.log(output);
    
    // Additional info for macOS
    if (process.platform === 'darwin' && output.includes('LISTEN')) {
      console.log('\n💡 To kill this process:');
      const lines = output.split('\n').filter(line => line.includes('LISTEN'));
      lines.forEach(line => {
        const pid = line.split(/\s+/)[1];
        if (pid && /^\d+$/.test(pid)) {
          console.log(`   kill ${pid}`);
        }
      });
    }
  } else {
    console.log('✅ No process found on port 5173');
  }
} catch (error) {
  console.log('✅ No process found on port 5173');
}