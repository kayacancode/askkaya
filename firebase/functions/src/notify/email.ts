   1	/**
   2	 * Email Notification Service
   3	 * 
   4	 * Final fallback notification channel using email
   5	 */
   6	
   7	import { SendMessageResult } from './types';
   8	
   9	/**
  10	 * Send an email notification
  11	 * 
  12	 * @param to - Email address to send to (configured in env)
  13	 * @param subject - Email subject
  14	 * @param body - Email body
  15	 * @returns Promise resolving to success status
  16	 */
  17	export async function sendEmail(
  18	  to: string,
  19	  subject: string,
  20	  body: string
  21	): Promise<SendMessageResult> {
  22	  const emailService = process.env['EMAIL_SERVICE_URL'];
  23	  
  24	  if (!emailService) {
  25	    throw new Error('EMAIL_SERVICE_URL environment variable is not set');
  26	  }
  27	  
  28	  // Use configured email if none provided
  29	  const targetEmail = to || process.env.SUPPORT_EMAIL;
  30	  
  31	  if (!targetEmail) {
  32	    throw new Error('SUPPORT_EMAIL environment variable is not set and no email provided');
  33	  }
  34	  
  35	  try {
  36	    const response = await fetch(emailService, {
  37	      method: 'POST',
  38	      headers: {
  39	        'Content-Type': 'application/json',
  40	      },
  41	      body: JSON.stringify({
  42	        to: targetEmail,
  43	        subject,
  44	        body,
  45	      }),
  46	    });
  47	    
  48	    if (!response.ok) {
  49	      throw new Error(`Email service returned ${response.status}`);
  50	    }
  51	    
  52	    const data = await response.json() as any;
  53	    
  54	    return {
  55	      success: true,
  56	      messageId: data.messageId || 'email_' + Date.now(),
  57	    };
  58	  } catch (error) {
  59	    throw new Error(`Email send failed: ${(error as Error).message}`);
  60	  }
  61	}
