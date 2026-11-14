import { expect, test } from 'vitest';

import { buildGenerativeUiReply } from './buildGenerativeUiReply.js';

test('a form reply lists the filled fields in field order under a blank line, skipping empty ones', () => {
    const reply = buildGenerativeUiReply('Oto moje odpowiedzi', [
        { label: 'Imię', value: 'Ola' },
        { label: 'Pseudonim', value: '   ' },
        { label: 'Obszary', value: ['Praca', 'Dom'] },
        { label: 'Nic', value: [] },
        { label: 'Dzień', value: 'Wtorek' },
        { label: 'Brak', value: null },
        { label: 'Uwagi', value: 'Pierwsza linia\nDruga linia' },
    ]);

    expect(reply).toBe(
        'Oto moje odpowiedzi\n\nImię: Ola\nObszary: Praca, Dom\nDzień: Wtorek\nUwagi: Pierwsza linia\nDruga linia',
    );
});

test('a form with nothing filled replies with the message alone', () => {
    expect(buildGenerativeUiReply('Pomiń', [{ label: 'Imię', value: '' }])).toBe('Pomiń');
});
