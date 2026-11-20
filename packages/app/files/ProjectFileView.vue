<!-- A project file shown by its kind (frames 06, 18): Markdown in the editor saved as the person types, plain text and CSV read-only, an image or a PDF previewed, anything else to open in its default app; with the agent writing in it (editing off, Stop the agent) or waiting while the person types (frame 31: editing on, Let it write now), Not saved, This file is gone and agent's change (Keep mine or Take the agent's) banners. Takes the project and the path as props, so a side view shows it too. -->

<script lang="ts">
export const ProjectFileViewProps = {
  projectId: { type: String, required: true },
  /** Relative to the project's folder. */
  path: { type: String, required: true },
} as const;
</script>

<script lang="ts" setup>
import { Hourglass, PencilLine, Play, RefreshCw, Square } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { computed, onScopeDispose, ref } from 'vue';

import { ConversationStopEndpoint } from '@piko/common/api/ConversationStopEndpoint.js';
import { ProjectFileOpenEndpoint } from '@piko/common/api/ProjectFileOpenEndpoint.js';
import { isOpenableFile } from '@piko/common/utils/isOpenableFile.js';
import Button from '@piko/ui/Button.vue';
import CsvPreview from '@piko/ui/CsvPreview.vue';
import FileElsewhere from '@piko/ui/FileElsewhere.vue';
import FileLayout from '@piko/ui/FileLayout.vue';
import ImagePreview from '@piko/ui/ImagePreview.vue';
import MarkdownEditor from '@piko/ui/MarkdownEditor.vue';
import PdfPreview from '@piko/ui/PdfPreview.vue';
import Spinner from '@piko/ui/Spinner.vue';
import StatusBanner from '@piko/ui/StatusBanner.vue';
import TextPreview from '@piko/ui/TextPreview.vue';
import { formatChangedAt } from '@piko/ui/utils/formatChangedAt.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';

import { FileAgentStore } from './FileAgentStore.js';
import { fileTitle } from './fileTitle.js';
import * as l from './ProjectFileView.loc.js';
import { useProjectFile } from './useProjectFile.js';
import { useProjectFileUrl } from './useProjectFileUrl.js';

/** How often "now" moves on, so "just now" ages without a reload. */
const CLOCK_TICK_MS = 30_000;

const props = defineProps(ProjectFileViewProps);

const daemon = useService(DaemonClient);
const fileAgents = useService(FileAgentStore);
const t = useTranslate();
const language = useLanguage();
const logger = useLogger();

const file = useProjectFile({ projectId: () => props.projectId, path: () => props.path });
/** Saves what the person typed now; before editing is turned off, nothing typed is left waiting. */
defineExpose({ flush: file.flush });
const url = useProjectFileUrl({
  projectId: () => props.projectId,
  path: () => props.path,
  updatedAt: () => file.updatedAt,
  enabled: () => file.view === 'image' || file.view === 'pdf',
});
const now = ref(Date.now());
const title = computed(() => fileTitle(props.path));
const name = computed(() => props.path.slice(props.path.lastIndexOf('/') + 1));
const agentWriting = computed(() => file.agent?.state === 'writing');
/** The agent holds its change while the person types: she keeps editing. */
const agentWaiting = computed(() => file.agent?.state === 'waiting');
const openable = computed(() => isOpenableFile(name.value));
/** Shown in the file's own place: a preview whose bytes could not be loaded is a file to open elsewhere. */
const shownView = computed(() => (url.failed ? 'elsewhere' : file.view));
const meta = computed(() => {
  const kind = kindLabel();
  if (file.updatedAt === null || kind === undefined) {
    return kind;
  }
  const when = formatChangedAt({ changedAt: file.updatedAt, now: now.value, language: language.value });
  return t(l.metaChanged, { kind, when });
});

const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS);
onScopeDispose(() => clearInterval(clock));

async function stopAgent() {
  const agent = file.agent;
  if (!agent) {
    return;
  }
  const fields = { projectId: props.projectId, conversationId: agent.conversationId };
  try {
    await daemon(ConversationStopEndpoint, fields);
  } catch (error) {
    // The banner stays while the agent writes; the person can try again.
    logger.warn('Agent not stopped from its file', { ...fields, error });
  }
}

function letAgentWrite() {
  return fileAgents.release(props.projectId, props.path);
}

async function open() {
  try {
    const result = await daemon(ProjectFileOpenEndpoint, { projectId: props.projectId, path: props.path });
    if (!('opened' in result)) {
      logger.warn('Project file not opened in its default app', {
        projectId: props.projectId,
        path: props.path,
        result,
      });
    }
  } catch (error) {
    logger.warn('Project file could not be opened in its default app', {
      projectId: props.projectId,
      path: props.path,
      error,
    });
  }
}

function kindLabel() {
  switch (shownView.value) {
    case 'csv':
      return t(l.kindCsv);
    case 'text':
      return t(l.kindText);
    case 'image':
      return t(l.kindImage);
    case 'pdf':
      return t(l.kindPdf);
    case 'markdown':
    case 'elsewhere':
    case null:
      return undefined;
    default:
      return assertNever(shownView.value);
  }
}
</script>

<template>
  <FileLayout
    :title="title"
    :variant="shownView === 'markdown' || shownView === 'elsewhere' || shownView === null ? 'document' : 'preview'"
    :meta="meta"
    :openable="openable"
    @open="open"
  >
    <template
      v-if="file.gone || agentWriting || agentWaiting || file.saveProblem || file.loadFailed"
      #banner
    >
      <StatusBanner
        v-if="file.gone"
        :title="t(l.goneTitle)"
        :body="t(l.goneBody)"
      />
      <StatusBanner
        v-else-if="agentWriting"
        tone="agent"
        :icon="PencilLine"
        :title="t(l.agentWritingTitle)"
        :body="t(l.agentWritingBody)"
        :action-label="t(l.stopAgent)"
        :action-icon="Square"
        @action="stopAgent"
      />
      <StatusBanner
        v-else-if="file.saveProblem === 'failed'"
        :title="t(l.notSavedTitle)"
        :body="t(l.notSavedFailedBody)"
        :action-label="t(l.retry)"
        :action-icon="RefreshCw"
        @action="file.retry()"
      />
      <StatusBanner
        v-else-if="file.saveProblem === 'tooLarge'"
        :title="t(l.notSavedTitle)"
        :body="t(l.notSavedTooLargeBody)"
      />
      <StatusBanner
        v-else-if="file.saveProblem === 'changedOnDisk' && file.disk"
        :title="t(l.conflictTitle)"
        :body="t(l.conflictBody)"
      >
        <template #actions>
          <Button
            variant="attention"
            @click="file.keepMine()"
          >
            {{ t(l.keepMine) }}
          </Button>
          <Button
            variant="attention"
            @click="file.takeDisk()"
          >
            {{ t(l.takeDisk) }}
          </Button>
        </template>
      </StatusBanner>
      <StatusBanner
        v-else-if="file.saveProblem === 'changedOnDisk'"
        :title="t(l.notSavedTitle)"
        :body="t(l.notSavedChangedBody)"
      />
      <StatusBanner
        v-else-if="agentWaiting && !file.loadFailed"
        tone="waiting"
        :icon="Hourglass"
        :title="t(l.agentWaitingTitle)"
        :body="t(l.agentWaitingBody)"
        :action-label="t(l.letAgentWrite)"
        :action-icon="Play"
        @action="letAgentWrite"
      />
      <StatusBanner
        v-else
        :title="t(l.loadFailedTitle)"
        :body="t(l.loadFailedBody)"
        :action-label="t(l.retry)"
        :action-icon="RefreshCw"
        @action="file.retry()"
      />
    </template>

    <MarkdownEditor
      v-if="shownView === 'markdown'"
      :markdown="file.content"
      :label="title"
      :readonly="file.gone || agentWriting"
      @update:markdown="file.edit"
    />
    <TextPreview
      v-else-if="shownView === 'text'"
      :text="file.content"
    />
    <CsvPreview
      v-else-if="shownView === 'csv'"
      :text="file.content"
    />
    <ImagePreview
      v-else-if="shownView === 'image'"
      :src="url.src"
      :alt="name"
      @error="url.fallback()"
    />
    <PdfPreview
      v-else-if="shownView === 'pdf'"
      :src="url.src"
      :title="name"
    />
    <FileElsewhere
      v-else-if="shownView === 'elsewhere'"
      :name="name"
      :reason="file.tooLarge ? 'tooLarge' : 'unsupported'"
      :openable="openable"
      @open="open"
    />
    <Spinner
      v-else-if="!file.loadFailed"
      :class="$style.projectFileView_spinner"
      :label="t(l.loading)"
    />
  </FileLayout>
</template>

<style lang="scss" module>
.projectFileView_spinner {
  align-self: center;
  font-size: $font-size-heading;
}
</style>
