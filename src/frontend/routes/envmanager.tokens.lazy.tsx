import { ActionIcon, Badge, Box, Button, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { createLazyFileRoute } from '@tanstack/react-router'
import { TbKey, TbX } from 'react-icons/tb'
import { TokenListContent } from '@/frontend/components/tokens/TokenListContent'
import { TokenDetailView } from '@/frontend/components/tokens/TokenDetailView'
import { TokenForm } from '@/frontend/components/tokens/TokenForm'
import { emptyForm, useTokensPage } from '@/frontend/hooks/useTokensPage'

export const Route = createLazyFileRoute('/envmanager/tokens')({ component: TokensPage })

function TokensPage() {
  const { token: selectedTokenId, edit: isEditing } = Route.useSearch()
  const p = useTokensPage(selectedTokenId, isEditing)
  useHotkeys([['/', () => { p.searchRef.current?.focus(); p.searchRef.current?.select() }]])

  const Crumb = ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <Text size="sm" c={onClick ? 'dimmed' : undefined} fw={onClick ? undefined : 600} style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      {label}
    </Text>
  )
  const Sep = () => <Text size="sm" c="dimmed">/</Text>

  if (selectedTokenId === 'new') {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={p.goToList}><TbX size={15} /></ActionIcon>
            <Crumb label="Tokens" onClick={p.goToList} /><Sep /><Crumb label="Buat Token Baru" />
          </Group>
          <Divider />
          <Box p="md" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
            <TokenForm form={p.form} setForm={p.setForm} projects={p.projects} allTags={p.allTags} />
            <Divider my="md" />
            <Group gap="xs" mb="md" wrap="wrap">
              <Badge size="xs" color={p.form.canWrite ? 'orange' : 'blue'} variant="light">{p.form.canWrite ? 'read-write' : 'read-only'}</Badge>
              <Badge size="xs" color="primary" variant="light">{p.form.scopes.length === 0 ? 'semua project' : `${p.form.scopes.length} scope`}</Badge>
              <Badge size="xs" color={p.form.expiresAt ? 'teal' : 'gray'} variant="light">
                {p.form.expiresAt ? `exp: ${new Date(p.form.expiresAt).toLocaleDateString('id-ID')}` : 'tidak ada expiry'}
              </Badge>
            </Group>
            <Group justify="flex-end" gap="xs">
              <Button variant="subtle" color="gray" onClick={() => { p.setForm(emptyForm); p.goToList() }} disabled={p.createToken.isPending}>Batal</Button>
              <Button size="md" leftSection={<TbKey size={16} />} variant="gradient" onClick={() => p.createToken.mutate(p.form)} loading={p.createToken.isPending} disabled={!p.form.name.trim()}>
                {p.form.name ? `Buat token "${p.form.name}"` : 'Buat Token'}
              </Button>
            </Group>
          </Box>
        </Stack>
      </Paper>
    )
  }

  if (p.selectedToken && isEditing) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => p.goToDetail(p.selectedToken!.id)}><TbX size={15} /></ActionIcon>
            <Crumb label="Tokens" onClick={p.goToList} /><Sep />
            <Crumb label={p.selectedToken.name} onClick={() => p.goToDetail(p.selectedToken!.id)} /><Sep />
            <Crumb label="Edit" />
          </Group>
          <Divider />
          <Box p="md" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
            <TokenForm form={p.editForm} setForm={p.setEditForm} projects={p.projects} allTags={p.allTags} />
            <Divider my="md" />
            <Group gap="xs" mb="md" wrap="wrap">
              <Badge size="xs" color={p.editForm.canWrite ? 'orange' : 'blue'} variant="light">{p.editForm.canWrite ? 'read-write' : 'read-only'}</Badge>
              <Badge size="xs" color="primary" variant="light">{p.editForm.scopes.length === 0 ? 'semua project' : `${p.editForm.scopes.length} scope`}</Badge>
              <Badge size="xs" color={p.editForm.expiresAt ? 'teal' : 'gray'} variant="light">
                {p.editForm.expiresAt ? `exp: ${new Date(p.editForm.expiresAt).toLocaleDateString('id-ID')}` : 'tidak ada expiry'}
              </Badge>
            </Group>
            <Group justify="flex-end" gap="xs">
              <Button variant="subtle" color="gray" onClick={() => p.goToDetail(p.selectedToken!.id)} disabled={p.editToken.isPending}>Batal</Button>
              <Button leftSection={<TbX size={14} />} onClick={() => p.editToken.mutate(p.editForm)} loading={p.editToken.isPending} disabled={!p.editForm.name}>
                Simpan Perubahan
              </Button>
            </Group>
          </Box>
        </Stack>
      </Paper>
    )
  }

  if (p.selectedToken) {
    return (
      <TokenDetailView
        token={p.selectedToken}
        isCopied={p.copiedId === p.selectedToken.id}
        togglePending={p.toggleToken.isPending && p.toggleToken.variables === p.selectedToken.id}
        copyPending={p.copyToken.isPending && p.copyToken.variables === p.selectedToken.id}
        rotatePending={p.rotateToken.isPending && p.rotateToken.variables === p.selectedToken.id}
        onBack={p.goToList}
        onToggle={() => p.toggleToken.mutate(p.selectedToken!.id)}
        onCopy={() => p.copyToken.mutate(p.selectedToken!.id)}
        onCopyCommand={(tpl) => p.handleCopyCommand(p.selectedToken!.id, tpl)}
        onRotate={() => p.confirmRotate(p.selectedToken!.id, p.selectedToken!.name)}
        onEdit={() => p.goToEdit(p.selectedToken!.id)}
        onRevoke={() => p.revokeToken(p.selectedToken!.id, p.selectedToken!.name)}
      />
    )
  }

  return <TokenListContent p={p} />
}
