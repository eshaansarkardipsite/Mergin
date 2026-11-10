---
name: Achromatic Financial Architecture
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c9c6c5'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e4e2e1'
  on-secondary-container: '#656464'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1c1c'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c9c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#e4e2e2'
  tertiary-fixed-dim: '#c7c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#464747'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  ink-solid: '#0A0A0A'
  ink-graphite: '#333333'
  ink-slate: '#686868'
  ink-muted: '#929292'
  stroke-line: '#E6E6E6'
  stroke-subtle: '#EFEFEF'
  surface-canvas: '#F6F6F6'
  surface-raised: '#FFFFFF'
  surface-hover: '#F0F0F0'
  surface-dark: '#171717'
typography:
  display-hero:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '600'
    lineHeight: 42px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  financial-metric-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-md-strong:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.015em
  caption-micro:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an executive, strictly monochrome digital environment built for enterprise B2B treasury operations, global disbursements, and high-volume reconciliation. Rejecting consumer-fintech gamification, neons, and speculative crypto aesthetics, the visual identity embodies absolute composure, institutional authority, and Apple-grade precision.

The design philosophy synthesizes **Architectural Minimalism** with **Swiss Precision**. It treats empty space, typographic cadence, and hairline boundaries as structural elements. Visual hierarchy is achieved entirely without chromatic distraction:
- Zero chromatic status signifiers: alerts, positive/negative cashflows, and operational states never rely on green, amber, or red. Meaning is communicated strictly via mathematical signifiers (`+`, `-`), precise vector iconography, explicit state tags, and typographic weight.
- Pure high-contrast interaction: solid black primary focal points against crisp elevated surfaces, supported by subtle neutral divisions.
- Calm, quiet utility: tactile confidence expressed through generous layout spacing, rigorous 8px rhythmic alignment, and refined corner geometry.

## Colors

The system operates under a strict, achromatic color policy. Color saturation is zero across all functional, brand, and data visualization primitives.

### Palette Construction & Roles
- **Primary Ink (`#0A0A0A`)**: Serves as the primary typographic driver, active glyph fill, brand monogram anchor, and filled high-priority interactive target.
- **Graphite (`#333333`)**: Applied to secondary headers, metric identifiers, active tab underlines, and primary line chart paths.
- **Slate (`#686868`)**: Used for metadata, auxiliary financial subtitles, column headers, and quiet inline descriptions.
- **Muted (`#929292`)**: Dedicated to placeholder inputs, trailing micro-labels, and inactive system states.
- **Stroke Line (`#E6E6E6`)**: The single structural boundary token. Defines 1px card perimeters, input outlines, table dividers, and segmented control borders.
- **Surface Canvas (`#F6F6F6`)**: The global architectural backdrop behind raised cards and navigation bars.
- **Surface Raised (`#FFFFFF`)**: Pure white base for operational surfaces: cards, modals, table bodies, input fills, and secondary buttons.

### Status & Cashflow Principles
1. **Financial Direction**: Positive inflows must use explicit `+` prefixes alongside `ink-solid` typography. Negative outflows must use `-` prefixes. Never use green or red.
2. **Transaction Statuses**:
   - *Settled / Paid*: White badge with `#E6E6E6` border and check icon.
   - *Pending / Processing*: `#F0F0F0` soft badge fill with clock outline glyph.
   - *Flagged / Overdue*: `#0A0A0A` solid black inverted badge with white text, or an explicit warning triangle icon with bold text.

## Typography

The typographic hierarchy implements an Apple-inspired execution via neutral, geometric sans-serif construction with high legibility across dense data displays. 

### Numeric Formatting Requirements
All financial figures, currency values, ledger rows, rate percentages, and timestamps must activate OpenType tabular numbers via `font-variant-numeric: tabular-nums` or `font-feature-settings: "tnum" 1`. This guarantees columnar alignment across tables and metric cards.

### Typographic Restraint
- **Letter Spacing**: Display headers enforce tight negative tracking (`-0.02em` to `-0.03em`) for a sculpted editorial feel. Small labels (`11px`–`13px`) use positive tracking for legibility.
- **Case**: Avoid aggressive all-caps treatments. Sentence casing is mandatory for section headers, labels, and table headers. The brand wordmark alone is permitted uppercase treatment with wide letter spacing.

## Layout & Spacing

The layout is built upon a strict **8px base grid** with a 4px micro-adjustment unit. The layout balances dense data management with generous visual whitespace.

### Structural Framework
- **Desktop Grid**: Standard 12-column layout running parallel to a fixed 240px application navigation rail. The content container caps at a maximum width of 1440px to prevent ledger tables from over-stretching.
- **Canvas Margins**: Outer shell margin is locked to 32px (`2rem`) on desktop and scales down to 16px (`1rem`) on mobile viewports.
- **Card Padding**: Inner padding for financial cards adheres to 24px (`1.5rem`) on desktop and drops to 16px (`1rem`) on compact touchscreens.

### Breakpoints & Responsive Strategy
- **Mobile (`320px – 767px`)**: The fixed sidebar collapses into a top utility brand bar and sticky bottom navigation dock. Metric grids reflow to a 1-column stack. Tables collapse into grouped transaction cards.
- **Tablet (`768px – 1023px`)**: Sidebar collapses to an 80px icon rail. Main content scales fluidly with 24px margins.
- **Desktop (`1024px – 1440px+`)**: Full workspace view with persistent 240px rail, 32px gutters, and parallel detail flyout panels.

## Elevation & Depth

Visual hierarchy is communicated via clean tonal contrast and precise hairline boundaries rather than drop shadows or colored diffusions.

### Tonal Stratification
Depth is structured across four rigid physical layers:
1. **Base Foundation (`surface-canvas` / `#F6F6F6`)**: The root application backdrop.
2. **Elevated Content Planes (`surface-raised` / `#FFFFFF`)**: Standard cards, table containers, and dashboards bound by a 1px solid stroke (`#E6E6E6`). No drop shadow is applied to static cards.
3. **Transient Overlays**: Context menus, flyout drawers, and search palettes sit on `#FFFFFF` with a 1px `#E6E6E6` border and an ultra-diffused, black ambient shadow (`box-shadow: 0 12px 32px -4px rgba(10, 10, 10, 0.06), 0 4px 12px -2px rgba(10, 10, 10, 0.03)`).
4. **Modal Sheets**: Highest z-index layer. Surrounded by an achromatic scrim (`rgba(10, 10, 10, 0.4)`), free from artificial blur filters.

### Edge Treatment
Separation between adjacent panels relies on deliberate 1px lines (`stroke-line` / `#E6E6E6`) or clear 16px+ spatial gaps across the neutral canvas, producing a clean, distraction-free environment.

## Shapes

The geometric signature uses unified, controlled curvatures inspired by hardware product design. 

### Corner Radii Guidelines
- **Primary Surfaces & Cards**: `16px` (`rounded-lg`) to `18px`. Generous radii soften the high-contrast monochrome aesthetic.
- **Interactive Controls (Buttons & Inputs)**: Standardized to `12px` or full pill (`9999px`) on isolated primary CTAs. Form inputs maintain a strict `12px` radius.
- **Inline Badges & Data Chips**: `8px` corner radius. Excessive full pills are discouraged for tables and status counters to preserve clean architectural alignment.
- **Line Width**: System-wide stroke width is locked to 1px for boundaries, dividers, inputs, and icon lines.

## Components

### Buttons
- **Primary**: Solid black fill (`#0A0A0A`), crisp white text (`#FFFFFF`), 48px height, 12px radius or full pill. Hover transitions to `#262626` over 160ms.
- **Secondary**: Pure white fill (`#FFFFFF`), 1px solid border (`#E6E6E6`), `#0A0A0A` text. Hover shifts background to `#F5F5F5`.
- **Tertiary / Ghost**: Transparent fill, `#0A0A0A` text, underline or subtle `#F0F0F0` hover pill.
- **Action Icons in Buttons**: Outline only, 16px × 16px, 1.5px stroke width.

### Form Inputs & Search Fields
- **Container**: 44px–48px height, `#FFFFFF` background, 1px `#E6E6E6` border, 12px radius.
- **Typography**: 14px text. Placeholder styled in `#929292`.
- **Focus State**: Hairline dark border transition to `#0A0A0A` with no colored focus glow or ring.
- **Validation**: Error messages are signaled with an explicit error icon and `#0A0A0A` bold label text; colored outlines are prohibited.

### Cards & Metrics
- **Structure**: `#FFFFFF` background, 1px solid `#E6E6E6` border, 20px–24px internal padding, 16px radius.
- **Metric Presentation**: Balance and volume figures rendered in `financial-metric-lg` using tabular numbers. Delta comparisons include clear textual context (e.g., `↑ +2.4% vs last month` or `↓ -1.1% vs last month`).

### Data Tables & Ledgers
- **Header**: Height 40px, transparent background, text in 12px `label-sm` slate (`#686868`), uppercase tracking.
- **Rows**: 56px–64px height, `#FFFFFF` background, separated by 1px bottom border (`#E6E6E6`). Hover state shifts row surface to `#FAFAFA`.
- **Numeric Alignment**: All monetary columns right-aligned with tabular numerals. Counterparty icons use 36px circular avatar frames with light neutral fills (`#F0F0F0`) and solid black glyphs.

### Status Chips & Badges
- **General Architecture**: Height 24px, 8px radius, 12px font size, horizontal padding of 8px.
- **Settled**: White surface, 1px `#E6E6E6` border, `#0A0A0A` text with checkmark glyph.
- **Pending**: `#EFEFEF` solid neutral fill, no border, `#333333` text.
- **Overdue / Action Needed**: `#0A0A0A` solid black fill, `#FFFFFF` text with high-contrast icon.

### Financial Line Charts
- **Lines**: Primary metric line rendered in solid black (`#0A0A0A`) with a clean 2px stroke. Secondary reference lines in `#E6E6E6`.
- **Grid**: Horizontal rules rendered as faint 1px hairline lines (`#EFEFEF`).
- **Gradients**: Strictly no neon or colorful gradient area fills. Optional subtle linear fade from `rgba(10, 10, 10, 0.04)` to transparent under the primary curve.