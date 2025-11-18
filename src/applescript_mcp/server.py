import argparse
import logging
import json
from typing import Any, Dict, List, Optional
import os
import tempfile
import subprocess
from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio
from pydantic import AnyUrl

logger = logging.getLogger('applescript_mcp')


def parse_arguments() -> argparse.Namespace:
    """Use argparse to allow values to be set as CLI switches
    or environment variables

    """
    parser = argparse.ArgumentParser()
    parser.add_argument('--log-level', default=os.environ.get('LOG_LEVEL', 'INFO'))
    return parser.parse_args()


def configure_logging():
    """Configure logging based on the log level argument"""
    args = parse_arguments()
    log_level = getattr(logging, args.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    logger.setLevel(log_level)
    logger.info(f"Logging configured with level: {args.log_level.upper()}")


async def main():
    """Run the AppleScript MCP server."""
    configure_logging()
    logger.info("Server starting")
    server = Server("applescript-mcp")

    @server.list_resources()
    async def handle_list_resources() -> list[types.Resource]:
        return []

    @server.read_resource()
    async def handle_read_resource(uri: AnyUrl) -> str:
        return ""

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        """List available tools"""
        return [
            types.Tool(
                name="applescript_execute",
                description="""Execute AppleScript code to interact with macOS applications and system features. This tool provides direct access to Apple's automation framework.

CRITICAL REQUIREMENTS FOR APPLE NATIVE APPS:

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

IMPORTANT: Always use exact date/time formats specified above. Validate all required properties are included before execution. Use proper error handling for production scripts.""",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "code_snippet": {
                            "type": "string",
                            "description": """Complete AppleScript code to execute. Must follow all formatting requirements specified in the tool description, especially date/time formats for Reminders and Calendar apps. Include error handling where appropriate."""
                        },
                        "timeout": {
                            "type": "integer",
                            "description": "Command execution timeout in seconds (default: 60)"
                        }
                    },
                    "required": ["code_snippet"]
                },
            )
        ]

    @server.call_tool()
    async def handle_call_tool(
        name: str, arguments: dict[str, Any] | None
    ) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        """Handle execution of AppleScript to interact with Mac applications and data"""
        try:
            if name == "applescript_execute":
                if not arguments or "code_snippet" not in arguments:
                    raise ValueError("Missing code_snippet argument")

                # Get timeout parameter or use default
                timeout = arguments.get("timeout", 60)
                
                # Create temp file for the AppleScript
                with tempfile.NamedTemporaryFile(suffix='.scpt', delete=False) as temp:
                    temp_path = temp.name
                    try:
                        # Write the AppleScript to the temp file
                        temp.write(arguments["code_snippet"].encode('utf-8'))
                        temp.flush()
                        
                        # Execute the AppleScript
                        cmd = ["/usr/bin/osascript", temp_path]
                        result = subprocess.run(
                            cmd, 
                            capture_output=True, 
                            text=True, 
                            timeout=timeout
                        )
                        
                        if result.returncode != 0:
                            error_message = f"AppleScript execution failed: {result.stderr}"
                            return [types.TextContent(type="text", text=error_message)]
                        
                        return [types.TextContent(type="text", text=result.stdout)]
                    except subprocess.TimeoutExpired:
                        return [types.TextContent(type="text", text=f"AppleScript execution timed out after {timeout} seconds")]
                    except Exception as e:
                        return [types.TextContent(type="text", text=f"Error executing AppleScript: {str(e)}")]
                    finally:
                        # Clean up the temporary file
                        try:
                            os.unlink(temp_path)
                        except:
                            pass
            else:
                raise ValueError(f"Unknown tool: {name}")

        except Exception as e:
            return [types.TextContent(type="text", text=f"Error: {str(e)}")]

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        logger.info("Server running with stdio transport")
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="applescript-mcp",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
