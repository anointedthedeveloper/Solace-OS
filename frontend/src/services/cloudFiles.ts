import { api, apiAll, apiBlob } from './api';

/** Server-managed files ("Solace Cloud"): real persistence on the Solace backend, per-account access control. */
export interface CloudItem {
  id: string;
  parentId?: string;
  name: string;
  kind: 'file' | 'folder';
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string;
}

export interface CloudUsage {
  usedBytes: number;
  quotaBytes: number;
  maxFileBytes: number;
}

const q = (id: string | null) => (id ? `?parentId=${encodeURIComponent(id)}` : '');

export const cloud = {
  list: (parentId: string | null) => apiAll<CloudItem>(`/files${q(parentId)}`),
  trash: () => apiAll<CloudItem>('/files/trash'),
  usage: () => api<CloudUsage>('/files/usage'),
  createFolder: (parentId: string | null, name: string) => api<CloudItem>('/files/folders', { method: 'POST', body: { parentId: parentId ?? undefined, name } }),
  upload: (parentId: string | null, file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return api<CloudItem>(`/files${q(parentId)}`, { method: 'POST', form });
  },
  download: (id: string) => apiBlob(`/files/${encodeURIComponent(id)}/content`),
  rename: (id: string, name: string) => api<CloudItem>(`/files/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }),
  move: (id: string, parentId: string | null) => api<CloudItem>(`/files/${encodeURIComponent(id)}`, { method: 'PATCH', body: { move: true, parentId } }),
  toTrash: (id: string) => api<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restore: (id: string) => api<CloudItem>(`/files/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  deleteForever: (id: string) => api<void>(`/files/${encodeURIComponent(id)}?permanent=true`, { method: 'DELETE' }),
  emptyTrash: () => api<{ deleted: number }>('/files/trash', { method: 'DELETE' }),
};
