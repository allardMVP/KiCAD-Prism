import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { isDialogSubmitShortcut } from "@/lib/dialog-shortcuts";
import { FolderTreeItem, Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MoveProjectDialogProps {
  project: Project | null;
  folders: FolderTreeItem[];
  isMoving: boolean;
  onClose: () => void;
  onConfirm: (projectId: string, folderId: string | null) => void | Promise<void>;
  getProjectDisplayName: (project: Project) => string;
}

const ROOT_VALUE = "__root__";

export function MoveProjectDialog({
  project,
  folders,
  isMoving,
  onClose,
  onConfirm,
  getProjectDisplayName,
}: MoveProjectDialogProps) {
  const [targetFolderId, setTargetFolderId] = useState(ROOT_VALUE);

  const folderPathById = useMemo(() => {
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const paths = new Map<string, string>();
    const MAX_DEPTH = 64;

    const buildPath = (folderId: string): string => {
      const cached = paths.get(folderId);
      if (cached) {
        return cached;
      }

      const names: string[] = [];
      const visited = new Set<string>();
      let currentId: string | null = folderId;
      let depth = 0;

      while (currentId && depth < MAX_DEPTH) {
        if (visited.has(currentId)) {
          const fallback = folderById.get(folderId)?.name ?? folderId;
          paths.set(folderId, fallback);
          return fallback;
        }

        visited.add(currentId);
        const folder = folderById.get(currentId);
        if (!folder) {
          const fallback = folderById.get(folderId)?.name ?? folderId;
          paths.set(folderId, fallback);
          return fallback;
        }

        names.unshift(folder.name);
        currentId = folder.parent_id ?? null;
        depth += 1;
      }

      if (depth >= MAX_DEPTH) {
        const fallback = folderById.get(folderId)?.name ?? folderId;
        paths.set(folderId, fallback);
        return fallback;
      }

      const resolvedPath = names.length > 0 ? names.join(" / ") : folderById.get(folderId)?.name ?? folderId;
      paths.set(folderId, resolvedPath);
      return resolvedPath;
    };

    folders.forEach((folder) => {
      buildPath(folder.id);
    });

    return paths;
  }, [folders]);

  useEffect(() => {
    setTargetFolderId(project?.folder_id ?? ROOT_VALUE);
  }, [project]);

  const submit = () => {
    if (!project) {
      return;
    }
    void onConfirm(project.id, targetFolderId === ROOT_VALUE ? null : targetFolderId);
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isDialogSubmitShortcut(event)) {
      return;
    }

    event.preventDefault();
    if (isMoving || !project) {
      return;
    }

    submit();
  };

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onKeyDown={handleDialogKeyDown}>
        <DialogHeader>
          <DialogTitle>Move Project</DialogTitle>
          <DialogDescription>Select where this project should live.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Project: {project ? getProjectDisplayName(project) : ""}
          </p>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={targetFolderId}
            onChange={(event) => setTargetFolderId(event.target.value)}
          >
            <option value={ROOT_VALUE}>Workspace Root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folderPathById.get(folder.id) ?? folder.name}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isMoving || !project}>
            {isMoving ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
