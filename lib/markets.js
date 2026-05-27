export const getMarket = (locationName) => {
  const tulsa = ['Bixby', 'Yale', 'Broken Arrow', 'Owasso', 'Claremore'];
  const okc = ['Warr Acres', 'Penn', 'Edmond', 'Norman'];
  const dallas = ['Carrollton', 'Frisco #1', 'Frisco #2', 'Frisco #3', 'Lake Highlands', 'Hillcrest Village', 'The Colony', 'Prosper', 'Allen'];
  const orlando = ['Sanford', 'Lakeland', "Hunter's Creek"];

  if (tulsa.includes(locationName)) return 'Tulsa';
  if (okc.includes(locationName)) return 'Oklahoma City';
  if (dallas.includes(locationName)) return 'Dallas';
  if (orlando.includes(locationName)) return 'Orlando';
  return 'Other';
};

export const marketSortOrder = { 'Tulsa': 0, 'Oklahoma City': 1, 'Dallas': 2, 'Orlando': 3, 'Other': 4 };

export const sortByMarket = (locations) => {
  return [...locations].sort((a, b) => {
    const ma = marketSortOrder[getMarket(a)] ?? 4;
    const mb = marketSortOrder[getMarket(b)] ?? 4;
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });
};
