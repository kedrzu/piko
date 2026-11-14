<!-- A Markdown file edited as formatted text under a format bar, with a switch to its plain Markdown source; reports new Markdown only after the person edits it. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const MarkdownEditorProps = {
  /** The editor's accessible name; "File content" when not given. */
  label: defineProp<string>(),
} as const;
</script>

<script lang="ts" setup>
import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Table,
  TextQuote,
} from '@lucide/vue';
import type { LucideIcon } from '@lucide/vue';
import type { Translation } from '@nzyme/i18n-core';
import { assert } from '@nzyme/utils/assert.js';
import Form from '@nzyme/vue-forms/components/Form.vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import type { Editor, Extensions } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { ToolbarButton, ToolbarRoot } from 'reka-ui';
import { ref, useCssModule, watch } from 'vue';

import { isExternalLinkUrl } from '@poweragents/common/utils/isExternalLinkUrl.js';

import Button from './Button.vue';
import Dialog from './Dialog.vue';
import DialogDescription from './DialogDescription.vue';
import * as l from './MarkdownEditor.loc.js';
import TextField from './TextField.vue';
import { MarkdownEditorExtensions, parseMarkdown, serializeMarkdown } from './utils/markdownDocument.js';

/** A format bar button that changes the document. */
interface FormatAction {
  key: string;
  icon: LucideIcon;
  label: Translation;
  /** Whether the format is on at the cursor; a button without it is an action, not a toggle. */
  active?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const props = defineProps(MarkdownEditorProps);
/**
 * The whole file, front matter included. Set from outside (the agent rewrote the file), it replaces the content without
 * being reported back; it is updated only after the person edits, never on load.
 */
const markdown = defineModel<string>('markdown', { required: true });
/** Whether the plain Markdown source shows instead of the formatted text. */
const syntax = defineModel<boolean>('syntax', { default: false });

const t = useTranslate();
const style = useCssModule();
/** The Markdown the person sees now, in either view. */
const current = ref(markdown.value);
/** The last Markdown reported, so the parent passing it back is not mistaken for an outside change. */
let lastEmitted: string | undefined;
/** The file the editor's content was loaded from: its front matter and line endings are written back with it. */
let loaded = parseMarkdown(current.value);
/** The Markdown the editor's content matches; the editor reloads when `current` moves away from it. */
let editorSource = current.value;

const editor = useEditor({
  extensions: createExtensions(),
  content: loaded.doc,
  editorProps: {
    attributes: () => ({
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': props.label ?? t(l.content),
      class: style['markdownEditor_document'] ?? '',
    }),
    transformPastedHTML: stripRawSource,
  },
  onCreate: ({ editor: created }) => syncEditor(created),
  onUpdate: ({ editor: updated }) => {
    const value = serializeMarkdown({ ...loaded, doc: updated.getJSON() });
    editorSource = value;
    commit(value);
  },
});

const formatActions: FormatAction[] = [
  {
    key: 'heading1',
    icon: Heading1,
    label: l.heading1,
    active: e => e.isActive('heading', { level: 1 }),
    run: e => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    key: 'heading2',
    icon: Heading2,
    label: l.heading2,
    active: e => e.isActive('heading', { level: 2 }),
    run: e => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'bold',
    icon: Bold,
    label: l.bold,
    active: e => e.isActive('bold'),
    run: e => e.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    icon: Italic,
    label: l.italic,
    active: e => e.isActive('italic'),
    run: e => e.chain().focus().toggleItalic().run(),
  },
  {
    key: 'bulletList',
    icon: List,
    label: l.bulletList,
    active: e => e.isActive('bulletList'),
    run: e => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    icon: ListOrdered,
    label: l.orderedList,
    active: e => e.isActive('orderedList'),
    run: e => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'taskList',
    icon: ListChecks,
    label: l.taskList,
    active: e => e.isActive('taskList'),
    run: e => e.chain().focus().toggleTaskList().run(),
  },
  {
    key: 'quote',
    icon: TextQuote,
    label: l.quote,
    active: e => e.isActive('blockquote'),
    run: e => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'code',
    icon: Code,
    label: l.code,
    active: e => e.isActive('code'),
    run: e => e.chain().focus().toggleCode().run(),
  },
  {
    key: 'table',
    icon: Table,
    label: l.table,
    // Markdown cannot merge cells, so the editor offers no way to; a new table has a header row, as Markdown's must.
    run: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

const linkOpen = ref(false);
const linkHref = ref('');
const linkError = ref<string>();
/** The cursor is on a link, which the dialog changes or removes. */
const linkExisting = ref(false);

watch(markdown, value => {
  if (value === lastEmitted) {
    return;
  }
  // An outside change: forget what was reported, or the file changing back to it would be ignored.
  lastEmitted = undefined;
  current.value = value;
  if (!syntax.value) {
    syncEditor(editor.value);
  }
});

watch(syntax, on => {
  if (!on) {
    syncEditor(editor.value);
  }
});

watch(linkHref, () => {
  linkError.value = undefined;
});

function commit(value: string) {
  current.value = value;
  lastEmitted = value;
  markdown.value = value;
}

/** Loads `current` into the editor when it holds something else; never reported, it is not the person's edit. */
function syncEditor(instance: Editor | undefined) {
  if (!instance || current.value === editorSource) {
    return;
  }
  loaded = parseMarkdown(current.value);
  editorSource = current.value;
  instance.chain().setMeta('addToHistory', false).setContent(loaded.doc, { emitUpdate: false }).run();
}

function onSourceInput(event: Event) {
  assert(event.target instanceof HTMLTextAreaElement);
  commit(event.target.value);
}

function openLink() {
  const instance = editor.value;
  assert(instance);
  const href: unknown = instance.getAttributes('link')['href'];
  linkExisting.value = instance.isActive('link');
  linkHref.value = typeof href === 'string' ? href : '';
  linkError.value = undefined;
  linkOpen.value = true;
}

function saveLink() {
  const instance = editor.value;
  assert(instance);
  const href = linkHref.value.trim();
  if (!isExternalLinkUrl(href)) {
    linkError.value = t(l.linkInvalid);
    return;
  }

  const chain = instance.chain().focus();
  if (instance.state.selection.empty && !linkExisting.value) {
    // Nothing selected: the address itself becomes the link's text, and typing on after it is not part of the link.
    chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).unsetMark('link');
  } else {
    chain.extendMarkRange('link').setLink({ href });
  }
  chain.run();
  linkOpen.value = false;
}

function removeLink() {
  const instance = editor.value;
  assert(instance);
  instance.chain().focus().extendMarkRange('link').unsetLink().run();
  linkOpen.value = false;
}

/** The editor's extensions with the task checkbox named in the person's language. */
function createExtensions(): Extensions {
  return MarkdownEditorExtensions.map(extension =>
    extension.name === 'taskItem'
      ? extension.configure({
          a11y: {
            checkboxLabel: (node: ProseMirrorNode) => t(l.taskDone, { task: node.textContent || t(l.taskEmpty) }),
          },
        })
      : extension,
  );
}

/**
 * A raw atom pasted from outside would write its "source" into the file as Markdown or HTML: pasted, it arrives as
 * the plain code it shows instead.
 */
function stripRawSource(html: string) {
  const pasted = new DOMParser().parseFromString(html, 'text/html');
  for (const element of pasted.querySelectorAll('[data-markdown-raw], [data-markdown-raw-inline]')) {
    element.removeAttribute('data-markdown-raw');
    element.removeAttribute('data-markdown-raw-inline');
  }
  return pasted.body.innerHTML;
}
</script>

<template>
  <div :class="$style.markdownEditor">
    <ToolbarRoot
      :class="$style.markdownEditor_bar"
      :aria-label="t(l.formatting)"
    >
      <ToolbarButton
        v-for="action in formatActions"
        :key="action.key"
        :class="$style.markdownEditor_button"
        :aria-label="t(action.label)"
        :title="t(action.label)"
        :aria-pressed="action.active ? !syntax && !!editor && action.active(editor) : undefined"
        :disabled="syntax || !editor"
        @click="editor && action.run(editor)"
      >
        <component
          :is="action.icon"
          :class="$style.markdownEditor_icon"
          aria-hidden="true"
        />
      </ToolbarButton>
      <ToolbarButton
        :class="$style.markdownEditor_button"
        :aria-label="t(l.link)"
        :title="t(l.link)"
        aria-haspopup="dialog"
        :disabled="syntax || !editor"
        @click="openLink"
      >
        <Link
          :class="$style.markdownEditor_icon"
          aria-hidden="true"
        />
      </ToolbarButton>
      <span :class="$style.markdownEditor_spacer" />
      <ToolbarButton
        :class="$style.markdownEditor_button"
        :aria-label="t(l.syntax)"
        :title="t(l.syntax)"
        :aria-pressed="syntax"
        @click="syntax = !syntax"
      >
        <FileCode
          :class="$style.markdownEditor_icon"
          aria-hidden="true"
        />
      </ToolbarButton>
    </ToolbarRoot>

    <EditorContent
      v-show="!syntax"
      :editor="editor"
    />
    <textarea
      v-if="syntax"
      :class="$style.markdownEditor_source"
      :value="current"
      :aria-label="t(l.source)"
      spellcheck="false"
      @input="onSourceInput"
    />

    <Dialog
      v-model:open="linkOpen"
      :title="t(l.linkTitle)"
    >
      <Form
        :class="$style.markdownEditor_linkForm"
        @submit="saveLink"
      >
        <DialogDescription :icon="Link">
          {{ t(l.linkDescription) }}
        </DialogDescription>
        <TextField
          v-model="linkHref"
          :errors="linkError"
          :label="t(l.linkAddress)"
          :placeholder="t(l.linkAddressPlaceholder)"
        />
        <div :class="$style.markdownEditor_linkActions">
          <Button
            v-if="linkExisting"
            variant="ghost"
            @click="removeLink"
          >
            {{ t(l.linkRemove) }}
          </Button>
          <Button
            variant="secondary"
            @click="linkOpen = false"
          >
            {{ t(l.linkCancel) }}
          </Button>
          <Button type="submit">
            {{ t(l.linkSave) }}
          </Button>
        </div>
      </Form>
    </Dialog>
  </div>
</template>

<style lang="scss" module>
.markdownEditor {
  display: flex;
  flex-direction: column;
  gap: $spacing-24;
}

.markdownEditor_bar {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-04;
  align-items: center;
}

.markdownEditor_spacer {
  flex: 1;
}

.markdownEditor_button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: $radius-s;
  background: transparent;
  color: $color-ink-muted;
  cursor: pointer;
  transition: background-color $duration-fast;

  @include focus-ring;

  &:not(:disabled) {
    @include hover {
      background: $color-surface-soft;
      color: $color-ink;
    }
  }

  &[aria-pressed='true'] {
    background: $color-surface-soft;
    color: $color-ink;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.markdownEditor_icon {
  width: 15px;
  height: 15px;
}

// ProseMirror renders the document's own elements, so they are styled by element under the class it is given.
.markdownEditor_document {
  color: $color-ink;
  font-size: $font-size-body-l;
  line-height: $line-height-relaxed;
  overflow-wrap: anywhere;

  // The caret shows where focus is, as in any text field; an outline around the whole page would only add noise.
  &:focus-visible {
    outline: none;
  }

  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }

  p,
  ul,
  ol,
  blockquote,
  pre,
  hr,
  table {
    margin: 0 0 $spacing-12;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: $spacing-18 0 $spacing-10;
    color: $color-ink;
    @include font-heading;
    font-weight: $font-weight-bold;
    line-height: $line-height-tight;
  }

  h1 {
    margin-bottom: $spacing-16;
    font-size: $font-size-title-s;
  }

  h2 {
    margin-top: $spacing-24;
    font-size: $font-size-heading;
  }

  h3 {
    font-size: $font-size-lead;
  }

  h4,
  h5,
  h6 {
    font-size: $font-size-body-l;
  }

  ul,
  ol {
    padding-left: $spacing-24;
  }

  li > p,
  li > div > p {
    margin: 0;
  }

  li + li {
    margin-top: $spacing-06;
  }

  li::marker {
    color: $color-ink-muted;
  }

  ul[data-type='taskList'] {
    padding-left: 0;
    list-style: none;

    li {
      display: flex;
      gap: $spacing-08;
    }

    li > label {
      position: relative;
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 1lh;
      min-height: 24px;
      user-select: none;
    }

    li > div {
      flex: 1;
      min-width: 0;
    }

    // The native box stays the 24px target, invisible over the one drawn on its label (Tiptap's span is its hidden
    // name, not a box).
    input[type='checkbox'] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }

    li > label::before {
      width: 16px;
      height: 16px;
      box-sizing: border-box;
      border: 1.5px solid $color-ink-muted;
      border-radius: $spacing-04;
      background: $color-surface;
      content: '';
    }

    li > label:has(input:checked)::before {
      border-color: $color-ink;
      background: $color-ink;
    }

    li > label:has(input:checked)::after {
      position: absolute;
      width: 4px;
      height: 8px;
      margin-top: -2px;
      border: solid $color-on-ink;
      border-width: 0 2px 2px 0;
      content: '';
      transform: rotate(45deg);
    }

    li > label:has(input:focus-visible)::before {
      outline: 2px solid $color-focus;
      outline-offset: 2px;
    }

    li[data-checked='true'] > div {
      color: $color-ink-muted;
      text-decoration: line-through;
    }
  }

  strong {
    font-weight: $font-weight-semibold;
  }

  a {
    color: $color-link-ink;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  blockquote {
    padding-left: $spacing-14;
    border-left: 3px solid $color-border-strong;
    color: $color-ink-body;
  }

  hr {
    border: 0;
    border-top: 1px solid $color-border;
  }

  code {
    padding: 0 $spacing-04;
    border-radius: $spacing-04;
    background: $color-surface-soft;
    font-family: $font-family-mono;
    font-size: $font-size-body-s;
  }

  pre {
    padding: $spacing-14 $spacing-16;
    border-radius: $radius-m;
    background: $color-surface-soft;
    font-family: $font-family-mono;
    font-size: $font-size-body-s;
    line-height: $line-height-code;
    white-space: pre-wrap;

    code {
      padding: 0;
      background: none;
    }
  }

  // What the editor cannot represent shows as its source, set apart as something not edited here.
  pre[data-markdown-raw],
  code[data-markdown-raw-inline] {
    border: 1px dashed $color-border-strong;
    color: $color-ink-muted;
    cursor: default;
  }

  pre[data-markdown-raw] {
    padding: $spacing-08 $spacing-12;
  }

  table {
    border-collapse: collapse;
    font-size: $font-size-body;
  }

  th,
  td {
    min-width: 4em;
    padding: $spacing-06 $spacing-10;
    border: 1px solid $color-border;
    text-align: left;
    vertical-align: top;

    p {
      margin: 0;
    }
  }

  th {
    background: $color-surface-soft;
    font-weight: $font-weight-semibold;
  }

  :global(.ProseMirror-selectednode) {
    outline: 2px solid $color-focus;
    outline-offset: 2px;
  }

  :global(.selectedCell) {
    background: $color-link-soft;
  }
}

.markdownEditor_source {
  width: 100%;
  min-height: 20lh;
  padding: 0;
  border: 0;
  background: transparent;
  color: $color-ink;
  font-family: $font-family-mono;
  font-size: $font-size-body-s;
  line-height: $line-height-code;
  resize: none;
  field-sizing: content;

  // The caret shows where focus is, as in the formatted view.
  &:focus-visible {
    outline: none;
  }
}

.markdownEditor_linkForm {
  display: flex;
  flex-direction: column;
  gap: $spacing-16;
}

.markdownEditor_linkActions {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
  justify-content: flex-end;
  margin-top: $spacing-08;
}
</style>
