# AI Bio Spec

## 1. Description
A feature allowing Organizers to upload a PDF press-kit to extract the artist bio, leverage Generative AI (Anthropic, Gemini, or OpenAI) to summarize it, and save the polished bio against a concert.

## 2. Main Flow
1. **Upload**: Organizer uploads a PDF file via `POST /concerts/:id/upload-bio` on the Admin UI.
2. **Text Extraction**: The server uses `pdf-parse` to extract raw text from the uploaded PDF buffer locally.
3. **AI Provider Selection**: Based on the `AI_PROVIDER` environment variable, the system uses the `AiFactory` to instantiate the appropriate provider client (Anthropic, Gemini, or OpenAI).
4. **AI Generation**: The server sends the extracted text to the AI API with a prompt asking for a concise, engaging summary of the artist's biography in Markdown format.
5. **Persistence**: The generated Markdown text is saved to `Concert.artistBio` in PostgreSQL.
6. **Display**: The generated bio is rendered in the `ConcertDetail` page for the audience.

## 3. Error Scenarios
- **PDF Parse Error**: (e.g., corrupted file or password-protected) Returns `400 Bad Request`.
- **AI Timeout/Rate Limit**: The AI API might timeout. The backend catches the error, logs it, and returns a `500` or `502` to the Admin UI with a clear error message.
- **Missing API Keys**: If `AI_PROVIDER` or the required key is missing, the system gracefully falls back to inserting a placeholder text ("Tiểu sử đang được cập nhật...") instead of crashing.

## 4. Constraints
- **Asynchronous/Long Polling**: AI generation can take 5-15 seconds. The current implementation blocks the HTTP request and waits for the AI response. For scaling, this could be refactored to BullMQ, but it's acceptable for Admin usage.
- **Agnostic Architecture**: The system must be able to switch between Anthropic, Gemini, and OpenAI purely via `.env` without code changes.

## 5. Acceptance Criteria
- Uploading a valid `artist-presskit.pdf` successfully calls the AI provider and updates `Concert.artistBio`.
- Changing `AI_PROVIDER` in `.env` seamlessly switches the underlying AI model used.
- The UI gracefully shows a loading spinner during the AI wait time.
