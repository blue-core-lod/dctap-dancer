<template>
  <div class="home">
    <header class="header">
      <h1>DCTap Dancer</h1>
      <p class="subtitle">Dublin Core Tabular Application Profile Editor</p>
    </header>

    <main class="main">
      <div class="actions">
        <button class="btn btn-primary" @click="showNewDialog = true">
          New Workspace
        </button>
        <button class="btn btn-secondary" @click="triggerImport">
          Import CSV/TSV
        </button>
        <button class="btn btn-secondary" @click="triggerMarvaImport">
          Import Marva Profile
        </button>
        <button v-if="allowDbUpload" class="btn btn-secondary" @click="triggerDbImport">
          Load Workspace (.db)
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,.tsv"
          style="display: none"
          @change="handleFileSelect"
        />
        <input
          ref="marvaFileInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleMarvaFileSelect"
        />
        <input
          ref="dbFileInput"
          type="file"
          accept=".db"
          style="display: none"
          @change="handleDbFileSelect"
        />
      </div>

      <div v-if="loading" class="loading">Loading workspaces...</div>

      <div v-else-if="error" class="error">
        {{ error }}
        <button class="btn btn-link" @click="loadWorkspaces">Retry</button>
      </div>

      <div v-else-if="workspaces.length === 0" class="empty">
        <p>No workspaces yet. Create a new workspace or import a CSV/TSV file to get started.</p>
      </div>

      <div v-else class="workspace-list">
        <div
          v-for="workspace in sortedWorkspaces"
          :key="workspace.id"
          class="workspace-card"
        >
          <div class="workspace-info">
            <h3 class="workspace-name">
              <span v-if="workspace.isLocked" class="lock-icon" title="This workspace is locked (read-only)">&#128274;</span>
              {{ workspace.name }}
            </h3>
            <p class="workspace-meta">
              <span v-if="workspace.isLocked" class="locked-badge">Read-only</span>

              <!-- ### BLUECORE START ### -->
              <template v-if="workspace.sourceName && workspace.sourceUpdatedAt"><a v-if="workspace.sourceUrl" :href="workspace.sourceUrl" target="_blank" rel="noopener noreferrer">{{ workspace.sourceName }}</a><template v-else>{{ workspace.sourceName }}</template> last updated on: {{ formatDate(workspace.sourceUpdatedAt) }}</template><!-- BLUECORE: synced "LC Latest" -->
              <template v-else>
              Created: {{ formatDate(workspace.createdAt) }}
              <span v-if="workspace.updatedAt !== workspace.createdAt">
                | Modified: {{ formatDate(workspace.updatedAt) }}
              </span>
              </template>
              <!-- ### BLUECORE END ### -->

            </p>
          </div>
          <div class="workspace-actions">
            <button class="btn btn-primary" @click="openWorkspace(workspace.id)">
              Open
            </button>
            <button class="btn btn-secondary" @click="duplicateWorkspace(workspace)">
              Duplicate
            </button>
            <a class="btn btn-secondary" :href="getDownloadDbUrl(workspace.id)" title="Download workspace as .db file">
              Download
            </a>
            <button
              class="btn btn-danger"
              @click="confirmDelete(workspace)"
              :disabled="workspace.isLocked"
              :title="workspace.isLocked ? 'Cannot delete a locked workspace' : ''"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- New Workspace Dialog -->
    <div v-if="showNewDialog" class="dialog-overlay" @click.self="showNewDialog = false">
      <div class="dialog">
        <h2>New Workspace</h2>
        <form @submit.prevent="createWorkspace">
          <div class="form-group">
            <label for="name">Workspace Name</label>
            <input
              id="name"
              v-model="newWorkspaceName"
              type="text"
              placeholder="Enter workspace name"
              required
              autofocus
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="showNewDialog = false">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!newWorkspaceName.trim()">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Duplicate Dialog -->
    <div v-if="showDuplicateDialog" class="dialog-overlay" @click.self="showDuplicateDialog = false">
      <div class="dialog">
        <h2>Duplicate Workspace</h2>
        <form @submit.prevent="doDuplicate">
          <div class="form-group">
            <label for="dupName">New Workspace Name</label>
            <input
              id="dupName"
              v-model="duplicateName"
              type="text"
              placeholder="Enter new name"
              required
              autofocus
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="showDuplicateDialog = false">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!duplicateName.trim()">
              Duplicate
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="dialog">
        <h2>Delete Workspace</h2>
        <p>Are you sure you want to delete "{{ workspaceToDelete?.name }}"? This action cannot be undone.</p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="showDeleteDialog = false">
            Cancel
          </button>
          <button class="btn btn-danger" @click="doDelete">
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- CSV/TSV Import Dialog -->
    <div v-if="showCsvImportDialog" class="dialog-overlay" @click.self="cancelCsvImport">
      <div class="dialog">
        <h2>Import CSV/TSV</h2>
        <p class="dialog-info">File: {{ csvFileName }}</p>
        <form @submit.prevent="doCsvImport">
          <div class="form-group">
            <label for="csvWorkspaceName">Workspace Name</label>
            <input
              id="csvWorkspaceName"
              v-model="csvWorkspaceName"
              type="text"
              placeholder="Enter workspace name"
              required
              autofocus
            />
          </div>
          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="csvUseLCColumns" />
              Use LC specific headers/fields for this import
            </label>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="cancelCsvImport">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!csvWorkspaceName.trim() || csvImporting">
              {{ csvImporting ? 'Importing...' : 'Import' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Marva Import Dialog -->
    <div v-if="showMarvaImportDialog" class="dialog-overlay" @click.self="cancelMarvaImport">
      <div class="dialog">
        <h2>Import Marva Profile</h2>
        <p class="dialog-info">Found {{ marvaProfiles.length }} profile(s) in the file.</p>
        <form @submit.prevent="doMarvaImport">
          <div class="form-group">
            <label for="marvaWorkspaceName">Workspace Name</label>
            <input
              id="marvaWorkspaceName"
              v-model="marvaWorkspaceName"
              type="text"
              placeholder="Enter workspace name"
              required
              autofocus
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="cancelMarvaImport">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!marvaWorkspaceName.trim() || marvaImporting">
              {{ marvaImporting ? 'Importing...' : 'Import' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- DB Import Dialog -->
    <div v-if="showDbImportDialog" class="dialog-overlay" @click.self="cancelDbImport">
      <div class="dialog">
        <h2>Load Workspace Database</h2>
        <p class="dialog-info">File: {{ dbFileName }}</p>
        <form @submit.prevent="doDbImport">
          <div class="form-group">
            <label for="dbWorkspaceName">Workspace Name</label>
            <input
              id="dbWorkspaceName"
              v-model="dbWorkspaceName"
              type="text"
              placeholder="Enter workspace name (or leave blank to use name from file)"
              autofocus
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="cancelDbImport">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="dbImporting">
              {{ dbImporting ? 'Loading...' : 'Load' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { workspaceApi, importExportApi, marvaProfileApi, configApi } from '@/services/api';
import type { Workspace } from '@/types';

export default defineComponent({
  name: 'HomeView',
  setup() {
    const router = useRouter();
    const workspaces = ref<Workspace[]>([]);
    const loading = ref(true);
    const error = ref<string | null>(null);
    const fileInput = ref<HTMLInputElement | null>(null);
    const marvaFileInput = ref<HTMLInputElement | null>(null);

    // Dialog states
    const showNewDialog = ref(false);
    const newWorkspaceName = ref('');

    const showDuplicateDialog = ref(false);
    const duplicateName = ref('');
    const workspaceToDuplicate = ref<Workspace | null>(null);

    const showDeleteDialog = ref(false);
    const workspaceToDelete = ref<Workspace | null>(null);

    // CSV/TSV import states
    const showCsvImportDialog = ref(false);
    const csvFileName = ref('');
    const csvWorkspaceName = ref('');
    const csvImporting = ref(false);
    const csvFileToImport = ref<File | null>(null);
    const csvUseLCColumns = ref(false);

    // Marva import states
    const showMarvaImportDialog = ref(false);
    const marvaProfiles = ref<unknown[]>([]);
    const marvaWorkspaceName = ref('');
    const marvaImporting = ref(false);

    // DB import states
    const dbFileInput = ref<HTMLInputElement | null>(null);
    const allowDbUpload = ref(false);
    const showDbImportDialog = ref(false);
    const dbFileName = ref('');
    const dbWorkspaceName = ref('');
    const dbImporting = ref(false);
    const dbFileToImport = ref<File | null>(null);

    // Computed property to sort workspaces with locked ones at the top
    const sortedWorkspaces = computed(() => {
      return [...workspaces.value].sort((a, b) => {
        // Locked workspaces come first
        if (a.isLocked && !b.isLocked) return -1;
        if (!a.isLocked && b.isLocked) return 1;
        // Within same lock status, sort by name
        return a.name.localeCompare(b.name);
      });
    });

    async function loadWorkspaces() {
      loading.value = true;
      error.value = null;
      try {
        workspaces.value = await workspaceApi.list();
      } catch (e) {
        error.value = (e as Error).message;
      } finally {
        loading.value = false;
      }
    }

    async function createWorkspace() {
      if (!newWorkspaceName.value.trim()) return;
      try {
        const workspace = await workspaceApi.create(newWorkspaceName.value.trim());
        showNewDialog.value = false;
        newWorkspaceName.value = '';
        router.push({ name: 'workspace', params: { id: workspace.id } });
      } catch (e) {
        alert((e as Error).message);
      }
    }

    function openWorkspace(id: string) {
      router.push({ name: 'workspace', params: { id } });
    }

    function duplicateWorkspace(workspace: Workspace) {
      workspaceToDuplicate.value = workspace;
      duplicateName.value = `${workspace.name} (copy)`;
      showDuplicateDialog.value = true;
    }

    async function doDuplicate() {
      if (!workspaceToDuplicate.value || !duplicateName.value.trim()) return;
      try {
        await workspaceApi.duplicate(workspaceToDuplicate.value.id, duplicateName.value.trim());
        showDuplicateDialog.value = false;
        workspaceToDuplicate.value = null;
        duplicateName.value = '';
        await loadWorkspaces();
      } catch (e) {
        alert((e as Error).message);
      }
    }

    function confirmDelete(workspace: Workspace) {
      workspaceToDelete.value = workspace;
      showDeleteDialog.value = true;
    }

    async function doDelete() {
      if (!workspaceToDelete.value) return;
      try {
        await workspaceApi.delete(workspaceToDelete.value.id);
        showDeleteDialog.value = false;
        workspaceToDelete.value = null;
        await loadWorkspaces();
      } catch (e) {
        alert((e as Error).message);
      }
    }

    function triggerImport() {
      fileInput.value?.click();
    }

    function handleFileSelect(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      // Store the file and show the dialog to prompt for name
      csvFileToImport.value = file;
      csvFileName.value = file.name;
      // Default workspace name to filename without extension
      csvWorkspaceName.value = file.name.replace(/\.(csv|tsv)$/i, '');
      showCsvImportDialog.value = true;
      input.value = ''; // Reset input
    }

    async function doCsvImport() {
      if (!csvWorkspaceName.value.trim() || !csvFileToImport.value) return;

      csvImporting.value = true;
      try {
        const result = await importExportApi.importFile(csvFileToImport.value, csvWorkspaceName.value.trim());
        if (csvUseLCColumns.value) {
          await workspaceApi.updateOptions(result.workspaceId, { useLCColumns: true });
        }
        showCsvImportDialog.value = false;
        csvFileToImport.value = null;
        csvFileName.value = '';
        csvWorkspaceName.value = '';
        csvUseLCColumns.value = false;
        if (result.warnings && result.warnings.length > 0) {
          alert(`Imported with warnings:\n${result.warnings.map(w => w.message).join('\n')}`);
        }
        router.push({ name: 'workspace', params: { id: result.workspaceId } });
      } catch (e) {
        alert((e as Error).message);
      } finally {
        csvImporting.value = false;
      }
    }

    function cancelCsvImport() {
      showCsvImportDialog.value = false;
      csvFileToImport.value = null;
      csvFileName.value = '';
      csvWorkspaceName.value = '';
      csvUseLCColumns.value = false;
    }

    function formatDate(timestamp: number) {
      return new Date(timestamp * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function triggerMarvaImport() {
      marvaFileInput.value?.click();
    }

    async function handleMarvaFileSelect(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);

        // Handle both array and single profile formats
        const profiles = Array.isArray(json) ? json : [json];

        if (profiles.length === 0) {
          alert('No profiles found in the file.');
          input.value = '';
          return;
        }

        marvaProfiles.value = profiles;
        marvaWorkspaceName.value = '';
        showMarvaImportDialog.value = true;
      } catch (e) {
        alert(`Failed to parse JSON file: ${(e as Error).message}`);
      }
      input.value = '';
    }

    async function doMarvaImport() {
      if (!marvaWorkspaceName.value.trim() || marvaProfiles.value.length === 0) return;

      marvaImporting.value = true;
      try {
        const result = await marvaProfileApi.importProfiles(
          marvaWorkspaceName.value.trim(),
          marvaProfiles.value
        );
        showMarvaImportDialog.value = false;
        marvaProfiles.value = [];
        marvaWorkspaceName.value = '';
        router.push({ name: 'workspace', params: { id: result.workspaceId } });
      } catch (e) {
        alert((e as Error).message);
      } finally {
        marvaImporting.value = false;
      }
    }

    function cancelMarvaImport() {
      showMarvaImportDialog.value = false;
      marvaProfiles.value = [];
      marvaWorkspaceName.value = '';
    }

    function getDownloadDbUrl(workspaceId: string): string {
      return importExportApi.getDownloadDbUrl(workspaceId);
    }

    function triggerDbImport() {
      dbFileInput.value?.click();
    }

    function handleDbFileSelect(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      dbFileToImport.value = file;
      dbFileName.value = file.name;
      dbWorkspaceName.value = '';
      showDbImportDialog.value = true;
      input.value = '';
    }

    async function doDbImport() {
      if (!dbFileToImport.value) return;

      dbImporting.value = true;
      try {
        const name = dbWorkspaceName.value.trim() || undefined;
        const result = await importExportApi.importDb(dbFileToImport.value, name);
        showDbImportDialog.value = false;
        dbFileToImport.value = null;
        dbFileName.value = '';
        dbWorkspaceName.value = '';
        router.push({ name: 'workspace', params: { id: result.workspaceId } });
      } catch (e) {
        alert((e as Error).message);
      } finally {
        dbImporting.value = false;
      }
    }

    function cancelDbImport() {
      showDbImportDialog.value = false;
      dbFileToImport.value = null;
      dbFileName.value = '';
      dbWorkspaceName.value = '';
    }

    async function loadConfig() {
      try {
        const config = await configApi.get();
        allowDbUpload.value = config.allowDbUpload;
      } catch {
        // Config endpoint not available, leave defaults
      }
    }

    onMounted(() => {
      loadWorkspaces();
      loadConfig();
    });

    return {
      workspaces,
      sortedWorkspaces,
      loading,
      error,
      fileInput,
      marvaFileInput,
      dbFileInput,
      showNewDialog,
      newWorkspaceName,
      showDuplicateDialog,
      duplicateName,
      workspaceToDuplicate,
      showDeleteDialog,
      workspaceToDelete,
      showCsvImportDialog,
      csvFileName,
      csvWorkspaceName,
      csvImporting,
      csvUseLCColumns,
      showMarvaImportDialog,
      marvaProfiles,
      marvaWorkspaceName,
      marvaImporting,
      allowDbUpload,
      showDbImportDialog,
      dbFileName,
      dbWorkspaceName,
      dbImporting,
      loadWorkspaces,
      createWorkspace,
      openWorkspace,
      duplicateWorkspace,
      doDuplicate,
      confirmDelete,
      doDelete,
      triggerImport,
      handleFileSelect,
      doCsvImport,
      cancelCsvImport,
      formatDate,
      triggerMarvaImport,
      handleMarvaFileSelect,
      doMarvaImport,
      cancelMarvaImport,
      getDownloadDbUrl,
      triggerDbImport,
      handleDbFileSelect,
      doDbImport,
      cancelDbImport
    };
  }
});
</script>

<style scoped>
.home {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2rem;
  color: #2c3e50;
}

.subtitle {
  color: #666;
  margin-top: 0.5rem;
}

.main {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-primary {
  background-color: #3498db;
  color: white;
}

.btn-primary:hover {
  background-color: #2980b9;
}

.btn-primary:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #ecf0f1;
  color: #2c3e50;
}

.btn-secondary:hover {
  background-color: #d5dbdb;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background-color: #c0392b;
}

.btn-danger:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.btn-link {
  background: none;
  color: #3498db;
  text-decoration: underline;
}

.loading,
.error,
.empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.error {
  color: #e74c3c;
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.workspace-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  transition: box-shadow 0.2s;
}

.workspace-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.workspace-name {
  font-size: 1.1rem;
  color: #2c3e50;
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.lock-icon {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.locked-badge {
  display: inline-block;
  background: #f39c12;
  color: white;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  margin-right: 0.5rem;
  font-weight: 600;
  text-transform: uppercase;
}

.workspace-meta {
  font-size: 0.85rem;
  color: #666;
}

.workspace-actions {
  display: flex;
  gap: 0.5rem;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  min-width: 400px;
  max-width: 90%;
}

.dialog h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.form-group input:focus {
  outline: none;
  border-color: #3498db;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.dialog-info {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
</style>
