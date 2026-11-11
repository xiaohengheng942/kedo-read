import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GlossIndex } from '@/services/wordlens/glossIndex';
import { planGlosses } from '@/services/wordlens/planner';
import { buildSectionTextModel, applyGlosses } from '@/app/reader/utils/wordlensRuby';

it('renders a Chinese hint from the real bundled pack without network or account', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network disabled'); });
  try {
    const data = JSON.parse(readFileSync('data/wordlens/en-zh.json', 'utf8'));
    const index = GlossIndex.fromData(data);
    expect(index.lookup('cryptic')?.gloss).toContain('神秘');
    const doc = document.implementation.createHTMLDocument('Offline');
    doc.body.innerHTML = '<p>Her cryptic message puzzled everyone.</p>';
    const model = buildSectionTextModel(doc);
    const hits = planGlosses(model.text, index, { sourceLang: 'en', rankCutoff: 1 });
    applyGlosses(doc, model, hits);
    expect([...doc.querySelectorAll('ruby')].some((r) => r.textContent?.includes('神秘'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
