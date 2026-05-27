export const extractDriveTime = (comment) => {
  if (!comment) return null;
  const patterns = [
    /DT[:\s]+(\d+:\d+)/i,
    /Drive\s*[-]?\s*Time[s]?[:\s]+(\d+:\d+)/i,
    /Drive\s*[-]?\s*Time[s]?\s+averaged?\s+(\d+:\d+)/i,
    /Drive\s*[-]?\s*Time[s]?\s+of\s+(\d+:\d+)/i,
    /(\d+:\d+)\s+Drive\s*[-]?\s*Time/i,
    /a\s+(\d+:\d+)\s+Drive\s*[-]?\s*Time/i,
    /Drive\s*[-]?\s*through\s+Time[s]?[:\s]+(\d+:\d+)/i,
    /(\d+:\d+)\s+Drive\s*[-]?\s*through\s+Time/i,
    /Drop\s+Time[s]?[:\s]+(\d+:\d+)/i,
    /(\d+:\d+)\s+Drop\s+Time/i,
    /DT\s+was\s+(\d+:\d+)/i,
    /DT\s+at\s+(\d+:\d+)/i,
    /averaged?\s+(\d+:\d+)\s+DT/i,
    /(\d+:\d+)\s+avg/i
  ];
  for (const pattern of patterns) {
    const match = comment.match(pattern);
    if (match) return match[1];
  }
  return null;
};

export const extractMood = (comment) => {
  if (!comment) return null;
  const lowerComment = comment.toLowerCase();
  if (/\b(hectic|crazy|insane|nightmare)\b/.test(lowerComment)) return 'Hectic';
  if (/\b(tough|hard|struggled|difficult|short[- ]?staffed)\b/.test(lowerComment)) return 'Tough';
  if (/\b(busy|rush|crowds|packed|slammed)\b/.test(lowerComment)) return 'Busy';
  if (/\b(great|excellent|perfect|flawless|amazing|awesome)\b/.test(lowerComment)) return 'Great';
  if (/\b(good|solid|nice)\b/.test(lowerComment)) return 'Good';
  if (/\b(slow|quiet|light|dead)\b/.test(lowerComment)) return 'Slow';
  if (/\b(smooth|steady|normal|standard|typical)\b/.test(lowerComment)) return 'Normal';
  return null;
};

export const getMoodColor = (mood) => {
  switch (mood) {
    case 'Great':
    case 'Good':
      return 'bg-green-500';
    case 'Normal':
    case 'Smooth':
    case 'Steady':
      return 'bg-slate-500';
    case 'Slow':
      return 'bg-yellow-500';
    case 'Busy':
    case 'Tough':
      return 'bg-orange-500';
    case 'Hectic':
      return 'bg-red-500';
    default:
      return 'bg-slate-500';
  }
};

export const generateSummary = (comment) => {
  if (!comment) return '';
  let cleaned = comment.replace(/^(Sales:.*?\n|DT:.*?\n|Drive Time:.*?\n)/gim, '').trim();
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let summary = sentences.slice(0, 2).join('. ').trim();
  if (summary.length > 150) {
    summary = summary.substring(0, 147) + '...';
  }
  return summary || cleaned.substring(0, 150);
};
