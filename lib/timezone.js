export const adjustTimeForTimezone = (timeString) => {
  if (!timeString || !timeString.includes(' - ')) return timeString;

  try {
    const parts = timeString.split(' - ');
    const adjustTime = (timeStr) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return timeStr;

      let hours = parseInt(match[1]);
      const minutes = match[2];
      const period = match[3].toUpperCase();

      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      hours -= 2;

      if (hours < 0) hours += 24;

      const newPeriod = hours >= 12 ? 'PM' : 'AM';
      let displayHours = hours % 12;
      if (displayHours === 0) displayHours = 12;

      return `${displayHours}:${minutes} ${newPeriod}`;
    };

    return `${adjustTime(parts[0])} - ${adjustTime(parts[1])}`;
  } catch (e) {
    return timeString;
  }
};

export const adjustSingleTime = (timeString) => {
  if (!timeString) return timeString;

  try {
    const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return timeString;

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const period = match[3].toUpperCase();

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    hours -= 2;

    if (hours < 0) hours += 24;

    const newPeriod = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;

    return `${displayHours}:${minutes} ${newPeriod}`;
  } catch (e) {
    return timeString;
  }
};
