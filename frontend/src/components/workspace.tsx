import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import {
  AppWindow,
  ChevronRight,
  Folder,
  FolderPlus,
  Grid3X3,
  List,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { FolderTreeItem, Project } from "@/types/project";
import { ProjectCard } from "./project-card";
import { ImportDialog } from "./import-dialog";
import { SettingsDialog } from "./settings-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type WorkspaceSection = "projects" | "apps";
type ViewMode = "gallery" | "list";

type SearchProject = Project & {
  folder_path: string;
};

const PROJECT_GRID_CLASS = "grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

interface WorkspaceProps {
  searchQuery: string;
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string; message?: string };
    return payload.detail || payload.message || fallback;
  } catch {
    return fallback;
  }
}

export function Workspace({ searchQuery }: WorkspaceProps) {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<FolderTreeItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<WorkspaceSection>("projects");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [folderToRename, setFolderToRename] = useState<FolderTreeItem | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<FolderTreeItem | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const [projectToMove, setProjectToMove] = useState<Project | null>(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState("__root__");
  const [isMovingProject, setIsMovingProject] = useState(false);

  const getProjectDisplayName = (project: Project) => project.display_name || project.name;

  const fetchWorkspaceData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [projectsResponse, foldersResponse] = await Promise.all([
        fetch("/api/projects/"),
        fetch("/api/folders/tree"),
      ]);

      if (!projectsResponse.ok) {
        throw new Error(await getErrorMessage(projectsResponse, "Failed to load projects"));
      }

      const projectPayload = (await projectsResponse.json()) as Project[];
      setProjects(projectPayload);

      if (foldersResponse.ok) {
        const folderPayload = (await foldersResponse.json()) as FolderTreeItem[];
        setFolders(folderPayload);
      } else {
        setFolders([]);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "An error occurred while loading workspace";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceData();
  }, []);

  const folderById = useMemo(() => {
    const lookup = new Map<string, FolderTreeItem>();
    folders.forEach((folder) => {
      lookup.set(folder.id, folder);
    });
    return lookup;
  }, [folders]);

  useEffect(() => {
    if (currentFolderId && !folderById.has(currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [currentFolderId, folderById]);

  const visibleFolders = useMemo(() => {
    return folders
      .filter((folder) => (folder.parent_id ?? null) === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, currentFolderId]);

  const visibleProjects = useMemo(() => {
    return projects
      .filter((project) => (project.folder_id ?? null) === currentFolderId)
      .sort((a, b) => getProjectDisplayName(a).localeCompare(getProjectDisplayName(b)));
  }, [projects, currentFolderId]);

  const searchProjects = useMemo<SearchProject[]>(() => {
    const getFolderPath = (folderId?: string | null) => {
      if (!folderId) {
        return "Workspace Root";
      }

      const names: string[] = [];
      let activeId: string | null = folderId;
      let guard = 0;

      while (activeId && guard < 64) {
        const folder = folderById.get(activeId);
        if (!folder) {
          break;
        }
        names.unshift(folder.name);
        activeId = folder.parent_id ?? null;
        guard += 1;
      }

      return names.length > 0 ? names.join(" / ") : "Workspace Root";
    };

    return projects.map((project) => ({
      ...project,
      folder_path: getFolderPath(project.folder_id),
    }));
  }, [projects, folderById]);

  const searchEngine = useMemo(() => {
    return new Fuse(searchProjects, {
      keys: [
        { name: "name", weight: 2 },
        { name: "display_name", weight: 2 },
        { name: "description", weight: 1.5 },
        { name: "parent_repo", weight: 1 },
        { name: "sub_path", weight: 1 },
        { name: "folder_path", weight: 0.75 },
        { name: "last_modified", weight: 0.5 },
      ],
      threshold: 0.35,
      includeScore: true,
      ignoreLocation: true,
    });
  }, [searchProjects]);

  const isSearching = searchQuery.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) {
      return [] as SearchProject[];
    }

    return searchEngine.search(searchQuery.trim()).map((result) => result.item);
  }, [isSearching, searchEngine, searchQuery]);

  const breadcrumbs = useMemo(() => {
    const trail: FolderTreeItem[] = [];
    let activeId = currentFolderId;
    let guard = 0;

    while (activeId && guard < 64) {
      const folder = folderById.get(activeId);
      if (!folder) {
        break;
      }
      trail.unshift(folder);
      activeId = folder.parent_id ?? null;
      guard += 1;
    }

    return trail;
  }, [currentFolderId, folderById]);

  const openProject = (project: Project) => {
    navigate(`/project/${project.id}`);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("Folder name cannot be empty");
      return;
    }

    setIsCreatingFolder(true);
    try {
      const response = await fetch("/api/folders/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parent_id: currentFolderId,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to create folder"));
      }

      toast.success("Folder created");
      setIsCreateFolderOpen(false);
      setNewFolderName("");
      await fetchWorkspaceData();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Failed to create folder";
      toast.error(message);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!folderToRename) {
      return;
    }
    if (!renameFolderName.trim()) {
      toast.error("Folder name cannot be empty");
      return;
    }

    setIsRenamingFolder(true);
    try {
      const response = await fetch(`/api/folders/${folderToRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameFolderName.trim() }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to rename folder"));
      }

      toast.success("Folder renamed");
      setFolderToRename(null);
      setRenameFolderName("");
      await fetchWorkspaceData();
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : "Failed to rename folder";
      toast.error(message);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) {
      return;
    }

    setIsDeletingFolder(true);
    try {
      const response = await fetch(`/api/folders/${folderToDelete.id}?cascade=true`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to delete folder"));
      }

      toast.success(`Deleted folder \"${folderToDelete.name}\"`);
      setFolderToDelete(null);
      await fetchWorkspaceData();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete folder";
      toast.error(message);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleMoveProject = async () => {
    if (!projectToMove) {
      return;
    }

    setIsMovingProject(true);
    try {
      const targetFolderId = moveTargetFolderId === "__root__" ? null : moveTargetFolderId;
      const response = await fetch(`/api/folders/projects/${projectToMove.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: targetFolderId }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to move project"));
      }

      toast.success(`Moved \"${getProjectDisplayName(projectToMove)}\"`);
      setProjectToMove(null);
      setMoveTargetFolderId("__root__");
      await fetchWorkspaceData();
    } catch (moveError) {
      const message = moveError instanceof Error ? moveError.message : "Failed to move project";
      toast.error(message);
    } finally {
      setIsMovingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) {
      return;
    }

    setIsDeletingProject(true);
    try {
      const response = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Failed to delete project"));
      }

      toast.success(`Deleted \"${getProjectDisplayName(projectToDelete)}\"`);
      setProjectToDelete(null);
      await fetchWorkspaceData();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete project";
      toast.error(message);
    } finally {
      setIsDeletingProject(false);
    }
  };

  const openRenameDialog = (folder: FolderTreeItem) => {
    setFolderToRename(folder);
    setRenameFolderName(folder.name);
  };

  const openMoveDialog = (project: Project) => {
    setProjectToMove(project);
    setMoveTargetFolderId(project.folder_id ?? "__root__");
  };

  const renderFolderMenu = (folder: FolderTreeItem) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Open actions for folder ${folder.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuLabel>Folder</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              openRenameDialog(folder);
            }}
          >
            <Pencil className="h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={(event) => {
              event.stopPropagation();
              setFolderToDelete(folder);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderProjectMenu = (project: Project) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/80 backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Open actions for project ${getProjectDisplayName(project)}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuLabel>Project</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              openMoveDialog(project);
            }}
          >
            <Folder className="h-4 w-4" />
            Move to Folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={(event) => {
              event.stopPropagation();
              setProjectToDelete(project);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border text-destructive">
        {error}
      </div>
    );
  }

  const listFolders = isSearching ? [] : visibleFolders;
  const listProjects = isSearching ? searchResults : visibleProjects;

  return (
    <>
      <div className="flex h-full min-h-0 w-full overflow-hidden border bg-background">
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r bg-card transition-all duration-200",
            isSidebarCollapsed ? "w-16" : "w-64"
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-3">
            {!isSidebarCollapsed && <p className="text-sm font-semibold">Workspace</p>}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsSidebarCollapsed((previous) => !previous)}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex-1 space-y-2 p-2">
            <Button
              variant={section === "projects" ? "secondary" : "ghost"}
              className={cn("w-full justify-start gap-2", isSidebarCollapsed && "justify-center px-2")}
              onClick={() => setSection("projects")}
              aria-label="Projects"
            >
              <Folder className="h-4 w-4" />
              {!isSidebarCollapsed && <span>Projects</span>}
            </Button>

            <Button
              variant={section === "apps" ? "secondary" : "ghost"}
              className={cn("w-full justify-start gap-2", isSidebarCollapsed && "justify-center px-2")}
              onClick={() => setSection("apps")}
              aria-label="Apps and Integrations"
            >
              <AppWindow className="h-4 w-4" />
              {!isSidebarCollapsed && <span>Apps &amp; Integrations</span>}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b">
            <div className="flex h-12 items-center gap-3 px-4 sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed((previous) => !previous)}
                aria-label="Toggle sidebar"
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>

            {section === "projects" && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:h-14 md:flex-nowrap md:py-0">
                <div className="inline-flex rounded-md border p-1">
                  <Button
                    variant={viewMode === "gallery" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("gallery")}
                  >
                    <Grid3X3 className="mr-2 h-4 w-4" />
                    Gallery
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="mr-2 h-4 w-4" />
                    List
                  </Button>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Button onClick={() => setIsImportOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Import Project
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setIsCreateFolderOpen(true)} aria-label="Create new folder">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={fetchWorkspaceData} aria-label="Refresh workspace">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)} aria-label="Open settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-4 p-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((index) => (
                    <Skeleton key={index} className="h-56 rounded-xl" />
                  ))}
                </div>
              </div>
            ) : section === "apps" ? (
              <div className="p-6">
                <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/10 text-center">
                  <AppWindow className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Apps &amp; Integrations</p>
                  <p className="text-sm text-muted-foreground">This section is intentionally blank for upcoming integrations.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 p-6">
                {!isSearching && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {breadcrumbs.length === 0 && viewMode === "gallery" && (
                      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Folders</p>
                    )}
                    {breadcrumbs.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setCurrentFolderId(null)}>
                        Projects
                      </Button>
                    )}
                    {breadcrumbs.map((folder) => (
                      <div key={folder.id} className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <Button variant="ghost" size="sm" onClick={() => setCurrentFolderId(folder.id)}>
                          {folder.name}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === "gallery" ? (
                  <div className="space-y-6">
                    {isSearching ? (
                      <>
                        <p className="text-sm text-muted-foreground">Search Results ({searchResults.length})</p>
                        {searchResults.length === 0 ? (
                          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                            No projects found for "{searchQuery}".
                          </div>
                        ) : (
                          <div className={PROJECT_GRID_CLASS}>
                            {searchResults.map((project) => (
                              <ProjectCard
                                key={project.id}
                                project={project}
                                searchQuery={searchQuery}
                                onClick={() => openProject(project)}
                                actions={renderProjectMenu(project)}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {visibleFolders.length > 0 && (
                          <section className="space-y-3">
                            {currentFolderId !== null && (
                              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Folders</h3>
                            )}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                              {visibleFolders.map((folder) => (
                                <div
                                  key={folder.id}
                                  className="group rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
                                  onClick={() => setCurrentFolderId(folder.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setCurrentFolderId(folder.id);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="rounded-md bg-muted p-2">
                                        <Folder className="h-5 w-5 text-muted-foreground" />
                                      </div>
                                      <div className="flex min-w-0 items-center gap-2">
                                        <p className="line-clamp-1 text-sm font-semibold">{folder.name}</p>
                                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                                          {folder.total_project_count}
                                        </span>
                                      </div>
                                    </div>
                                    {renderFolderMenu(folder)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        <section className="space-y-3">
                          {visibleProjects.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                              No projects in this level.
                            </div>
                          ) : (
                            <div className={PROJECT_GRID_CLASS}>
                              {visibleProjects.map((project) => (
                                <ProjectCard
                                  key={project.id}
                                  project={project}
                                  onClick={() => openProject(project)}
                                  actions={renderProjectMenu(project)}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border">
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] border-b bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <div>Name</div>
                      <div>Description</div>
                      <div>Location</div>
                      <div>Updated</div>
                      <div className="w-8" />
                    </div>

                    {listFolders.length === 0 && listProjects.length === 0 ? (
                      <div className="p-10 text-center text-sm text-muted-foreground">No items to display.</div>
                    ) : (
                      <div>
                        {listFolders.map((folder) => (
                          <div
                            key={folder.id}
                            className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center border-b px-4 py-2"
                          >
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-2 text-left text-sm font-medium hover:text-primary"
                              onClick={() => setCurrentFolderId(folder.id)}
                            >
                              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{folder.name}</span>
                            </button>
                            <p className="truncate text-sm text-muted-foreground">Folder</p>
                            <p className="truncate text-sm text-muted-foreground">Current Level</p>
                            <p className="truncate text-sm text-muted-foreground">-</p>
                            <div className="flex justify-end">{renderFolderMenu(folder)}</div>
                          </div>
                        ))}

                        {listProjects.map((project) => (
                          <div
                            key={project.id}
                            className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center border-b px-4 py-2"
                          >
                            <button
                              type="button"
                              className="truncate text-left text-sm font-medium hover:text-primary"
                              onClick={() => openProject(project)}
                            >
                              {getProjectDisplayName(project)}
                            </button>
                            <p className="truncate text-sm text-muted-foreground">{project.description || "No description"}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {isSearching
                                ? (project as SearchProject).folder_path
                                : currentFolderId
                                  ? breadcrumbs.map((crumb) => crumb.name).join(" / ")
                                  : "Workspace Root"}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">{project.last_modified}</p>
                            <div className="flex justify-end">{renderProjectMenu(project)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImportComplete={fetchWorkspaceData} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Create a folder in the current workspace level.</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Folder name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)} disabled={isCreatingFolder}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={isCreatingFolder}>
              {isCreatingFolder ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!folderToRename} onOpenChange={() => setFolderToRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>Update folder name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameFolderName}
            onChange={(event) => setRenameFolderName(event.target.value)}
            placeholder="Folder name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderToRename(null)} disabled={isRenamingFolder}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder} disabled={isRenamingFolder}>
              {isRenamingFolder ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!folderToDelete} onOpenChange={() => setFolderToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
            <DialogDescription>
              Delete <strong>{folderToDelete?.name || ""}</strong> and nested folders. Projects in those folders will be moved to workspace root.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderToDelete(null)} disabled={isDeletingFolder}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteFolder} disabled={isDeletingFolder}>
              {isDeletingFolder ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!projectToMove} onOpenChange={() => setProjectToMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Project</DialogTitle>
            <DialogDescription>Select where this project should live.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Project: {projectToMove ? getProjectDisplayName(projectToMove) : ""}</p>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={moveTargetFolderId}
              onChange={(event) => setMoveTargetFolderId(event.target.value)}
            >
              <option value="__root__">Workspace Root</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {`${"  ".repeat(folder.depth)}${folder.name}`}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToMove(null)} disabled={isMovingProject}>
              Cancel
            </Button>
            <Button onClick={handleMoveProject} disabled={isMovingProject}>
              {isMovingProject ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{projectToDelete ? getProjectDisplayName(projectToDelete) : ""}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToDelete(null)} disabled={isDeletingProject}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProject} disabled={isDeletingProject}>
              {isDeletingProject ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
