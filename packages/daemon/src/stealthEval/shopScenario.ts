import type { ScenarioStep } from './StealthEvalTypes.js';

/** The test shop (stealth-browsing D11): public, because the daemon's proxy refuses loopback. */
export const SHOP_URL = 'https://kedrzu.github.io/stealth-eval-page/';

/** How far ahead the order's delivery date is; the shop refuses a date in the past. */
const DELIVERY_DAYS_AHEAD = 7;

/**
 * The shop visit every runner makes: cookies, a search, a filter, paging, two products (one read through), the cart
 * and the order form submitted once empty and once filled. It ends by opening the list again, because the shop writes a
 * page's scroll record only when the page is left. Every selector was checked against the live shop.
 * @__NO_SIDE_EFFECTS__
 */
export function createShopScenario(today: Date): ScenarioStep[] {
    const deliveryDate = new Date(today.getTime() + DELIVERY_DAYS_AHEAD * 24 * 60 * 60 * 1000);
    const isoDate = deliveryDate.toISOString().slice(0, 10);

    return [
        { kind: 'open', url: SHOP_URL },
        { kind: 'click', selector: '#cookie-accept', label: 'przycisk „Accept all” w okienku o ciasteczkach' },
        { kind: 'type', selector: '#search-input', text: 'grinder', label: 'pole wyszukiwania u góry strony' },
        { kind: 'press', key: 'Enter' },
        { kind: 'click', selector: '[data-test=nav-shop]', label: 'link „Shop” w nagłówku' },
        {
            kind: 'click',
            selector: '[data-test=filter-cat-grinders]',
            label: 'pole wyboru „Coffee grinders” w filtrach (lista odświeży się sama)',
        },
        { kind: 'click', selector: '#filters-clear', label: 'link „Clear” w filtrach' },
        { kind: 'scrollTo', selector: '#pagination', label: 'numerów stron na dole listy' },
        { kind: 'click', selector: '[data-test=page-2]', label: 'stronę „2”' },
        { kind: 'click', selector: '[data-test=product-link-k04]', label: 'produkt „Electric Kettle 1.7 L”' },
        { kind: 'scrollBy', px: 250 },
        { kind: 'scrollBy', px: 250 },
        { kind: 'wait', ms: 2000, instruction: 'Poczytaj chwilę opis produktu.' },
        { kind: 'scrollBy', px: 250 },
        { kind: 'scrollBy', px: 250 },
        {
            kind: 'wait',
            ms: 2000,
            instruction: 'Doczytaj opis do końca (razem co najmniej 10 sekund na tej stronie).',
        },
        { kind: 'click', selector: '#tab-specs', label: 'zakładkę „Specifications”' },
        { kind: 'scrollTo', selector: '[data-test=gallery-next]', label: 'galerii zdjęć' },
        { kind: 'click', selector: '[data-test=gallery-next]', label: 'strzałkę „›” w galerii' },
        { kind: 'scrollTo', selector: '[data-test=faq-1]', label: 'sekcji pytań (FAQ)' },
        { kind: 'click', selector: '[data-test=faq-1]', label: 'pytanie „How long does delivery take?”' },
        { kind: 'click', selector: '#back-to-results', label: 'link „Back to results”' },
        {
            kind: 'click',
            selector: '[data-test=product-link-k05]',
            label: 'produkt „Variable Temperature Kettle”',
        },
        { kind: 'click', selector: '#add-to-cart', label: 'przycisk „Add to cart”' },
        { kind: 'click', selector: '#order-link', label: 'link „Order” obok koszyka' },
        { kind: 'click', selector: '#order-submit', label: 'przycisk „Place order” (z pustym formularzem)' },
        { kind: 'type', selector: '#order-name', text: 'Anna Kowalska', label: 'pole „Full name”' },
        { kind: 'type', selector: '#order-email', text: 'anna.kowalska@example.com', label: 'pole „Email”' },
        { kind: 'type', selector: '#order-phone', text: '600 123 456', label: 'pole „Phone”' },
        {
            kind: 'select',
            selector: '#order-delivery',
            value: 'courier',
            label: 'liście „Delivery method”',
            instruction: 'W liście „Delivery method” wybierz „Courier, 2 to 4 days”.',
        },
        { kind: 'click', selector: '#order-pay-card', label: 'płatność „Card”' },
        {
            kind: 'pickDate',
            selector: '#order-date',
            date: isoDate,
            label: 'pole „Delivery date”',
            instruction: 'W polu „Delivery date” wybierz dowolny dzień za około tydzień.',
        },
        { kind: 'click', selector: '#order-terms', label: 'pole wyboru akceptacji regulaminu' },
        { kind: 'click', selector: '#order-submit', label: 'przycisk „Place order”' },
        { kind: 'click', selector: '[data-test=nav-shop]', label: 'link „Shop” w nagłówku' },
    ];
}
