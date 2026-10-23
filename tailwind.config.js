/** @type {import('tailwindcss').Config} */
// 디자인 토큰: 색은 CSS 변수(채널값)로 정의 → rgb(var(--x) / <alpha>) 로 알파 지원. src/index.css :root 참고.
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: c('navy'), 700: c('navy-700'), 500: c('navy-500'), 300: c('navy-300') },
        ink: { DEFAULT: c('ink'), soft: c('ink-soft'), mute: c('ink-mute') },
        paper: { DEFAULT: c('paper'), 2: c('paper-2'), 3: c('paper-3') },
        line: { DEFAULT: c('line'), strong: c('line-strong') },
        gold: { DEFAULT: c('gold'), deep: c('gold-deep'), soft: c('gold-soft'), 50: c('gold-50'), 200: c('gold-200') },
        primary: { DEFAULT: c('primary'), hover: c('primary-hover'), soft: c('primary-soft') },
        sky: { 50: c('sky-50'), 200: c('sky-200') },
        mint: { 50: c('mint-50'), 200: c('mint-200'), ink: c('mint-ink') },
        star: { DEFAULT: c('star'), deep: c('star-deep'), soft: c('star-soft') },
        leaf: { DEFAULT: c('leaf'), soft: c('leaf-soft') },
        surface: c('surface'),
        danger: c('danger'),
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'system-ui', 'sans-serif'],
        display: ['"Cormorant Garamond"', '"Iowan Old Style"', 'Georgia', 'serif'],
      },
      letterSpacing: { caps: '0.22em', wide2: '0.32em' },
      borderRadius: { panel: '1.5rem', card: '1.125rem', chip: '999px' },
      boxShadow: {
        panel: '0 1px 0 rgb(255 255 255 / .6) inset, 0 1px 2px rgb(17 24 39 / .06), 0 8px 24px -6px rgb(17 24 39 / .14), 0 28px 64px -16px rgb(11 31 75 / .22)',
        float: '0 1px 2px rgb(17 24 39 / .08), 0 6px 18px -4px rgb(17 24 39 / .18)',
        soft: '0 1px 2px rgb(17 24 39 / .06), 0 2px 8px rgb(17 24 39 / .06)',
        ring: '0 0 0 3px rgb(184 144 47 / .45)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.22,.8,.24,1)', 'in-out-soft': 'cubic-bezier(.65,0,.25,1)' },
      transitionDuration: { 180: '180ms', 280: '280ms', 420: '420ms' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        // 첫 사용 안내 칩의 손가락 아이콘: 살짝 눌렀다 떼는 느낌 + 금빛 파문
        'hint-tap': { '0%, 100%': { transform: 'translateY(0) scale(1)' }, '45%': { transform: 'translateY(2px) scale(0.9)' } },
        'hint-ring': { '0%': { transform: 'scale(0.9)', opacity: '0.55' }, '70%, 100%': { transform: 'scale(1.7)', opacity: '0' } },
      },
      animation: {
        'fade-up': 'fade-up 520ms cubic-bezier(.22,.8,.24,1) both',
        'fade-in': 'fade-in 420ms ease-out both',
        'hint-tap': 'hint-tap 2.2s ease-in-out infinite',
        'hint-ring': 'hint-ring 2.2s ease-out infinite',
      },
      screens: { lg: '1024px', xl: '1280px', '3xl': '1920px' },
    },
  },
  plugins: [],
}
