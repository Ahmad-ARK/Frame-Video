import axios from 'axios';

const UA = 'documentary-pipeline/1.0 (personal project; contact: ahmadkhalid236997@gmail.com)';

/**
 * Ground the script in real facts: pull extracts for the top Wikipedia pages
 * matching the topic. Free API, no LLM cost — the text is folded into the
 * scriptwriting prompt so dates/numbers/names come from sources, not memory.
 */
export async function researchTopic(topic: string): Promise<string> {
  try {
    const search = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: { action: 'query', list: 'search', srsearch: topic, srlimit: 2, format: 'json' },
      headers: { 'User-Agent': UA },
      timeout: 15_000,
    });
    const titles: string[] = (search.data?.query?.search ?? []).map((r: any) => r.title).filter(Boolean);
    if (titles.length === 0) return '';

    const extracts = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        prop: 'extracts',
        explaintext: 1,
        exintro: 0,
        exchars: 2400,
        titles: titles.join('|'),
        redirects: 1,
        format: 'json',
      },
      headers: { 'User-Agent': UA },
      timeout: 20_000,
    });
    const pages = Object.values(extracts.data?.query?.pages ?? {}) as any[];
    const parts = pages
      .filter((p) => p.extract)
      .map((p) => `## ${p.title}\n${String(p.extract).trim()}`);
    if (parts.length > 0) console.log(`📚 Research: ${titles.join(', ')}`);
    return parts.join('\n\n');
  } catch (err) {
    console.warn(`  research failed (continuing without): ${(err as Error).message}`);
    return '';
  }
}
