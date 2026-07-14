import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { PDFParse } from 'pdf-parse';

/**
 * Hỗ trợ 3 AI provider, chọn qua biến môi trường AI_PROVIDER:
 *
 *  AI_PROVIDER=anthropic  → dùng ANTHROPIC_API_KEY  (mặc định)
 *  AI_PROVIDER=gemini     → dùng GEMINI_API_KEY
 *  AI_PROVIDER=openai     → dùng OPENAI_API_KEY
 *
 * Nếu AI_PROVIDER hoặc key tương ứng không được set → fallback template, không crash.
 */
type AiProvider = 'anthropic' | 'gemini' | 'openai';

@Injectable()
export class AiBioService {
  private readonly logger = new Logger(AiBioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async generateBio(concertId: string, pdf: Buffer): Promise<string> {
    // 1. Kiểm tra concert tồn tại
    const concert = await this.prisma.concert.findUnique({
      where: { id: concertId },
    });
    if (!concert) {
      throw new BadRequestException(`Concert ${concertId} not found`);
    }

    // 2. Extract text từ PDF
    const clean = await this.extractText(pdf, concertId);

    // 3. Gọi AI provider (hoặc fallback)
    const bio = await this.generate(concertId, clean);

    // 4. Lưu vào DB
    await this.prisma.concert.update({
      where: { id: concertId },
      data: { artistBio: bio },
    });

    this.logger.log(
      `Bio generated for concert ${concertId} (${bio.length} chars)`,
    );
    return bio;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async extractText(pdf: Buffer, concertId: string): Promise<string> {
    try {
      const parser = new PDFParse(new Uint8Array(pdf));
      const parsed = await parser.getText();
      const clean = (parsed.text ?? '').replace(/\s+/g, ' ').slice(0, 8000).trim();
      if (!clean) {
        throw new BadRequestException('File PDF không có nội dung văn bản.');
      }
      return clean;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`PDF parse failed for concert ${concertId}: ${err}`);
      throw new BadRequestException(
        `Không thể đọc file PDF. Lỗi chi tiết: ${err.message}`,
      );
    }
  }

  private async generate(concertId: string, clean: string): Promise<string> {
    const provider = (
      this.configService.get<string>('AI_PROVIDER') ?? 'anthropic'
    ).toLowerCase() as AiProvider;

    const prompt = `Viết một đoạn giới thiệu về Concert có các nghệ sĩ (4-5 câu, tiếng Việt) từ press kit sau:\n\n${clean}`;

    try {
      switch (provider) {
        case 'gemini':
          return await this.callGemini(prompt);
        case 'openai':
          return await this.callOpenAI(prompt);
        case 'anthropic':
        default:
          return await this.callAnthropic(prompt);
      }
    } catch (err) {
      this.logger.error(`AI provider "${provider}" failed: ${err}`);
      return this.buildFallback(concertId, clean);
    }
  }

  // ---------------------------------------------------------------------------
  // Provider: Anthropic (claude-haiku)
  // ---------------------------------------------------------------------------

  private async callAnthropic(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not set — switching to fallback');
      throw new Error('No API key');
    }

    const model =
      this.configService.get<string>('AI_MODEL') ?? 'claude-haiku-4-5-20251001';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      content: { type: string; text: string }[];
    };
    return data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  // ---------------------------------------------------------------------------
  // Provider: Google Gemini (REST API)
  // ---------------------------------------------------------------------------

  private async callGemini(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — switching to fallback');
      throw new Error('No API key');
    }

    const model =
      this.configService.get<string>('AI_MODEL') ?? 'gemini-3.1-flash-lite';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };

    return (
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .join('')
        .trim() ?? ''
    );
  }

  // ---------------------------------------------------------------------------
  // Provider: OpenAI (gpt-4o-mini)
  // ---------------------------------------------------------------------------

  private async callOpenAI(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — switching to fallback');
      throw new Error('No API key');
    }

    const model =
      this.configService.get<string>('AI_MODEL') ?? 'gpt-4o-mini';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  // ---------------------------------------------------------------------------
  // Fallback
  // ---------------------------------------------------------------------------

  /** Trả về preview text khi không có key hoặc API lỗi — không crash. */
  private buildFallback(concertId: string, clean: string): string {
    const preview = clean.slice(0, 200).replace(/\n/g, ' ').trim();
    return (
      `[Auto-generated] ${preview}…` +
      ` (Concert ID: ${concertId}. Bio đầy đủ sẽ có khi AI_PROVIDER và key tương ứng được cấu hình trong .env.)`
    );
  }
}
// Trigger hot reload
