import { WORK_MARKDOWN } from './MemoryLayout.fixtures.js';

// Files the editor opens in the stories: screens 34 and 06, and the constructs an agent writes that the editor keeps
// as their source. Each is written the way the editor writes Markdown back, so an edit changes only what was typed.

/** Screen 34: the Memory note "Praca i szukanie pracy", with the front matter the agent keeps on it. */
export const MEMORY_NOTE_MARKDOWN = `---
title: Praca i szukanie pracy
updated: 2026-11-14
---

${WORK_MARKDOWN}
`;

/** Screen 06: the project file "Pomysły na posty" of the Instagram project. */
export const POST_IDEAS_MARKDOWN = `# Pomysły na posty

Temat miesiąca: skóra zimą. Posty we wtorki i piątki, rolki w niedzielę.

## Bariera skórna w styczniu

Karuzela, 6 slajdów. Czemu twarz ściąga po spacerze i dwie rzeczy, które pomagają.

## Trzy zimowe zamiany

Zdjęcie na półce w łazience: żel → krem, tonik → esencja, lekki filtr → bogatszy.

## Mit czy fakt: filtr, gdy jest szaro

Krótka rolka. Odpowiedź: tak, promienie UVA przechodzą przez chmury.

## Wieczorna rutyna w 60 sekund

Rolka z minutnikiem na ekranie: olejek, serum, *bogaty krem*.
`;

/**
 * Everything an agent writes into a file: front matter, a table, nested and task lists, links in the three forms, and
 * the constructs the editor keeps as their source — HTML, a footnote, an image, a link definition.
 */
export const AGENT_MARKDOWN = `---
title: Plan na grudzień
tags: [instagram, plan]
---

# Plan na grudzień

Szczegóły w [notatkach](./notatki.md), statystyki na [profilu][profil], kontakt: [biuro](mailto:biuro@example.com).

| Dzień     | Format   | Temat                   |
| --------- | -------- | ----------------------- |
| Wtorek    | Karuzela | Bariera skórna          |
| Niedziela | Rolka    | Filtr w pochmurny dzień |

- Przygotować zdjęcia
  - półka w łazience
  - kosmetyki na zimę
- Napisać opisy

- [x] Ustalić temat miesiąca
- [ ] Nagrać rolkę o filtrach

<div align="center">Nie zmieniaj tego bloku — to układ okładki.</div>

Okładka ![Szkic okładki](cover-draft-3.png) wisi w folderze Okładki.[^1]

[^1]: Wersja trzecia, po uwagach z poprzedniego tygodnia.

[profil]: https://instagram.com/example
`;

/** A file with nothing in it yet. */
export const EMPTY_MARKDOWN = '';
