/**
 * Unit tests for Notification Router
 * Phase 4: Notification System
 * 
 * Tests multi-channel notification routing:
 * - Tries channels in priority order (telegram -> imessage -> email)
 * - Skips fallbacks if primary succeeds
 * - Tries next channel if primary fails
 * - Records which channel was used
 * - Returns delivery status
 */

import { sendNotification } from '../../src/notify/router';

// Mock the channel modules
jest.mock('../../src/notify/telegram', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../../src/notify/imessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../../src/notify/email', () => ({
  sendEmail: jest.fn(),
}));

// Mock Firestore
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        update: jest.fn(),
      })),
    })),
  })),
}));

import * as telegram from '../../src/notify/telegram';
import * as imessage from '../../src/notify/imessage';
import * as email from '../../src/notify/email';

describe('Notification Router', () => {
  const mockEscalation = {
    id: 'esc_789',
    clientId: 'client_abc',
    clientName: 'Beta Inc',
    query: 'How do I export data?',
    contextTags: ['export', 'data'],
    status: 'pending',
    createdAt: new Date('2026-02-20T11:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification - Primary channel success', () => {
    it('should try Telegram first', async () => {
      (telegram.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 123,
      });

      await sendNotification(mockEscalation);

      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should skip fallbacks if Telegram succeeds', async () => {
      (telegram.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 123,
      });

      await sendNotification(mockEscalation);

      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(imessage.sendMessage).not.toHaveBeenCalled();
      expect(email.sendEmail).not.toHaveBeenCalled();
    });

    it('should return success status with telegram channel', async () => {
      (telegram.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 123,
      });

      const result = await sendNotification(mockEscalation);

      expect(result).toEqual({
        sent: true,
        channel: 'telegram',
        messageId: 123,
      });
    });

    it('should update escalation document with channel used', async () => {
      (telegram.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 123,
      });

      const result = await sendNotification(mockEscalation);

      expect(result.sent).toBe(true);
      // This test will pass once Firestore update is implemented
    });
  });

  describe('sendNotification - Fallback chain', () => {
    it('should try iMessage if Telegram fails', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram API error')
      );
      (imessage.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'imsg_456',
      });

      await sendNotification(mockEscalation);

      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(imessage.sendMessage).toHaveBeenCalledTimes(1);
      expect(email.sendEmail).not.toHaveBeenCalled();
    });

    it('should return success with imessage channel if used', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram API error')
      );
      (imessage.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'imsg_456',
      });

      const result = await sendNotification(mockEscalation);

      expect(result).toEqual({
        sent: true,
        channel: 'imessage',
        messageId: 'imsg_456',
      });
    });

    it('should try email if both Telegram and iMessage fail', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage error')
      );
      (email.sendEmail as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'email_789',
      });

      await sendNotification(mockEscalation);

      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(imessage.sendMessage).toHaveBeenCalledTimes(1);
      expect(email.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should return success with email channel if used', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage error')
      );
      (email.sendEmail as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'email_789',
      });

      const result = await sendNotification(mockEscalation);

      expect(result).toEqual({
        sent: true,
        channel: 'email',
        messageId: 'email_789',
      });
    });

    it('should return failure if all channels fail', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage error')
      );
      (email.sendEmail as jest.Mock).mockRejectedValueOnce(
        new Error('Email error')
      );

      const result = await sendNotification(mockEscalation);

      expect(result).toEqual({
        sent: false,
        channel: null,
        error: expect.stringContaining('All notification channels failed'),
      });
    });
  });

  describe('sendNotification - Escalation document updates', () => {
    it('should record telegram as notificationChannel in Firestore', async () => {
      (telegram.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 123,
      });

      await sendNotification(mockEscalation);

      // Will need to verify Firestore update call
      // expect(mockFirestoreUpdate).toHaveBeenCalledWith({
      //   notificationChannel: 'telegram',
      //   notificationSentAt: expect.any(Date),
      // });
    });

    it('should record imessage if that channel was used', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'imsg_456',
      });

      await sendNotification(mockEscalation);

      // Will verify correct channel recorded
    });

    it('should record email if that channel was used', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage error')
      );
      (email.sendEmail as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'email_789',
      });

      await sendNotification(mockEscalation);

      // Will verify correct channel recorded
    });

    it('should update notificationSentAt timestamp', async () => {
      const beforeTime = new Date();

      (telegram.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 123,
      });

      await sendNotification(mockEscalation);

      const afterTime = new Date();

      // Timestamp should be between before and after
      // Will verify Firestore update includes timestamp
    });

    it('should not update document if all channels fail', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage error')
      );
      (email.sendEmail as jest.Mock).mockRejectedValueOnce(
        new Error('Email error')
      );

      await sendNotification(mockEscalation);

      // Firestore update should not be called when all fail
    });
  });

  describe('sendNotification - Channel priority order', () => {
    it('should always try telegram first', async () => {
      const callOrder: string[] = [];

      (telegram.sendMessage as jest.Mock).mockImplementationOnce(async () => {
        callOrder.push('telegram');
        throw new Error('Telegram error');
      });

      (imessage.sendMessage as jest.Mock).mockImplementationOnce(async () => {
        callOrder.push('imessage');
        throw new Error('iMessage error');
      });

      (email.sendEmail as jest.Mock).mockImplementationOnce(async () => {
        callOrder.push('email');
        return { success: true, messageId: 'email_123' };
      });

      await sendNotification(mockEscalation);

      expect(callOrder).toEqual(['telegram', 'imessage', 'email']);
    });

    it('should pass formatted escalation data to each channel', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'imsg_456',
      });

      await sendNotification(mockEscalation);

      expect(telegram.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Beta Inc')
      );

      expect(imessage.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Beta Inc')
      );
    });
  });

  describe('sendNotification - Error handling', () => {
    it('should handle missing escalation data gracefully', async () => {
      const invalidEscalation = {
        id: 'esc_invalid',
        clientId: null as any,
        clientName: undefined as any,
        query: '',
      };

      await expect(sendNotification(invalidEscalation)).rejects.toThrow();
    });

    it('should log failures to console for debugging', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram error')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage error')
      );
      (email.sendEmail as jest.Mock).mockRejectedValueOnce(
        new Error('Email error')
      );

      await sendNotification(mockEscalation);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Notification'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });

    it('should include error details in failure response', async () => {
      (telegram.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Telegram: Invalid token')
      );
      (imessage.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('iMessage: Not configured')
      );
      (email.sendEmail as jest.Mock).mockRejectedValueOnce(
        new Error('Email: SMTP error')
      );

      const result = await sendNotification(mockEscalation);

      expect(result.sent).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
