import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          sand: {
            light: '#FAF7F2',
            DEFAULT: '#F3EDE0',
            dark: '#E5D9C2',
          },
          turquoise: {
            light: '#2DD4BF',
            DEFAULT: '#0D9488',
            dark: '#115E59',
          },
          charcoal: {
            light: '#334155',
            DEFAULT: '#1E293B',
            dark: '#0F172A',
          },
        },
      },
      spacing: {
        'touch-min': '44px',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};

export default config;
