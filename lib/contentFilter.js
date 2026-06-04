// lib/contentFilter.js
// Auto-mask profanity (language) and inappropriate content (slurs/harassment).
// Pure + CommonJS so the chat API and the node test runner can both consume it.
// Behavior: replace each flagged whole word with asterisks of the same length;
// the message still posts. Whole-word, case-insensitive; avoids the Scunthorpe
// problem (no masking inside innocent words). Lists are built-in for now;
// admin-editable lists are a future enhancement.

const LANGUAGE = [
  'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker', 'shit', 'shitty',
  'bullshit', 'bitch', 'bitches', 'asshole', 'dumbass', 'jackass', 'bastard',
  'damn', 'goddamn', 'crap', 'piss', 'pissed', 'dick', 'dickhead', 'prick',
  'cock', 'pussy', 'douche', 'douchebag', 'wanker', 'bollocks',
];

const CONTENT = [
  // slurs / harassment / sexual — masked regardless of context
  'retard', 'retarded', 'faggot', 'fag', 'slut', 'whore', 'cunt', 'nigger',
  'nigga', 'spic', 'kike', 'chink', 'tranny',
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest terms first so e.g. "fucking" masks fully. Word boundaries prevent
// matching inside larger words ("class", "Scunthorpe", "assassin").
const TERMS = [...new Set([...LANGUAGE, ...CONTENT])].sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`\\b(${TERMS.map(escapeRegExp).join('|')})\\b`, 'gi');

function maskText(input) {
  const text = String(input == null ? '' : input);
  let filtered = false;
  const out = text.replace(PATTERN, (m) => { filtered = true; return '*'.repeat(m.length); });
  return { text: out, filtered };
}

module.exports = { maskText };
