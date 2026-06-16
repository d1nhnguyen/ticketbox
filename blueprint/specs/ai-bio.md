# AI Bio Spec

## Description
Upload a PDF press-kit to extract the artist bio, leverage AI to format it into a summary, and save it against a concert.

## Main Flow
1. User uploads PDF.
2. Server extracts raw text locally.
3. Server prompts Gemini/OpenAI API with the text to summarize.
4. Server saves the generated bio to `Concert.artistBio`.

## Error Scenarios
- **PDF Parse Error**: Returns explicit 400 bad format.
- **AI Timeout/Policy Reject**: Logs error, alerts Admin UI, does not crash system.

## Constraints
- Do not block the main event loop while waiting for AI API. Let it run async or as a job.

## Acceptance Criteria
- Uploading `artist-presskit.pdf` eventually populates `Concert.artistBio` with summarized markdown.
