   1	   1	   1	   1	   1	   1	/**
   2	   2	   2	   2	   2	   2	 * AskKaya Cloud Functions Entry Point
   3	   3	   3	   3	   3	   3	 * 
   4	   4	   4	   4	   4	   4	 * Firebase Cloud Functions v2 for the AskKaya platform
   5	   5	   5	   5	   5	   5	 */
   6	   6	   6	   6	   6	   6	
   7	   7	   7	   7	   7	   7	import { onDocumentCreated } from 'firebase-functions/v2/firestore';
   8	   8	   8	   8	   8	   8	import { onRequest } from 'firebase-functions/v2/https';
   9	   9	   9	   9	   9	   9	import { sendNotification } from './notify/router';
  10	  10	  10	  10	  10	  10	import { handleTelegramUpdate } from './notify/telegram';
  11	  11	  11	  11	  11	  11	import type { Escalation, TelegramUpdate } from './notify/types';
  12	  12	  12	  12	  12	  12	
  13	  13	  13	  13	  13	  13	/**
  14	  14	  14	  14	  14	  14	 * Firestore trigger: Send notification when new escalation is created
  15	  15	  15	  15	  15	  15	 */
  16	  16	  16	  16	  16	  16	export const onEscalationCreated = onDocumentCreated(
  17	  17	  17	  17	  17	  17	  'escalations/{escalationId}',
  18	  18	  18	  18	  18	  18	  async (event) => {
  19	  19	  19	  19	  19	  19	    const escalationData = event.data?.data();
  20	  20	  20	  20	  20	  20	    
  21	  21	  21	  21	  21	  21	    if (!escalationData) {
  22	  22	  22	  22	  22	  22	      console.error('No escalation data in event');
  23	  23	  23	  23	  23	  23	      return;
  24	  24	  24	  24	  24	  24	    }
  25	  25	  25	  25	  25	  25	    
  26	  26	  26	  26	  26	  26	    const escalation: Escalation = {
  27	  27	  27	  27	  27	  27	      id: event.params.escalationId,
  28	  28	  28	  28	  28	  28	      clientId: escalationData['clientId'],
  29	  29	  29	  29	  29	  29	      clientName: escalationData['clientName'],
  30	  30	  30	  30	  30	  30	      query: escalationData['query'],
  31	  31	  31	  31	  31	  31	      contextTags: escalationData['contextTags'] || [],
  32	  32	  32	  32	  32	  32	      status: escalationData['status'] || 'pending',
  33	  33	  33	  33	  33	  33	      createdAt: escalationData['createdAt'],
  34	  34	  34	  34	  34	  34	    };
  35	  35	  35	  35	  35	  35	    
  36	  36	  36	  36	  36	  36	    try {
  37	  37	  37	  37	  37	  37	      const result = await sendNotification(escalation);
  38	  38	  38	  38	  38	  38	      console.log('Notification sent:', result);
  39	  39	  39	  39	  39	  39	    } catch (error) {
  40	  40	  40	  40	  40	  40	      console.error('Failed to send notification:', error);
  41	  41	  41	  41	  41	  41	    }
  42	  42	  42	  42	  42	  42	  }
  43	  43	  43	  43	  43	  43	);
  44	  44	  44	  44	  44	  44	
  45	  45	  45	  45	  45	  45	/**
  46	  46	  46	  46	  46	  46	 * HTTP endpoint: Telegram webhook receiver
  47	  47	  47	  47	  47	  47	 */
  48	  48	  48	  48	  48	  48	export const telegramWebhook = onRequest(async (req, res) => {
  49	  49	  49	  49	  49	  49	  // Only accept POST requests
  50	  50	  50	  50	  50	  50	  if (req.method !== 'POST') {
  51	  51	  51	  51	  51	  51	    res.status(405).send('Method Not Allowed');
  52	  52	  52	  52	  52	  52	    return;
  53	  53	  53	  53	  53	  53	  }
  54	  54	  54	  54	  54	  54	  
  55	  55	  55	  55	  55	  55	  try {
  56	  56	  56	  56	  56	  56	    const update = req.body as TelegramUpdate;
  57	  57	  57	  57	  57	  57	    
  58	  58	  58	  58	  58	  58	    if (!update) {
  59	  59	  59	  59	  59	  59	      res.status(400).send('Invalid request body');
  60	  60	  60	  60	  60	  60	      return;
  61	  61	  61	  61	  61	  61	    }
  62	  62	  62	  62	  62	  62	    
  63	  63	  63	  63	  63	  63	    const result = await handleTelegramUpdate(update);
  64	  64	  64	  64	  64	  64	    
  65	  65	  65	  65	  65	  65	    res.status(200).json({
  66	  66	  66	  66	  66	  66	      ok: true,
  67	  67	  67	  67	  67	  67	      result,
  68	  68	  68	  68	  68	  68	    });
  69	  69	  69	  69	  69	  69	  } catch (error) {
  70	  70	  70	  70	  70	  70	    console.error('Telegram webhook error:', error);
  71	  71	  71	  71	  71	  71	    res.status(500).json({
  72	  72	  72	  72	  72	  72	      ok: false,
  73	  73	  73	  73	  73	  73	      error: (error as Error).message,
  74	  74	  74	  74	  74	  74	    });
  75	  75	  75	  75	  75	  75	  }
  76	  76	  76	  76	  76	  76	});
