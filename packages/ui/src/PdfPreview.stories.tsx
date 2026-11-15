import type { Meta, StoryObj } from '@storybook/vue3-vite';

import PdfPreview from './PdfPreview.vue';

const meta: Meta<typeof PdfPreview> = { title: 'PdfPreview', component: PdfPreview, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof PdfPreview>;

/** A one-page PDF, drawn inline so the story needs no file. */
export const Loaded: Story = { args: { src: createPdfUrl(), title: 'umowa.pdf' } };

/** Its address is still being found. */
export const Loading: Story = { args: { title: 'umowa.pdf' } };

/** An object URL of an empty one-page PDF, as the app makes one from a file's bytes. */
function createPdfUrl() {
    const pdf = [
        '%PDF-1.4',
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj',
        'trailer<</Root 1 0 R>>',
        '%%EOF',
    ].join('\n');
    return URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
}
