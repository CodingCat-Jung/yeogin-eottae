// components/AnimatedLogo.tsx
import { motion } from 'framer-motion';

export default function AnimatedLogo() {
  return (
    <motion.div
      className="relative flex flex-col items-center gap-2"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: 'easeOut' }}
    >
      {/* Glow 배경 */}
      <div className="absolute -z-10 w-32 h-32 rounded-full blur-3xl bg-purple-300 opacity-40 animate-pulse" />

      {/* 리프 아이콘 */}
      <motion.svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        initial={{ y: -60, rotate: -90, scale: 0 }}
        animate={{ y: 0, rotate: 0, scale: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="drop-shadow-lg"
      >
        <circle cx="32" cy="32" r="32" fill="url(#grad)" />
        <motion.path
          d="M18 36c4-8 14-16 28-16-4 6-6 10-4 16s4 10 4 10-6 2-14-2-12-8-14-8z"
          fill="white"
          animate={{
            rotate: [0, -5, 5, -3, 3, 0],
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A78BFA" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </motion.svg>

      {/* 텍스트 */}
      <motion.h1
        className="text-2xl font-extrabold tracking-wide text-purple-700"
        initial={{ opacity: 0, letterSpacing: '-0.5em' }}
        animate={{ opacity: 1, letterSpacing: '0.05em' }}
        transition={{ delay: 1, duration: 1.2, ease: 'easeOut' }}
      >
        여긴어때
      </motion.h1>
    </motion.div>
  );
}
