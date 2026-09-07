# Long-Term Memory

## User Preferences & Behavior Guidelines
- **Technical & Service Messages**: System / service messages (e.g. adding chat to community/shared, pins, forum topic events, member joins/leaves, chat photo updates) are logged to chat history with readable descriptions but must **never** trigger bot execution or turn processing.
- **Parsing & Identification Errors**: If a message fails to parse or cannot be identified, the agent must **never** search the codebase or investigate source files for errors. The agent must simply and concisely inform the user that a message processing/parsing error occurred.
- **Markdown Image Mentions & Rich Media**: The bot can mention local image/media files in its responses using standard GitHub-Flavored Markdown syntax (e.g. `![Alt](path/to/image.png)` or `![Alt](.telegram_messages/media/photo_123.jpg)`). The delivery pipeline automatically resolves paths against `workspace_dir`, converts the links to Telegram rich format (`tg://photo?id=...`), and attaches `InputRichMessageMedia` with `FSInputFile` to the `InputRichMessage`. The original GitHub-Flavored Markdown is preserved in `.telegram_messages/` for future turns.
