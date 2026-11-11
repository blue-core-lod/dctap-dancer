import axios, { AxiosError } from 'axios';
import type {
  Workspace,
  Folder,
  Shape,
  StatementRow,
  Namespace,
  WorkspaceOptions,
  ApiResponse,
  ValidationResult
} from '@/types';
import { addBluecoreAuth } from '@/bluecore'; // BLUECORE

/**
 * Detect the base path from the current URL.
 * Supports deployments at /dancer/, /bfe2/dancer/, or root /
 */
function getBasePath(): string {
  const path = window.location.pathname;
  // Match paths containing /dancer followed by end, slash, or more path
  const match = path.match(/^(.*\/dancer)(?:\/|$)/);
  if (match) {
    return match[1] + '/';
  }
  return '/';
}

const api = axios.create({
  baseURL: getBasePath() + 'api',
  headers: {
    'Content-Type': 'application/json'
  }
});
addBluecoreAuth(api); // BLUECORE: send the Keycloak token with API requests (see src/bluecore)

// Error handler
function handleError(error: AxiosError<ApiResponse>): never {
  if (error.response?.data?.error) {
    throw new Error(error.response.data.error);
  }
  throw new Error(error.message || 'An unexpected error occurred');
}

// Workspace API
export const workspaceApi = {
  async list(): Promise<Workspace[]> {
    try {
      const response = await api.get<ApiResponse<Workspace[]>>('/workspaces');
      return response.data.data || [];
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async get(id: string): Promise<Workspace> {
    try {
      const response = await api.get<ApiResponse<Workspace>>(`/workspaces/${id}`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async create(name: string): Promise<Workspace> {
    try {
      const response = await api.post<ApiResponse<Workspace>>('/workspaces', { name });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async update(id: string, name: string): Promise<Workspace> {
    try {
      const response = await api.put<ApiResponse<Workspace>>(`/workspaces/${id}`, { name });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/workspaces/${id}`);
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async duplicate(id: string, name: string): Promise<Workspace> {
    try {
      const response = await api.post<ApiResponse<Workspace>>(`/workspaces/${id}/duplicate`, { name });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async getUpdatedAt(id: string): Promise<number> {
    try {
      const response = await api.get<ApiResponse<{ updatedAt: number }>>(`/workspaces/${id}/updated-at`);
      return response.data.data!.updatedAt;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async getOptions(id: string): Promise<WorkspaceOptions> {
    try {
      const response = await api.get<ApiResponse<WorkspaceOptions>>(`/workspaces/${id}/options`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async updateOptions(id: string, options: Partial<WorkspaceOptions>): Promise<WorkspaceOptions> {
    try {
      const response = await api.put<ApiResponse<WorkspaceOptions>>(`/workspaces/${id}/options`, options);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Shape API
export const shapeApi = {
  async list(workspaceId: string): Promise<Shape[]> {
    try {
      const response = await api.get<ApiResponse<Shape[]>>(`/workspaces/${workspaceId}/shapes`);
      return response.data.data || [];
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async get(workspaceId: string, shapeId: string): Promise<Shape> {
    try {
      const response = await api.get<ApiResponse<Shape>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async create(workspaceId: string, shapeId: string, shapeLabel?: string): Promise<Shape> {
    try {
      const response = await api.post<ApiResponse<Shape>>(`/workspaces/${workspaceId}/shapes`, { shapeId, shapeLabel });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async update(workspaceId: string, shapeId: string, updates: { shapeId?: string; shapeLabel?: string; description?: string; resourceURI?: string; folderId?: number | null }): Promise<Shape> {
    try {
      const response = await api.put<ApiResponse<Shape>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}`, updates);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async delete(workspaceId: string, shapeId: string): Promise<void> {
    try {
      await api.delete(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}`);
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async getUsages(workspaceId: string, shapeId: string): Promise<string[]> {
    try {
      const response = await api.get<ApiResponse<{ usages: string[] }>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/usages`);
      return response.data.data!.usages;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async duplicate(workspaceId: string, shapeId: string): Promise<{ shape: Shape; rowsCopied: number }> {
    try {
      const response = await api.post<ApiResponse<{ shape: Shape; rowsCopied: number }>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/duplicate`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async existsInWorkspace(workspaceId: string, shapeId: string, targetWorkspaceId: string): Promise<boolean> {
    try {
      const response = await api.get<ApiResponse<{ exists: boolean }>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/exists-in/${targetWorkspaceId}`);
      return response.data.data!.exists;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async copyToWorkspace(workspaceId: string, shapeId: string, targetWorkspaceId: string): Promise<{ shape: Shape; rowsCopied: number; overwrote: boolean }> {
    try {
      const response = await api.post<ApiResponse<{ shape: Shape; rowsCopied: number; overwrote: boolean }>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/copy-to/${targetWorkspaceId}`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Row API
export const rowApi = {
  async list(workspaceId: string, shapeId: string): Promise<StatementRow[]> {
    try {
      const response = await api.get<ApiResponse<StatementRow[]>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows`);
      return response.data.data || [];
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async get(workspaceId: string, shapeId: string, rowId: number): Promise<StatementRow> {
    try {
      const response = await api.get<ApiResponse<StatementRow>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows/${rowId}`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async create(workspaceId: string, shapeId: string, data: Partial<StatementRow>): Promise<StatementRow> {
    try {
      const response = await api.post<ApiResponse<StatementRow>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows`, data);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async update(workspaceId: string, shapeId: string, rowId: number, data: Partial<StatementRow>): Promise<StatementRow> {
    try {
      const response = await api.put<ApiResponse<StatementRow>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows/${rowId}`, data);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async bulkUpdate(workspaceId: string, shapeId: string, rows: Partial<StatementRow>[]): Promise<StatementRow[]> {
    try {
      const response = await api.put<ApiResponse<StatementRow[]>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows`, { rows });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async delete(workspaceId: string, shapeId: string, rowId: number): Promise<void> {
    try {
      await api.delete(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows/${rowId}`);
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async bulkDelete(workspaceId: string, shapeId: string, rowIds: number[]): Promise<number> {
    try {
      const response = await api.delete<ApiResponse<{ deletedCount: number }>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows`, { data: { rowIds } });
      return response.data.data!.deletedCount;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async reorder(workspaceId: string, shapeId: string, rowIds: number[]): Promise<void> {
    try {
      await api.post<ApiResponse<void>>(`/workspaces/${workspaceId}/shapes/${encodeURIComponent(shapeId)}/rows/reorder`, { rowIds });
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Namespace API
export const namespaceApi = {
  async list(workspaceId: string): Promise<Namespace[]> {
    try {
      const response = await api.get<ApiResponse<Namespace[]>>(`/workspaces/${workspaceId}/namespaces`);
      return response.data.data || [];
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async create(workspaceId: string, prefix: string, namespace: string): Promise<Namespace> {
    try {
      const response = await api.post<ApiResponse<Namespace>>(`/workspaces/${workspaceId}/namespaces`, { prefix, namespace });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async update(workspaceId: string, prefix: string, namespace: string, newPrefix?: string): Promise<Namespace> {
    try {
      const body: { namespace: string; prefix?: string } = { namespace };
      if (newPrefix !== undefined) body.prefix = newPrefix;
      const response = await api.put<ApiResponse<Namespace>>(`/workspaces/${workspaceId}/namespaces/${encodeURIComponent(prefix)}`, body);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async delete(workspaceId: string, prefix: string): Promise<void> {
    try {
      await api.delete(`/workspaces/${workspaceId}/namespaces/${encodeURIComponent(prefix)}`);
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Import/Export API
export const importExportApi = {
  async importFile(file: File, name?: string): Promise<{ workspaceId: string; shapesCreated: number; rowsImported: number; warnings?: Array<{ message: string }> }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name) {
        formData.append('name', name);
      }
      const response = await api.post<ApiResponse<{ workspaceId: string; shapesCreated: number; rowsImported: number; warnings?: Array<{ message: string }> }>>('/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  getExportUrl(workspaceId: string, format: 'csv' | 'tsv' = 'csv'): string {
    return `${getBasePath()}api/workspaces/${workspaceId}/export?format=${format}`;
  },

  getDownloadDbUrl(workspaceId: string): string {
    return `${getBasePath()}api/workspaces/${workspaceId}/download-db`;
  },

  async importDb(file: File, name?: string): Promise<{ workspaceId: string; workspaceName: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name) {
        formData.append('name', name);
      }
      const response = await api.post<ApiResponse<{ workspaceId: string; workspaceName: string }>>('/import-db', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Validation API
export const validationApi = {
  async validateRow(workspaceId: string, shapeId: string, row: Partial<StatementRow>): Promise<ValidationResult> {
    try {
      const response = await api.post<ApiResponse<ValidationResult>>('/validate/row', { workspaceId, shapeId, row });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Marva Profile API
export interface MarvaProfileImportResult {
  workspaceId: string;
  workspaceName: string;
  shapesCreated: number;
  rowsCreated: number;
}

export const marvaProfileApi = {
  async importProfiles(workspaceName: string, profiles: unknown[]): Promise<MarvaProfileImportResult> {
    try {
      const response = await api.post<ApiResponse<MarvaProfileImportResult>>('/marva-profile/import', {
        workspaceName,
        profiles
      });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  getExportUrl(workspaceId: string): string {
    return `${getBasePath()}api/marva-profile/export/${workspaceId}`;
  }
};

// Starting Point API
export interface StartingPointImportResult {
  shapesCreated: number;
  rowsCreated: number;
  folderId: number;
}

export const startingPointApi = {
  async importFile(workspaceId: string, data: unknown): Promise<StartingPointImportResult> {
    try {
      const response = await api.post<ApiResponse<StartingPointImportResult>>(`/starting-point/import/${workspaceId}`, data);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async hasStartingPoints(workspaceId: string): Promise<boolean> {
    try {
      const response = await api.get<ApiResponse<{ hasStartingPoints: boolean }>>(`/starting-point/has/${workspaceId}`);
      return response.data.data!.hasStartingPoints;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  getExportUrl(workspaceId: string): string {
    return `${getBasePath()}api/starting-point/export/${workspaceId}`;
  }
};

// Config API
export const configApi = {
  async get(): Promise<{ allowDbUpload: boolean }> {
    try {
      const response = await api.get<ApiResponse<{ allowDbUpload: boolean }>>('/config');
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};

// Folder API
export const folderApi = {
  async list(workspaceId: string): Promise<Folder[]> {
    try {
      const response = await api.get<ApiResponse<Folder[]>>(`/workspaces/${workspaceId}/folders`);
      return response.data.data || [];
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async get(workspaceId: string, folderId: number): Promise<Folder> {
    try {
      const response = await api.get<ApiResponse<Folder>>(`/workspaces/${workspaceId}/folders/${folderId}`);
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async create(workspaceId: string, name: string): Promise<Folder> {
    try {
      const response = await api.post<ApiResponse<Folder>>(`/workspaces/${workspaceId}/folders`, { name });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async update(workspaceId: string, folderId: number, name: string): Promise<Folder> {
    try {
      const response = await api.put<ApiResponse<Folder>>(`/workspaces/${workspaceId}/folders/${folderId}`, { name });
      return response.data.data!;
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  },

  async delete(workspaceId: string, folderId: number): Promise<void> {
    try {
      await api.delete(`/workspaces/${workspaceId}/folders/${folderId}`);
    } catch (error) {
      handleError(error as AxiosError<ApiResponse>);
    }
  }
};
