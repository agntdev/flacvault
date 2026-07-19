# FLACShare Bot — Bot specification

**Archetype:** community

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A community-focused Telegram bot for sharing and managing FLAC audio files. Users submit FLAC files (via upload or link) which are validated, cataloged with metadata, and made available for browsing and retrieval. Admins moderate submissions, manage tags, and receive notifications for new tracks. The bot supports direct file delivery and optional temporary HTTP download links while enforcing FLAC-only content policies.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Private group members
- Community admins

## Success criteria

- Enforces FLAC-only uploads with clear validation messages
- Stores and serves tracks with metadata retention across restarts
- Delivers tracks via Telegram or temporary HTTP links (7-day default)
- Notifies admins of new submissions with approval/rejection controls

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu with available actions
  - outputs: main menu interface
- **/browse** (command, actor: user, command: /browse) — Browse tracks by tags/genres
  - outputs: tag list interface
- **/recent** (command, actor: user, command: /recent) — View recently submitted tracks
  - outputs: track list interface
- **/search** (command, actor: user, command: /search) — Search tracks by title/artist/album
  - inputs: search term
  - outputs: track list interface
- **/myuploads** (command, actor: user, command: /myuploads) — View user's own submissions
  - outputs: track list interface
- **Submit Track** (button, actor: user, callback: submit:start) — Initiate track submission process
  - inputs: FLAC file
  - outputs: upload confirmation
- **Approve** (button, actor: admin, callback: moderation:approve) — Approve pending submission
  - inputs: submission ID
  - outputs: track approval confirmation
- **Reject** (button, actor: admin, callback: moderation:reject) — Reject pending submission with optional reason
  - inputs: submission ID, rejection reason
  - outputs: track rejection confirmation

## Flows

### Track submission
_Trigger:_ User sends FLAC file to bot or group with @mention

1. Validate FLAC format
2. Extract metadata
3. Prompt user for missing metadata
4. Store track in collection
5. Notify admins with moderation buttons

_Data touched:_ Track, Submission

### Track retrieval
_Trigger:_ User selects 'Send' or 'Link' from track card

1. Verify user permissions
2. Generate temporary HTTP link (if enabled)
3. Deliver file via Telegram or share link

_Data touched:_ Track

### Admin moderation
_Trigger:_ New submission notification

1. Admin views submission summary
2. Admin approves/rejects via buttons
3. Update track status and notify submitter

_Data touched:_ Track, Submission

### Metadata management
_Trigger:_ /browse or /search results

1. Display track cards with metadata
2. Handle 'Edit Info' (admin only)
3. Handle 'Add Tag' (admin only)

_Data touched:_ Track

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram account with member/admin role
  - fields: telegram_id, role
- **Track** _(retention: persistent)_ — Stored FLAC file with metadata
  - fields: title, artist, album, duration, file_size, upload_timestamp, uploader_id, tags, cover_art, file_path
- **Submission** _(retention: persistent)_ — Pending track submission with moderation status
  - fields: track_id, status, admin_notes

## Integrations

- **Telegram** (required) — Bot API messaging, file delivery, and inline buttons
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure admin accounts
- Set default commands/UI
- Define storage retention policies
- Manage access control

## Notifications

- Admin private messages for new submissions
- User notifications for approval status changes
- Temporary link expiration alerts (if enabled)

## Permissions & privacy

- Restrict bot access to verified group members
- Secure admin moderation permissions
- Protect user metadata privacy
- Expire temporary HTTP links after 7 days

## Edge cases

- Non-FLAC file uploads
- Incomplete metadata submission
- Admin rejection with custom reason
- Expired download link requests
- Concurrent moderation actions on same submission

## Required tests

- End-to-end submission validation flow
- Admin notification and moderation workflow
- Track search and tag filtering accuracy
- File delivery reliability across restarts

## Assumptions

- Private community access controlled by owner-configured whitelist
- HTTP link generation requires unspecified external file-serving infrastructure
- Default 7-day link expiration unless owner specifies otherwise
- Metadata prompts are limited to one-time confirmation to minimize friction
