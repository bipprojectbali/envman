// Single source of truth untuk brand colors + theme config.
//
// Aturan:
// - JANGAN hardcode `color="violet"` di komponen. Pakai `color="primary"`
//   atau omit (Mantine pakai primaryColor secara default).
// - JANGAN hardcode `gradient={{ from: 'violet', to: 'grape' }}`. Pakai
//   BRAND_GRADIENT yang di-export di sini.
// - Untuk CSS: pakai `var(--mantine-color-primary)` — Mantine generate
//   ini otomatis dari primaryColor.
//
// Mengubah brand color = ubah di satu tempat (file ini), semua komponen
// auto-pick. Ini yang dimaksud "single source of truth".

import { createTheme, type MantineGradient, rem } from '@mantine/core'

// Brand gradient dipakai di hero, ThemeIcon, CTA button, dll.
// Mantine auto-pakai di komponen dengan `variant="gradient"` tanpa
// `gradient` prop eksplisit.
export const BRAND_GRADIENT: MantineGradient = {
  from: 'violet',
  to: 'grape',
  deg: 135,
}

export const theme = createTheme({
  primaryColor: 'violet',
  // primaryShade default: { light: 6, dark: 8 }. Override di sini kalau perlu.
  defaultGradient: BRAND_GRADIENT,
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  components: {
    Button: { defaultProps: { radius: 'md' } },
    TextInput: { defaultProps: { radius: 'md' } },
    PasswordInput: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    Textarea: { defaultProps: { radius: 'md' } },
    Modal: { defaultProps: { radius: 'lg' } },
  },
  other: {
    mobileBreak: rem(768),
  },
})
