---
name: Design Direction - Cyberpunk Neon
description: Dark-first cyberpunk/glassmorphism design with neon accents, gradient KPI cards, Space Grotesk headings
type: design
---
- **Theme**: Dark-first cyberpunk/neon with glassmorphism cards and gradient accents
- **Toggle**: Dark/Light mode via ThemeContext with localStorage persistence (key: crm-theme)
- **Colors**: Primary purple (#8B5CF6), Neon magenta (#FF2D92), Neon cyan (#40E0D0), Neon green (#10F5A8)
- **Dark BG**: Deep purple (#1A1535 → hsl 252 40% 14%)
- **Light BG**: Soft lavender (#F5F3FA → hsl 252 33% 97%)
- **Fonts**: Space Grotesk (headings, numbers), Inter (body)
- **Cards**: Glass effect with backdrop-blur-xl, gradient KPI hero cards (pink, cyan, magenta, purple)
- **Charts**: Recharts with gradient fills, cyan/purple color scheme
- **Animations**: Framer Motion for mount animations, hover lifts, staggered entry
- **Sidebar**: Neon magenta section labels, gradient active states with left border accent
- **Decorative**: Floating gradient blobs in background (purple top-left, cyan bottom-right)
