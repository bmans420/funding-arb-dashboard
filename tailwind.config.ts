import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0d1117',
        foreground: '#e6edf3',
        card: '#161b22',
        'card-foreground': '#e6edf3',
        primary: '#238636',
        'primary-foreground': '#ffffff',
        secondary: '#21262d',
        'secondary-foreground': '#e6edf3',
        muted: '#21262d',
        'muted-foreground': '#7d8590',
        accent: '#30363d',
        'accent-foreground': '#e6edf3',
        destructive: '#da3633',
        'destructive-foreground': '#ffffff',
        border: '#30363d',
        input: '#21262d',
        ring: '#1f6feb',
      },
    },
  },
  plugins: [],
}
export default config
