import { useNavigate } from '@tanstack/react-router'

interface NavProps {
  slug: string
  env: string
  setForm: (f: { key: string; value: string; isSecret: boolean }) => void
}

export function useVarsNavigation({ slug, env, setForm }: NavProps) {
  const navigate = useNavigate()
  const go = (patch: Record<string, unknown>) =>
    navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, ...patch }), replace: true })

  return {
    openImportMgr: () => go({ importMgr: true }),
    closeImportMgr: () => go({ importMgr: undefined }),
    openCompare: () => go({ compare: true }),
    closeCompare: () => go({ compare: undefined }),
    openPortainerSetup: (mode: 'new' | 'edit') => go({ integrations: true, portainerSetup: mode }),
    closePortainerSetup: () => go({ portainerSetup: undefined }),
    openIntegrations: () => go({ integrations: true }),
    closeIntegrations: () => go({ integrations: undefined }),
    openEditEnv: () => go({ editEnv: true }),
    closeEditEnv: () => go({ editEnv: undefined }),
    openBulk: () => go({ bulk: true }),
    closeBulk: () => go({ bulk: undefined }),
    openAdd: () => go({ addVar: true }),
    closeAdd: () => { setForm({ key: '', value: '', isSecret: false }); go({ addVar: undefined }) },
    navToRoot: () =>
      navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } }),
    navToProject: () =>
      navigate({
        to: '/envmanager/$slug', params: { slug },
        search: { tab: 'environments', fileId: undefined, fileNew: false, viewFileId: undefined, aliasId: undefined, aliasNew: false, viewAliasId: undefined, noteId: undefined, noteNew: false, viewNoteId: undefined },
      }),
  }
}
