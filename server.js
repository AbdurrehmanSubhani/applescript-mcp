#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { NodeSSH } from 'node-ssh';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  remoteHost: 'localhost',
  remotePassword: '',
  remoteUser: '',
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--remoteHost' && i + 1 < args.length) {
    config.remoteHost = args[i + 1];
    i++;
  } else if (args[i] === '--remotePassword' && i + 1 < args.length) {
    config.remotePassword = args[i + 1];
    i++;
  } else if (args[i] === '--remoteUser' && i + 1 < args.length) {
    config.remoteUser = args[i + 1];
    i++;
  }
}

// Initialize logging
const logLevels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor(name) {
    this.name = name;
    this.logLevel = process.env.LOG_LEVEL ? 
      logLevels[(process.env.LOG_LEVEL || 'INFO').toUpperCase()] : 
      logLevels.INFO;
  }

  log(level, message) {
    if (logLevels[level] <= this.logLevel) {
      const timestamp = new Date().toISOString();
      console.error(`${timestamp} - ${this.name} - ${level} - ${message}`);
    }
  }

  info(message) { this.log('INFO', message); }
  warn(message) { this.log('WARN', message); }
  error(message) { this.log('ERROR', message); }
  debug(message) { this.log('DEBUG', message); }
}

const logger = new Logger('applescript-mcp');

async function executeAppleScript(code, timeout = 60) {
  // Check if all remote credentials are available for SSH execution
  const useRemote = config.remoteHost && config.remoteHost !== 'localhost' &&
                    config.remoteUser && config.remotePassword;
  
  if (useRemote) {
    return executeRemoteAppleScript(code, timeout);
  } else {
    return executeLocalAppleScript(code, timeout);
  }
}

async function executeLocalAppleScript(code, timeout = 60) {
  // Create a temporary file for the AppleScript
  const tempPath = path.join(os.tmpdir(), `applescript_${Date.now()}.scpt`);
  
  try {
    // Write the AppleScript to the temporary file
    fs.writeFileSync(tempPath, code);
    
    // Execute the AppleScript
    return new Promise((resolve, reject) => {
      exec(`/usr/bin/osascript "${tempPath}"`, { timeout: timeout * 1000 }, (error, stdout, stderr) => {
        // Clean up the temporary file
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          logger.warn(`Failed to delete temporary file: ${e.message}`);
        }
        
        if (error) {
          if (error.killed) {
            resolve(`AppleScript execution timed out after ${timeout} seconds`);
          } else {
            resolve(`AppleScript execution failed: ${stderr}`);
          }
        } else {
          resolve(stdout);
        }
      });
    });
  } catch (e) {
    return `Error executing AppleScript: ${e.message}`;
  }
}

async function executeRemoteAppleScript(code, timeout = 60) {
  logger.info(`Executing AppleScript on remote host: ${config.remoteHost}`);
  
  // Create a temporary file for the AppleScript
  const localTempPath = path.join(os.tmpdir(), `applescript_${Date.now()}.scpt`);
  const remoteTempPath = `/tmp/applescript_${Date.now()}.scpt`;
  
  try {
    // Write the AppleScript to the temporary file
    fs.writeFileSync(localTempPath, code);
    
    // Initialize SSH client
    const ssh = new NodeSSH();
    
    // Connect to remote host
    try {
      await ssh.connect({
        host: config.remoteHost,
        username: config.remoteUser,
        password: config.remotePassword,
        // Useful when password auth fails and you need to try keyboard-interactive
        tryKeyboard: true,
        onKeyboardInteractive: (name, instructions, lang, prompts, finish) => {
          if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
            finish([config.remotePassword]);
          }
        }
      });
      
      logger.info('SSH connection established successfully');
      
      // Upload the AppleScript file
      await ssh.putFile(localTempPath, remoteTempPath);
      
      // Execute the AppleScript on the remote machine
      const result = await ssh.execCommand(`/usr/bin/osascript "${remoteTempPath}"`, {
        timeout: timeout * 1000
      });
      
      // Clean up the remote file
      await ssh.execCommand(`rm -f "${remoteTempPath}"`);
      
      // Clean up the local file
      try {
        fs.unlinkSync(localTempPath);
      } catch (e) {
        logger.warn(`Failed to delete local temporary file: ${e.message}`);
      }
      
      // Disconnect from the remote host
      ssh.dispose();
      
      if (result.code !== 0) {
        return `Remote AppleScript execution failed: ${result.stderr}`;
      }
      
      return result.stdout;
    } catch (sshError) {
      // Clean up the local file on error
      try {
        fs.unlinkSync(localTempPath);
      } catch (e) {
        logger.warn(`Failed to delete local temporary file: ${e.message}`);
      }
      
      return `SSH error: ${sshError.message}`;
    }
  } catch (e) {
    return `Error executing remote AppleScript: ${e.message}`;
  }
}

async function main() {
  logger.info('Starting AppleScript MCP server');
  logger.info(`Using remote host: ${config.remoteHost}`);
  logger.info(`Remote user: ${config.remoteUser || 'not set'}`);
  logger.info(`Remote password ${config.remotePassword ? 'is' : 'is not'} set`);

  const currentDate = new Date();
  const formattedDateTime = currentDate.toLocaleString();
  
  try {
    // Create the server
    const server = new McpServer({
      name: 'AppleScript MCP',
      version: '0.1.0'
    });
    
    // Define the tool
    server.tool(
      'applescript_execute',
      `
Execute AppleScript code to interact with macOS applications and system features. This tool provides direct access to Apple's automation framework.

CRITICAL REQUIREMENTS FOR APPLE NATIVE APPS:

# CRITICAL:
- PLEASE ENSURE YOU USE THE CURRENT DATE AS BASE FOR ALL DATE AND TIME RELATED TASKS
- THE CURRENT DATE AND TIME IS: ${formattedDateTime}

## REMINDERS APP
- Date/Time Format: Use 'date "MM/DD/YYYY HH:MM:SS AM/PM"' format
  Example: date "12/25/2024 2:30:00 PM"
- Due dates MUST include time component even if just using date
- Priority levels: 0 (none), 1-4 (high), 5 (medium), 6-9 (low)
- Creating reminders: Specify list name, due date, priority, and body
- Example: tell application "Reminders" to make new reminder with properties {name:"Task", due date:date "11/20/2025 9:00:00 AM", priority:5, body:"Details"}

## CALENDAR APP
- Date Format: 'date "MM/DD/YYYY HH:MM:SS AM/PM"'
- Required properties: summary (title), start date, end date
- Location is optional but recommended for location-based events
- Example: tell application "Calendar" to tell calendar "Work" to make new event with properties {summary:"Meeting", start date:date "11/20/2025 2:00:00 PM", end date:date "11/20/2025 3:00:00 PM", location:"Office"}
- All-day events: Set allday event property to true and use midnight times

## NOTES APP
- Creating notes: Specify name (title) and body (content)
- Body content supports HTML formatting
- Folder/account structure: tell account "iCloud" to tell folder "Personal"
- Example: tell application "Notes" to make new note with properties {name:"Title", body:"Content"}
- Retrieving notes: Access by name, modification date, or iterate through all notes
- Note body returns HTML, extract text if needed

## CONTACTS APP
- Required for new contact: first name or last name (at minimum one)
- Common properties: first name, last name, organization, emails, phones, addresses
- Email format: make new email with properties {label:"work", value:"email@example.com"}
- Phone format: make new phone with properties {label:"mobile", value:"555-1234"}
- Address format: Specify street, city, state, zip, country as separate properties
- Example: make new person with properties {first name:"John", last name:"Doe", organization:"Company"}

## MAIL APP
- Creating messages: Specify subject, content, visible (true/false)
- Recipients: make new to recipient with properties {address:"email@example.com"}
- Sending: Must set visible to true, then send the message
- Example structure:
  tell application "Mail"
    set newMsg to make new outgoing message with properties {subject:"Test", content:"Body", visible:true}
    tell newMsg to make new to recipient with properties {address:"test@example.com"}
    send newMsg
  end tell

## MESSAGES APP
- Sending messages: tell service "iMessage" to send "message text" to buddy "recipient"
- Use phone numbers or email addresses as buddy identifiers
- For phone numbers, include country code format: "+1234567890"
- Check if service is available before sending

## FINDER
- File paths: Use POSIX file paths with "POSIX file" keyword
  Example: POSIX file "/Users/username/Documents/file.txt"
- Alias conversion: Set variables as 'alias' type for file references
- Getting file info: name, size, creation date, modification date, kind
- Spotlight search: Use 'whose' clauses for filtering
- Example: tell application "Finder" to get files of folder (path to documents folder) whose name contains "report"

## SAFARI
- Current tab/URL: tell application "Safari" to get URL of current tab of front window
- Opening URLs: tell application "Safari" to open location "https://example.com"
- Tab management: make new tab, close tab, get name/URL of tabs
- Reading content: Get source or text of documents

## SYSTEM INFORMATION
- Battery: 'do shell script "pmset -g batt"' for battery status
- Disk space: tell application "Finder" to get free space of startup disk
- Volume: 'get volume settings' or 'set volume output volume X' (0-100)
- WiFi: 'do shell script "networksetup -getairportnetwork en0"'
- Current app: tell application "System Events" to get name of first process whose frontmost is true

## GENERAL APPLESCRIPT BEST PRACTICES
- Always wrap application names in quotes: tell application "Notes"
- Use 'with properties' for setting multiple properties at creation
- Error handling: Wrap risky operations in try/on error blocks
- String escaping: Use backslash for quotes inside strings: "He said \"hello\""
- Getting current date: 'current date' returns date object
- Date arithmetic: Add/subtract time (days, hours, minutes, seconds)
  Example: (current date) + (2 * days)
- Checking app running: tell application "System Events" to get exists of process "AppName"

## SHELL COMMAND EXECUTION
- Execute via: do shell script "command here"
- Capture output directly as return value
- Admin privileges: do shell script "command" with administrator privileges
- Multi-line commands: Use semicolons or '& return &' for line breaks
- Environment: Specify with 'with environment' parameter if needed

## FILE OPERATIONS
- Reading files: read (POSIX file "/path/to/file") as «class utf8»
- Writing files: set fileRef to open for access POSIX file "/path" with write permission
- Closing: close access fileRef
- File existence: tell application "System Events" to exists disk item "/path"

## COMMON PATTERNS
- Iteration: repeat with item in collection ... end repeat
- Conditionals: if condition then ... else ... end if
- Variables: set varName to value
- Lists: {item1, item2, item3}
- Records: {key1:value1, key2:value2}

IMPORTANT: Always use exact date/time formats specified above. Validate all required properties are included before execution. Use proper error handling for production scripts.
  `,
      {
        code_snippet: z.string().describe('Multi-line appleScript code to execute'),
        timeout: z.number().optional().describe('Command execution timeout in seconds (default: 60)')
      },
      async ({ code_snippet, timeout = 60 }) => {
        logger.info(`Executing AppleScript with timeout ${timeout}s`);
        
        if (!code_snippet) {
          return {
            content: [{ type: 'text', text: 'Error: Missing code_snippet argument' }]
          };
        }
        
        try {
          // Inject configuration variables into the AppleScript environment if needed
          if (code_snippet.includes('{{REMOTE_HOST}}')) {
            code_snippet = code_snippet.replace(/\{\{REMOTE_HOST\}\}/g, config.remoteHost);
          }
          
          if (code_snippet.includes('{{REMOTE_PASSWORD}}')) {
            code_snippet = code_snippet.replace(/\{\{REMOTE_PASSWORD\}\}/g, config.remotePassword);
          }
          
          if (code_snippet.includes('{{REMOTE_USER}}')) {
            code_snippet = code_snippet.replace(/\{\{REMOTE_USER\}\}/g, config.remoteUser);
          }
          
          const result = await executeAppleScript(code_snippet, timeout);
          return {
            content: [{ type: 'text', text: result }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }]
          };
        }
      }
    );
    
    // Use STDIO transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('MCP server started and ready to receive requests');
  } catch (error) {
    logger.error(`Error starting server: ${error.message}`);
    process.exit(1);
  }
}

// Start the server
main(); 
