/**
 * Generate consistent anonymous names for users
 * Same user always gets the same anonymous name
 */

const ADJECTIVES = [
  'Brave', 'Calm', 'Kind', 'Wise', 'Gentle', 'Strong', 'Peaceful', 'Hopeful',
  'Bright', 'Warm', 'Serene', 'Resilient', 'Caring', 'Thoughtful', 'Patient',
  'Compassionate', 'Supportive', 'Understanding', 'Empathetic', 'Encouraging'
];

const NOUNS = [
  'Friend', 'Listener', 'Supporter', 'Companion', 'Helper', 'Guide', 'Buddy',
  'Partner', 'Ally', 'Advocate', 'Mentor', 'Counselor', 'Peer', 'Confidant',
  'Champion', 'Protector', 'Guardian', 'Advocate', 'Healer', 'Warrior'
];

/**
 * Generate a consistent anonymous name for a user based on their ID
 */
export function generateAnonymousName(userId: string): string {
  // Use user ID as seed for consistent name generation
  const hash = simpleHash(userId);
  const adjectiveIndex = Math.abs(hash) % ADJECTIVES.length;
  const nounIndex = Math.abs(hash >> 16) % NOUNS.length;
  
  return `${ADJECTIVES[adjectiveIndex]} ${NOUNS[nounIndex]}`;
}

/**
 * Simple hash function for consistent name generation
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Mask phone number - show only last 4 digits (for internal use only)
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '***';
  return `***-***-${phone.slice(-4)}`;
}

