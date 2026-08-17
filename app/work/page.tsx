import { WorkspaceShell } from "@/components/workspace-shell";

type WorkPageProps = {
  searchParams?: Promise<{ mode?: string | string[] }>;
};

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const params = await searchParams;
  const mode = Array.isArray(params?.mode) ? params.mode[0] : params?.mode;
  return <WorkspaceShell labMode={mode === "lab"} />;
}
