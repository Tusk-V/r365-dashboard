import { Building2, Map, Store } from 'lucide-react';

const SECTIONS = [
  { type: 'company', label: 'Company', Icon: Building2 },
  { type: 'market', label: 'Markets', Icon: Map },
  { type: 'location', label: 'Locations', Icon: Store },
];

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

export default function ChannelSidebar({ channels, activeKey, onSelect }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-2 overflow-y-auto scrollbar-slim">
      {SECTIONS.map(({ type, label, Icon }) => {
        const group = channels.filter(c => c.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type}>
            <div className="flex items-center gap-1.5 px-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Icon size={11} /> {label}
            </div>
            <div className="space-y-0.5">
              {group.map(c => (
                <ChannelRow key={c.key} channel={c} active={c.key === activeKey} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
