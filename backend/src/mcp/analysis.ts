/**
 * Analysis functions for mood trends, sentiment, and crisis detection
 */

/**
 * Analyze mood trend from last 7 check-ins
 */
export function analyzeMoodTrend(moods: string[]): {
  isDeclining: boolean;
  severity: 'low' | 'medium' | 'high';
  trend: 'declining' | 'stable' | 'improving';
} {
  if (moods.length < 2) {
    return { isDeclining: false, severity: 'low', trend: 'stable' };
  }

  // Mood values (higher = better)
  const moodValues: Record<string, number> = {
    '😊': 5, '😄': 5, '🙂': 4,
    '😐': 3, '😕': 2,
    '😞': 1, '😰': 1, '🆘': 0
  };

  const values = moods.map(m => moodValues[m] ?? 3);
  const recent = values.slice(0, 3);
  const older = values.slice(3);

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

  const decline = olderAvg - recentAvg;

  return {
    isDeclining: decline > 1,
    severity: decline > 2 ? 'high' : decline > 1 ? 'medium' : 'low',
    trend: decline > 0 ? 'declining' : decline < 0 ? 'improving' : 'stable'
  };
}

/**
 * Get AI recommendation based on mood and trend
 */
export function getAIRecommendation(mood: string, trend: { isDeclining: boolean; severity: string }): string {
  const recommendations: Record<string, string> = {
    '😞': "I see you're struggling. Try the 5-4-3-2-1 grounding exercise: Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.",
    '😰': "Anxiety is tough. Deep breathing can help: Inhale for 4 counts, hold for 4, exhale for 6. Repeat 5 times.",
    '😊': "Great to hear you're doing well! Keep up the self-care practices that are working for you.",
    '🆘': "You're not alone. Help is connecting now. Crisis resources: 988 Suicide & Crisis Lifeline. I'm here to listen.",
  };

  let message = recommendations[mood] || "Thank you for checking in. Remember, it's okay to not be okay. You're taking an important step by reaching out.";

  if (trend.isDeclining && trend.severity === 'high') {
    message += "\n\nI've noticed your mood has been declining. Would you like to talk to someone?";
  }

  return message;
}

/**
 * Analyze sentiment of text
 */
export function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positive = /good|great|happy|better|improving|grateful|excited|love/i;
  const negative = /bad|sad|terrible|awful|worst|struggling|hate|angry|frustrated/i;

  if (positive.test(text)) return 'positive';
  if (negative.test(text)) return 'negative';
  return 'neutral';
}

/**
 * Extract keywords from text
 */
export function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const commonWords = ['that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'them', 'their'];
  return words
    .filter(w => !commonWords.includes(w))
    .slice(0, 5);
}

/**
 * Detect crisis keywords
 */
export function detectCrisisKeywords(text: string): boolean {
  const crisisPattern = /suicide|kill myself|end it|don't want to live|want to die|harm myself|not worth it/i;
  return crisisPattern.test(text);
}

