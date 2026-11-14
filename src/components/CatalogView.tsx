import React, { useMemo, useState } from 'react';
import { ExternalLink, Play, Search, Youtube } from 'lucide-react';
import catalogData from '../data/catalog.json';
import { CatalogResource, ResourceCost, StudyFormat } from '../types/skillpilot';
import { ALL_CAREER_FIELDS } from '../constants/presets';

const CATALOG_ITEMS = catalogData as CatalogResource[];

export function CatalogView() {
  const [query, setQuery] = useState('');
  const [selectedField, setSelectedField] = useState('all');
  const [selectedSkill, setSelectedSkill] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedFormat, setSelectedFormat] = useState<'all' | StudyFormat>('all');
  const [selectedCost, setSelectedCost] = useState<'all' | ResourceCost>('all');

  const skills = useMemo(
    () =>
      [
        'all',
        ...Array.from(
          new Set(
            CATALOG_ITEMS.filter(
              (c) => selectedField === 'all' || (c.field || 'Technology & Data') === selectedField
            ).map((c) => c.skill)
          )
        ).sort(),
      ],
    [selectedField]
  );
  const platforms = useMemo(
    () => ['all', ...Array.from(new Set(CATALOG_ITEMS.map((c) => c.platform))).sort()],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG_ITEMS.filter((item) => {
      const itemField = item.field || 'Technology & Data';
      if (selectedField !== 'all' && itemField !== selectedField) return false;
      if (selectedSkill !== 'all' && item.skill !== selectedSkill) return false;
      if (selectedPlatform !== 'all' && item.platform !== selectedPlatform) return false;
      if (selectedFormat !== 'all' && item.format !== selectedFormat) return false;
      if (selectedCost !== 'all' && item.cost !== selectedCost) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.skill.toLowerCase().includes(q) &&
        !item.platform.toLowerCase().includes(q) &&
        !(item.channel || '').toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [query, selectedField, selectedSkill, selectedPlatform, selectedFormat, selectedCost]);

  const trimmedQuery = query.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Curated Multi-Field Course Catalog
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            <span className="tabular-nums">{CATALOG_ITEMS.length}</span> verified courses,
            YouTube video tracks, guides, and labs across Medical, Teaching, Technology, Business,
            and Design.
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills, titles, channels, or platforms..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <select
            value={selectedField}
            onChange={(e) => {
              setSelectedField(e.target.value);
              setSelectedSkill('all');
            }}
            className="md:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">All fields</option>
            {ALL_CAREER_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="md:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            {skills.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All skills' : s}
              </option>
            ))}
          </select>

          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="md:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p === 'all' ? 'All platforms' : p}
              </option>
            ))}
          </select>

          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as 'all' | StudyFormat)}
            className="md:col-span-1 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">Formats</option>
            <option value="video">Video</option>
            <option value="reading">Reading</option>
            <option value="hands-on">Hands-on</option>
          </select>

          <select
            value={selectedCost}
            onChange={(e) => setSelectedCost(e.target.value as 'all' | ResourceCost)}
            className="md:col-span-1 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">Cost</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isYouTube = item.platform === 'YouTube';
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden flex flex-col justify-between rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div>
                  {isYouTube && (
                    <div className="relative aspect-video bg-gradient-to-br from-rose-50 via-red-50 to-amber-50 border-b border-slate-200 p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/95 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          <Youtube className="h-3 w-3" />
                          {item.channel || 'YouTube'}
                        </span>
                        <span className="rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-mono text-white tabular-nums">
                          {item.duration}
                        </span>
                      </div>
                      <div className="flex items-center justify-center my-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                          <Play className="h-4 w-4 fill-white ml-0.5" />
                        </div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-700 truncate">
                        {item.field || 'Skill Track'} · {item.skill}
                      </p>
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-indigo-700 truncate">
                        {item.skill} · {item.platform}
                        {item.field ? ` · ${item.field.split(' ')[0]}` : ''}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 group-hover:text-indigo-700 mt-1.5 leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.description}</p>
                  </div>
                </div>

                <div className="mx-5 mb-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="capitalize">
                    {item.format} · {item.level}
                  </span>
                  <span className="font-semibold text-slate-700 tabular-nums">
                    {item.duration} · {item.cost === 'free' ? 'Free' : 'Paid'}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
          <p className="text-sm font-semibold text-slate-800">
            No catalog entries match "{trimmedQuery || 'your current filters'}".
          </p>
          {trimmedQuery && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Explore live search results for "{trimmedQuery}" on trusted platforms:
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-1">
                <a
                  href={`https://www.coursera.org/search?query=${encodeURIComponent(trimmedQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Search Coursera <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`https://www.udemy.com/courses/search/?q=${encodeURIComponent(trimmedQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Search Udemy <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                    trimmedQuery + ' tutorial'
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Search YouTube <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
