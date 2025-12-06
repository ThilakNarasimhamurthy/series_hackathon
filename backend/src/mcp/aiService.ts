/**
 * AI Service for generating contextual, emotion-aware responses
 * Uses OpenAI API (or can be configured for other providers)
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { sanitizeErrorMessage } from '../utils/sanitize.js';

dotenv.config();

interface MessageContext {
  userMessage: string;
  userPhone: string;
  recentMoods?: string[];
  recentJournalEntries?: Array<{ content: string; sentiment: string }>;
  moodTrend?: {
    trend: 'declining' | 'stable' | 'improving';
    severity: 'low' | 'medium' | 'high';
    isDeclining: boolean;
  };
  sentiment?: 'positive' | 'negative' | 'neutral';
  hasCrisisKeywords?: boolean;
}

/**
 * Generate AI-powered response based on user message and context
 */
export async function generateAIResponse(context: MessageContext): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  
  console.log(`🤖 Generating AI response...`);
  console.log(`   Model: ${model}`);
  console.log(`   API Key present: ${apiKey ? 'Yes (***' + apiKey.slice(-4) + ')' : 'No'}`);
  
  if (!apiKey) {
    console.warn('⚠️  OpenAI API key not found - using fallback response');
    // Fallback to template-based response if no API key
    return generateFallbackResponse(context);
  }

  try {
    const systemPrompt = `You are a compassionate, empathetic emotional support assistant. Your role is to:
- Listen actively and respond with empathy
- Provide supportive, non-judgmental responses
- Recognize when someone needs professional help
- Use a warm, conversational tone
- Keep responses concise (2-3 sentences max)
- Never provide medical advice
- Always prioritize user safety

${context.hasCrisisKeywords ? '⚠️ CRISIS DETECTED: The user message contains crisis keywords. Respond with immediate support and crisis resources (988 Suicide & Crisis Lifeline).' : ''}
${context.moodTrend?.isDeclining ? `⚠️ TREND: User's mood has been declining (${context.moodTrend.severity} severity). Show extra care and offer connection to support.` : ''}`;

    const userPrompt = buildUserPrompt(context);
    
    console.log(`   Sending request to OpenAI API...`);
    console.log(`   User message: "${context.userMessage.substring(0, 50)}..."`);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 150,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // Increased timeout to 30 seconds
      }
    );

    console.log(`   ✅ OpenAI API response received (status: ${response.status})`);
    
    const aiMessage = response.data.choices[0]?.message?.content?.trim();
    
    if (aiMessage) {
      console.log(`   ✅ AI response generated: "${aiMessage.substring(0, 50)}..."`);
      return aiMessage;
    }
    
    console.warn('⚠️  OpenAI returned empty response - using fallback');
    return generateFallbackResponse(context);
  } catch (error: any) {
    const safeMessage = sanitizeErrorMessage(error);
    
    // More detailed error logging
    if (error.response) {
      console.error('❌ OpenAI API error response:');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Status Text: ${error.response.statusText}`);
      console.error(`   Error: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('❌ OpenAI API request error - no response received:');
      console.error(`   Error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
    } else {
      console.error('❌ OpenAI API error:', safeMessage);
    }
    
    // Fallback to template-based response
    console.log('   Using fallback response');
    return generateFallbackResponse(context);
  }
}

/**
 * Build user prompt with context
 */
function buildUserPrompt(context: MessageContext): string {
  let prompt = `User message: "${context.userMessage}"\n\n`;

  if (context.sentiment) {
    prompt += `Detected sentiment: ${context.sentiment}\n`;
  }

  if (context.recentMoods && context.recentMoods.length > 0) {
    prompt += `Recent mood check-ins: ${context.recentMoods.join(', ')}\n`;
  }

  if (context.moodTrend) {
    prompt += `Mood trend: ${context.moodTrend.trend} (${context.moodTrend.severity} severity)\n`;
  }

  if (context.recentJournalEntries && context.recentJournalEntries.length > 0) {
    const recent = context.recentJournalEntries.slice(0, 2);
    prompt += `Recent journal entries:\n`;
    recent.forEach(entry => {
      prompt += `- "${entry.content.substring(0, 100)}..." (${entry.sentiment})\n`;
    });
  }

  prompt += `\nGenerate a supportive, empathetic response to the user's message.`;

  return prompt;
}

/**
 * Generate fallback response when AI service is unavailable
 */
function generateFallbackResponse(context: MessageContext): string {
  const { userMessage, sentiment, moodTrend, hasCrisisKeywords } = context;

  // Crisis response
  if (hasCrisisKeywords) {
    return "I'm here for you right now. You're not alone. Please reach out to 988 Suicide & Crisis Lifeline (call or text). I'm connecting you with someone who can help.";
  }

  // Negative sentiment response
  if (sentiment === 'negative') {
    if (moodTrend?.isDeclining && moodTrend.severity === 'high') {
      return "I hear that you're going through a really tough time. I've noticed things have been difficult lately. Would you like to talk to someone who can help?";
    }
    return "I'm sorry you're feeling this way. Thank you for sharing with me. What's been on your mind?";
  }

  // Positive sentiment response
  if (sentiment === 'positive') {
    return "That's great to hear! I'm glad things are going well for you. Is there anything specific you'd like to talk about?";
  }

  // Default empathetic response
  return "Thank you for reaching out. I'm here to listen. How can I support you today?";
}

/**
 * Analyze message and generate appropriate response
 */
export async function processMessageAndRespond(
  userMessage: string,
  userPhone: string,
  recentMoods?: string[],
  recentJournalEntries?: Array<{ content: string; sentiment: string }>,
  moodTrend?: {
    trend: 'declining' | 'stable' | 'improving';
    severity: 'low' | 'medium' | 'high';
    isDeclining: boolean;
  }
): Promise<string> {
  const { analyzeSentiment, detectCrisisKeywords } = await import('./analysis.js');
  
  const sentiment = analyzeSentiment(userMessage);
  const hasCrisisKeywords = detectCrisisKeywords(userMessage);

  const context: MessageContext = {
    userMessage,
    userPhone,
    recentMoods,
    recentJournalEntries,
    moodTrend,
    sentiment,
    hasCrisisKeywords,
  };

  return generateAIResponse(context);
}

/**
 * Generate AI-powered welcome message with instructions
 */
export async function generateWelcomeMessage(): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  
  console.log(`🤖 Generating AI welcome message...`);
  console.log(`   Model: ${model}`);
  console.log(`   API Key present: ${apiKey ? 'Yes (***' + apiKey.slice(-4) + ')' : 'No'}`);
  
  if (!apiKey) {
    console.warn('⚠️  OpenAI API key not found - using fallback welcome');
    // Fallback to template-based welcome
    return `Welcome to Series Emotional Support!

Here's how it works:
• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen and support you
• Type "crisis" or "help" if you need immediate assistance
• Everything stays private and anonymous
• I use AI to provide personalized, empathetic responses

What's on your mind?`;
  }

  try {
    const systemPrompt = `You are a warm, welcoming emotional support assistant. Create a brief, friendly welcome message (2-3 sentences) that:
- Welcomes the user to Series Emotional Support
- Shows empathy and care
- Invites them to share what's on their mind
- Uses a warm, conversational tone
- Keeps it concise and encouraging`;

    const userPrompt = `Generate a welcoming message for a new user joining Series Emotional Support. Make it warm, empathetic, and inviting.`;

    console.log(`   Sending request to OpenAI API...`);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 100,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // Increased timeout to 30 seconds
      }
    );

    console.log(`   ✅ OpenAI API response received (status: ${response.status})`);

    const aiWelcomeText = response.data.choices[0]?.message?.content?.trim();
    
    if (aiWelcomeText) {
      console.log(`   ✅ AI welcome message generated: "${aiWelcomeText.substring(0, 50)}..."`);
      return `Welcome to Series Emotional Support! ${aiWelcomeText}

Here's how it works:
• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen and support you
• Type "crisis" or "help" if you need immediate assistance
• Everything stays private and anonymous
• I use AI to provide personalized, empathetic responses

What's on your mind?`;
    }
    
    console.warn('⚠️  OpenAI returned empty response - using fallback welcome');
    // Fallback if AI response is empty
    return `Welcome to Series Emotional Support!

Here's how it works:
• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen and support you
• Type "crisis" or "help" if you need immediate assistance
• Everything stays private and anonymous
• I use AI to provide personalized, empathetic responses

What's on your mind?`;
  } catch (error: any) {
    const safeMessage = sanitizeErrorMessage(error);
    
    // More detailed error logging
    if (error.response) {
      console.error('❌ OpenAI API error response (welcome message):');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Status Text: ${error.response.statusText}`);
      console.error(`   Error: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('❌ OpenAI API request error - no response received (welcome message):');
      console.error(`   Error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
    } else {
      console.error('❌ OpenAI API error generating welcome message:', safeMessage);
    }
    
    console.log('   Using fallback welcome message');
    // Fallback to template-based welcome
    return `Welcome to Series Emotional Support!

Here's how it works:
• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen and support you
• Type "crisis" or "help" if you need immediate assistance
• Everything stays private and anonymous
• I use AI to provide personalized, empathetic responses

What's on your mind?`;
  }
}

