/** A small image, drawn inline so a story needs no file: a sunrise over a hill. */
export const SUNRISE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#fde7c7"/>' +
        '<circle cx="240" cy="230" r="70" fill="#f59e0b"/><path d="M0 250 Q240 170 480 250 V320 H0Z" fill="#65a30d"/></svg>',
)}`;

/** Steps counted in November, as the agent keeps them in `results.csv`. */
export const STEPS_CSV = [
    'date,steps,sleep (h),note',
    '2026-11-01,8200,7.5,',
    '2026-11-02,10400,6.8,"Spacer z psem, potem basen"',
    '2026-11-03,6100,8.1,"Deszcz — ""dzień kanapy"""',
    '2026-11-04,12050,7.2,',
].join('\n');

/** A plain text file, its line breaks and indentation as written. */
export const SHOPPING_TEXT = 'Zakupy na sobotę\n\n- owsianka\n- jogurt naturalny\n    (bez cukru!)\n- banany\n';
