<!-- A project file open in its tab (`?path=`), shown by its kind; an unknown project, or no path, goes to the project's screen, which sends an unknown project home. -->

<script lang="ts" setup>
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRoute, useRouter } from 'nuxt/app';
import { computed, watch } from 'vue';

import { ProjectStore } from '@/projects/ProjectStore.js';

import ProjectFileView from './ProjectFileView.vue';

const route = useRoute();
const router = useRouter();
const projects = useService(ProjectStore);

const projectId = computed(() => String(route.params['projectId']));
const path = computed(() => {
  const value = route.query['path'];
  return typeof value === 'string' && value !== '' ? value : undefined;
});
const known = computed(() => projects.state.projects?.some(project => project.id === projectId.value));

watch(
  () => [projects.state.projects, known.value, path.value] as const,
  ([list, isKnown, filePath]) => {
    if ((list && !isKnown) || filePath === undefined) {
      void router.replace({ name: 'project', params: { projectId: projectId.value } });
    }
  },
  { immediate: true },
);
</script>

<template>
  <ProjectFileView
    v-if="known && path !== undefined"
    :project-id="projectId"
    :path="path"
  />
</template>
