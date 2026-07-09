---
name: Evalora Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464554'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#6b38d4'
  on-secondary: '#ffffff'
  secondary-container: '#8455ef'
  on-secondary-container: '#fffbff'
  tertiary: '#904900'
  on-tertiary: '#ffffff'
  tertiary-container: '#b55d00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#703700'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 48px
  margin-mobile: 20px
---

## Brand & Style
The design system is engineered for a premium AI assessment environment, prioritizing clarity, intelligence, and high-performance professionalism. The brand personality is "The Quiet Expert"—sophisticated, unbiased, and incredibly efficient. 

The aesthetic follows a **Refined Minimalist** movement, utilizing a pure white canvas to emphasize content and data visualizations. Visual interest is generated through precise typography and subtle, high-fidelity gradients rather than heavy decorative elements. The goal is to evoke a sense of calm confidence for both recruiters and candidates, ensuring the AI-driven insights remain the focal point of the experience.

## Colors
This design system utilizes a high-contrast palette built on a foundation of `#FFFFFF`. 

- **Primary Indigo (#6366F1):** Used for primary actions, active states, and brand-critical signifiers.
- **Violet Accents (#8B5CF6):** Reserved for AI-powered features, highlighting insights, and secondary interactive elements to provide a subtle "tech-forward" feel.
- **Grayscale:** We use a refined scale of cool grays. `Slate-900 (#0F172A)` for headings to ensure maximum readability, and `Slate-500 (#64748B)` for secondary body text.
- **Functional Gradients:** A soft linear gradient from Primary Indigo to Violet Accents may be used sparingly for data visualizations or premium "Pro" state indicators.

## Typography
The system relies exclusively on **Inter** to maintain a systematic and utilitarian feel. 

- **Headlines:** Use tight letter-spacing (-0.01em to -0.02em) for larger displays to create a sophisticated, editorial look.
- **Body:** Standard tracking with generous line heights (1.5x minimum) to reduce cognitive load during long assessment reviews.
- **Labels:** Uppercase styles are reserved for `label-sm` in metadata or overline contexts to differentiate from interactive labels.

## Layout & Spacing
The layout follows a **Fixed-Fluid hybrid grid**. Content is contained within a 1280px max-width wrapper on desktop to prevent line lengths from becoming unreadable.

- **Desktop:** 12-column grid, 24px gutters, 48px outer margins.
- **Tablet:** 8-column grid, 24px gutters, 32px outer margins.
- **Mobile:** 4-column grid, 16px gutters, 20px outer margins.

The spacing rhythm is strictly 8px-based. Use larger gaps (48px, 64px, 80px) between major sections to emphasize the "Minimalist" brand pillar and provide breathing room for AI analysis results.

## Elevation & Depth
Depth is communicated through **Soft Ambient Shadows** rather than heavy borders. Surfaces should feel like they are floating slightly above the pure white background.

- **Low Elevation:** 1px stroke (#E2E8F0) with no shadow. Used for persistent layout containers like sidebars.
- **Mid Elevation:** A subtle, diffused shadow: `0px 4px 20px rgba(0, 0, 0, 0.03)`. Used for cards and interactive hover states.
- **High Elevation:** For modals and dropdowns: `0px 10px 32px rgba(15, 23, 42, 0.08)`. 

Do not use inner shadows or heavy bevels. The depth should feel airy and digital.

## Shapes
The design system employs a **Rounded** shape language to soften the analytical nature of the platform.

- **Standard Elements:** Buttons, inputs, and small widgets use a `0.5rem` (8px) radius.
- **Large Containers:** Cards and assessment modules use `rounded-xl` (1.5rem / 24px) to create a distinct, modern "app-like" feel.
- **Full Rounding:** Progress bars and status tags (chips) should use pill-shaped (full) rounding.

## Components
- **Buttons:** Primary buttons use a solid Indigo fill. Secondary buttons use a subtle Gray-50 background with a 1px border. All buttons have a height of 44px or 48px for a premium feel.
- **Input Fields:** Use a 1px border (#E2E8F0). On focus, the border transitions to Primary Indigo with a soft 4px indigo glow (shadow).
- **Cards:** White background, `rounded-xl` (24px) corners, and Mid-elevation shadows. Use padding of 32px for internal content.
- **Chips/Badges:** Small, pill-shaped elements with low-opacity fills (e.g., 10% Indigo fill with Indigo text) for status indicators.
- **AI Insights:** Any component surfacing AI-generated data should feature a subtle 2px left-border accent in Violet (#8B5CF6) to signify its origin.
- **Progress Bars:** Thin (8px height), using the Primary to Secondary gradient to indicate completion status.