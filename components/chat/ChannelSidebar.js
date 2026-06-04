import { useState } from 'react';
import { Building2, Map, Store, Search, ChevronDown, ChevronRight } from 'lucide-react';

const SECTIONS = [
  { type: 'company', label: 'Company', Icon: Building2 },
  { type: 'market', label: 'Markets', Icon: Map },
  { type: 'location', label: 'Locations', Icon: Store },
];
const MARKET_ORDER = ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando'];

function ChannelRow({ channel, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(channel.key)}
      className={`group w-full flex items-center justify-between gap-2 min-h-[40px] pl-2.5 pr-3 py-2 rounded-md text-sm border-l-2 transition-colors ${active ? 'bg-blue-600/20 text-white border-blue-500' : 'border-transparent text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
    >
      <span className={`truncate ${channel.unread > 0 && !active ? 'font-semibold text-white' : ''}`}>{channel.name}</span>
      {channel.unread > 0 && (
        <span className="ml-2 px-1.5 py-px text-[10px] font-bold bg-red-600 text-white rounded-full flex-shrink-0">
          {channel.unread > 99 ? '99+' : channel.unread}
        </span>
      )}
    </button>
  );
}

// Location channels grouped under their market.
function LocationsByMarket({ group, activeKey, onSelect }) {
  const byMarket = {};
  for (const c of group) {
    const m = c.market || 'Other';
    (byMarket[m] = byMarket[m] || []).push(c);
  }
  const markets = [
    ...MARKET_ORDER.filter(m => byMarket[m]),
    ...Object.keys(byMarket).filter(m => !MARKET_ORDER.includes(m)).sort(),
  ];
  return (
    <div className="space-y-1.5 mt-0.5">
      {markets.map(m => (
        <div key={m}>
          <div className="px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">{m}</div>
          <div className="space-y-0.5">
            {byMarket[m].map(c => <ChannelRow key={c.key} channel={c} active={c.key === activeKey} onSelect={onSelect} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChannelSidebar({ channels, activeKey, onSelect }) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const query = q.trim().toLowerCase();
  const filtered = query ? channels.filter(c => c.name.toLowerCase().includes(query)) : channels;
  const toggle = (type) => setCollapsed(c => ({ ...c, [type]: !c[type] }));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-2 pb-1 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search channels"
            className="w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-md text-base md:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim flex flex-col gap-2 p-2 pt-1">
        {SECTIONS.map(({ type, label, Icon }) => {
          const group = filtered.filter(c => c.type === type);
          if (group.length === 0) return null;
          const groupUnread = group.reduce((s, c) => s + (c.unread || 0), 0);
          const isCollapsed = collapsed[type] && !query; // searching forces sections open
          return (
            <div key={type}>
              <button onClick={() => toggle(type)} className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-700/30">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                  <Icon size={11} /> {label}
                </span>
                {groupUnread > 0 && (
                  <span className="px-1.5 py-px text-[10px] font-bold bg-red-600 text-white rounded-full">{groupUnread > 99 ? '99+' : groupUnread}</span>
                )}
              </button>
              {!isCollapsed && (
                type === 'location'
                  ? <LocationsByMarket group={group} activeKey={activeKey} onSelect={onSelect} />
                  : (
                    <div className="space-y-0.5 mt-0.5">
                      {group.map(c => <ChannelRow key={c.key} channel={c} active={c.key === activeKey} onSelect={onSelect} />)}
                    </div>
                  )
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-2 text-xs text-slate-500">No channels match “{q}”.</div>
        )}
      </div>
    </div>
  );
}
