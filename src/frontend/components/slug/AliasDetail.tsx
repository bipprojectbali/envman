import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { TbCheck, TbChevronLeft, TbChevronRight, TbCopy, TbPencil, TbTrash } from 'react-icons/tb'
import type { Alias } from './alias-types'
import { CreatedUpdatedMeta } from './CreatedUpdatedMeta'

interface Props {
  alias: Alias
  slug: string
  isOwner: boolean
  onClose: () => void
  onEdit: (alias: Alias) => void
  onDelete: (alias: Alias) => void
}

export function AliasDetail({ alias, slug, isOwner, onClose, onEdit, onDelete }: Props) {
  return (
    <Stack gap="md">
      <Group gap={6} align="center">
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose}>
          <TbChevronLeft size={15} />
        </ActionIcon>
        <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onClose}>
          Aliases
        </Anchor>
        <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        <Code fz="sm" fw={700}>
          {alias.name}
        </Code>
      </Group>
      <Divider />

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Perintah
        </Text>
        <Group gap="xs" align="flex-start">
          <Code block fz="sm" style={{ flex: 1, wordBreak: 'break-all' }}>
            envman {alias.args}
          </Code>
          <CopyButton value={`envman ${alias.args}`} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Disalin!' : 'Salin'} withArrow>
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="xs" style={{ letterSpacing: '0.05em' }}>
          Jalankan via CLI
        </Text>
        <Group gap="xs" align="flex-start">
          <Code block fz="sm" style={{ flex: 1 }}>
            envman run {slug}:{alias.name}
          </Code>
          <CopyButton value={`envman run ${slug}:${alias.name}`} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Disalin!' : 'Salin'} withArrow>
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        {alias.description && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="xs" style={{ letterSpacing: '0.05em' }}>
              Deskripsi
            </Text>
            <Text size="sm">{alias.description}</Text>
          </>
        )}

        {alias.tags.length > 0 && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="xs" style={{ letterSpacing: '0.05em' }}>
              Tags
            </Text>
            <Group gap={4}>
              {alias.tags.map((t) => (
                <Badge key={t} size="sm" variant="light" color="blue">
                  {t}
                </Badge>
              ))}
            </Group>
          </>
        )}

        <Divider mt="xs" />
        <Group gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Oleh <strong>{alias.creator.name}</strong>
          </Text>
          <Text size="xs" c="dimmed">
            ·
          </Text>
          <CreatedUpdatedMeta createdAt={alias.createdAt} updatedAt={alias.updatedAt} />
        </Group>

        {isOwner && (
          <Group gap="xs" mt="xs">
            <Button size="xs" variant="default" leftSection={<TbPencil size={13} />} onClick={() => onEdit(alias)}>
              Edit
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<TbTrash size={13} />}
              onClick={() => onDelete(alias)}
            >
              Hapus
            </Button>
          </Group>
        )}
      </Stack>
    </Stack>
  )
}
