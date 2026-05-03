export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const synonyms: Record<string, string> = {
  'tomato': 'Solanum lycopersicum',
  'cherry tomato': 'Solanum lycopersicum',
  'basil': 'Ocimum basilicum',
  'sweet basil': 'Ocimum basilicum',
  'carrot': 'Daucus carota',
  'onion': 'Allium cepa',
  'garlic': 'Allium sativum',
  'chives': 'Allium schoenoprasum',
  'leek': 'Allium ampeloprasum',
  'cabbage': 'Brassica oleracea',
  'broccoli': 'Brassica oleracea',
  'cauliflower': 'Brassica oleracea',
  'kale': 'Brassica oleracea',
  'brussels sprouts': 'Brassica oleracea',
  'lettuce': 'Lactuca sativa',
  'spinach': 'Spinacia oleracea',
  'pea': 'Pisum sativum',
  'bean': 'Phaseolus vulgaris',
  'french bean': 'Phaseolus vulgaris',
  'runner bean': 'Phaseolus coccineus',
  'cucumber': 'Cucumis sativus',
  'dill': 'Anethum graveolens',
  'fennel': 'Foeniculum vulgare',
  'marigold': 'Tagetes erecta',
  'nasturtium': 'Tropaeolum majus',
  'chamomile': 'Matricaria chamomilla',
  'rosemary': 'Salvia rosmarinus',
  'mint': 'Mentha spicata',
  'spearmint': 'Mentha spicata',
  'peppermint': 'Mentha piperita',
  'sage': 'Salvia officinalis',
  'thyme': 'Thymus vulgaris',
  'wormwood': 'Artemisia absinthium',
  'potato': 'Solanum tuberosum',
  'corn': 'Zea mays',
  'maize': 'Zea mays',
  'squash': 'Cucurbita maxima',
  'zucchini': 'Cucurbita pepo',
  'courgette': 'Cucurbita pepo',
  'marrow': 'Cucurbita pepo',
  'summer squash': 'Cucurbita pepo',
  'pumpkin': 'Cucurbita pepo',
  'pepper': 'Capsicum annuum',
  'eggplant': 'Solanum melongena',
  'aubergine': 'Solanum melongena',
  'strawberry': 'Fragaria ananassa',
  'sunflower': 'Helianthus annuus',
  'borage': 'Borago officinalis',
  'parsley': 'Petroselinum crispum',
  'celery': 'Apium graveolens',
  'radish': 'Raphanus sativus',
  'beet': 'Beta vulgaris',
  'beetroot': 'Beta vulgaris',
  'swiss chard': 'Beta vulgaris',
  'turnip': 'Brassica rapa',
  'asparagus': 'Asparagus officinalis',
  'lavender': 'Lavandula angustifolia',
  'rue': 'Ruta graveolens',
  'tansy': 'Tanacetum vulgare',
  'yarrow': 'Achillea millefolium',
  'hyssop': 'Hyssopus officinalis',
  'lemon balm': 'Melissa officinalis',
  'currant': 'Ribes rubrum',
  // High-frequency PlantBuddies unresolved names
  'dwarf french bean': 'Phaseolus vulgaris',
  'pole bean': 'Phaseolus vulgaris',
  'kohlrabi': 'Brassica oleracea',
  'sweetcorn': 'Zea mays',
  'marjoram': 'Origanum majorana',
  'soya bean': 'Glycine max',
  'soybean': 'Glycine max',
  'horseradish': 'Armoracia rusticana',
  'broad bean': 'Vicia faba',
  'fava bean': 'Vicia faba',
  'apple': 'Malus domestica',
}

export function resolveCommonName(commonName: string): string | null {
  const normalized = commonName
    .toLowerCase()
    .trim()
    .replace(/_/g, ' ')
  return synonyms[normalized] ?? null
}
