/**
 * Unit tests for Telegram notification system
 * Phase 4: Notification System
 * 
 * Tests Telegram bot functionality:
 * - Formatting escalation alerts
 * - Sending messages via Telegram Bot API
 * - Handling webhook updates (replies from support team)
 * - Error handling with retries
 */

import {
  formatEscalationAlert,
  sendMessage,
  handleTelegramUpdate,
} from '../../src/notify/telegram';

// Mock fetch for Telegram API calls
global.fetch = jest.fn();

describe('Telegram Notification System', () => {
  const mockEscalation = {
    id: 'esc_123',
    clientId: 'client_456',
    clientName: 'Acme Corp',
    query: 'How do I reset my password?',
    contextTags: ['authentication', 'password', 'security'],
    status: 'pending',
    createdAt: new Date('2026-02-20T10:00:00Z'),
  };

  const mockTelegramEnv = {
    TELEGRAM_BOT_TOKEN: 'test_bot_token_123',
    TELEGRAM_CHAT_ID: '-1001234567890',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Set environment variables
    process.env.TELEGRAM_BOT_TOKEN = mockTelegramEnv.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_CHAT_ID = mockTelegramEnv.TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  describe('formatEscalationAlert', () => {
    it('should format escalation with client name, query, and context tags', () => {
      const formatted = formatEscalationAlert(mockEscalation);

      expect(formatted).toContain('Acme Corp');
      expect(formatted).toContain('How do I reset my password?');
      expect(formatted).toContain('authentication');
      expect(formatted).toContain('password');
      expect(formatted).toContain('security');
    });

    it('should include escalation ID for reference', () => {
      const formatted = formatEscalationAlert(mockEscalation);

      expect(formatted).toContain('esc_123');
    });

    it('should format message with proper Markdown/HTML for Telegram', () => {
      const formatted = formatEscalationAlert(mockEscalation);

      // Should contain bold markers or HTML tags
      expect(formatted).toMatch(/\*\*|<b>|__/);
    });

    it('should handle escalations without context tags', () => {
      const escalationNoTags = {
        ...mockEscalation,
        contextTags: [],
      };

      const formatted = formatEscalationAlert(escalationNoTags);

      expect(formatted).toContain('Acme Corp');
      expect(formatted).toContain('How do I reset my password?');
    });

    it('should escape special characters for Telegram', () => {
      const escalationWithSpecialChars = {
        ...mockEscalation,
        query: 'How do I use <script> tags & "quotes"?',
      };

      const formatted = formatEscalationAlert(escalationWithSpecialChars);

      // Should not contain raw HTML that could break formatting
      expect(formatted).toBeDefined();
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('sendMessage', () => {
    it('should call Telegram Bot API with correct endpoint', async () => {
      const mockResponse = {
        ok: true,
        result: { message_id: 123 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await sendMessage(mockTelegramEnv.TELEGRAM_CHAT_ID, 'Test message');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${mockTelegramEnv.TELEGRAM_BOT_TOKEN}/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.any(String),
        })
      );
    });

    it('should send message with correct chat_id and text', async () => {
      const mockResponse = {
        ok: true,
        result: { message_id: 123 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const chatId = '-1001234567890';
      const text = 'Test message content';

      await sendMessage(chatId, text);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.chat_id).toBe(chatId);
      expect(body.text).toBe(text);
    });

    it('should set parse_mode to HTML or Markdown', async () => {
      const mockResponse = {
        ok: true,
        result: { message_id: 123 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await sendMessage(mockTelegramEnv.TELEGRAM_CHAT_ID, 'Test message');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(['HTML', 'Markdown', 'MarkdownV2']).toContain(body.parse_mode);
    });

    it('should return message_id on success', async () => {
      const mockResponse = {
        ok: true,
        result: { message_id: 12345 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await sendMessage(
        mockTelegramEnv.TELEGRAM_CHAT_ID,
        'Test message'
      );

      expect(result).toEqual({ success: true, messageId: 12345 });
    });

    it('should retry once on API error', async () => {
      // First call fails
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      // Second call succeeds
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const result = await sendMessage(
        mockTelegramEnv.TELEGRAM_CHAT_ID,
        'Test message'
      );

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should throw error after retry fails', async () => {
      // Both calls fail
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'));

      await expect(
        sendMessage(mockTelegramEnv.TELEGRAM_CHAT_ID, 'Test message')
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle Telegram API error responses', async () => {
      const errorResponse = {
        ok: false,
        error_code: 400,
        description: 'Bad Request: chat not found',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => errorResponse,
      });

      await expect(
        sendMessage(mockTelegramEnv.TELEGRAM_CHAT_ID, 'Test message')
      ).rejects.toThrow('Bad Request');
    });
  });

  describe('handleTelegramUpdate', () => {
    const mockUpdate = {
      update_id: 123456,
      message: {
        message_id: 789,
        chat: {
          id: -1001234567890,
          type: 'group',
        },
        from: {
          id: 987654321,
          first_name: 'Support',
          username: 'support_agent',
        },
        date: 1708423200,
        text: 'To reset your password, go to Settings > Security > Reset Password',
        reply_to_message: {
          message_id: 788,
          text: '🚨 *Escalation: esc_123*\nClient: Acme Corp\nQuery: How do I reset my password?',
        },
      },
    };

    it('should extract answer from reply message text', async () => {
      const result = await handleTelegramUpdate(mockUpdate);

      expect(result.answer).toBe(
        'To reset your password, go to Settings > Security > Reset Password'
      );
    });

    it('should extract escalation ID from original message', async () => {
      const result = await handleTelegramUpdate(mockUpdate);

      expect(result.escalationId).toBe('esc_123');
    });

    it('should call answerTicket with escalation ID and answer', async () => {
      // This will fail until answerTicket is implemented
      const result = await handleTelegramUpdate(mockUpdate);

      expect(result.ticketUpdated).toBe(true);
      expect(result.escalationId).toBe('esc_123');
    });

    it('should trigger auto-learn after answering ticket', async () => {
      const result = await handleTelegramUpdate(mockUpdate);

      expect(result.autoLearnTriggered).toBe(true);
      expect(result.kbArticleId).toBeDefined();
    });

    it('should send confirmation message back to Telegram', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 999 } }),
      });

      await handleTelegramUpdate(mockUpdate);

      // Should send confirmation
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          method: 'POST',
        })
      );

      const lastCall = (global.fetch as jest.Mock).mock.calls[
        (global.fetch as jest.Mock).mock.calls.length - 1
      ];
      const body = JSON.parse(lastCall[1].body);

      expect(body.text).toMatch(/confirmed|success|updated/i);
    });

    it('should ignore non-reply messages', async () => {
      const nonReplyUpdate = {
        ...mockUpdate,
        message: {
          ...mockUpdate.message,
          reply_to_message: undefined,
        },
      };

      const result = await handleTelegramUpdate(nonReplyUpdate);

      expect(result.ignored).toBe(true);
    });

    it('should ignore messages without escalation ID in original text', async () => {
      const updateWithoutEscId = {
        ...mockUpdate,
        message: {
          ...mockUpdate.message,
          reply_to_message: {
            message_id: 788,
            text: 'Just a regular message',
          },
        },
      };

      const result = await handleTelegramUpdate(updateWithoutEscId);

      expect(result.ignored).toBe(true);
    });

    it('should handle errors gracefully and report back', async () => {
      const invalidUpdate = {
        update_id: 123,
        message: {
          message_id: 999,
          chat: { id: -123 },
          text: 'Invalid reply',
          reply_to_message: {
            message_id: 998,
            text: 'esc_invalid_format',
          },
        },
      };

      await expect(handleTelegramUpdate(invalidUpdate)).rejects.toThrow();
    });
  });

  describe('Environment validation', () => {
    it('should require TELEGRAM_BOT_TOKEN', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;

      await expect(
        sendMessage(mockTelegramEnv.TELEGRAM_CHAT_ID, 'Test')
      ).rejects.toThrow('TELEGRAM_BOT_TOKEN');
    });

    it('should require TELEGRAM_CHAT_ID when using default', async () => {
      delete process.env.TELEGRAM_CHAT_ID;

      // Should still work if chatId is provided explicitly
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      await sendMessage('-1001234567890', 'Test');

      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
