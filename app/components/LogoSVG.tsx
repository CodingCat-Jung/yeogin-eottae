// components/LogoSVG.tsx
import { motion } from 'framer-motion';

export default function LogoSVG() {
  return (
    <motion.svg
      width="40"
      height="40"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <motion.circle
        cx="32"
        cy="32"
        r="32"
        fill="url(#grad)"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6, type: 'spring', bounce: 0.4 }}
      />
      <motion.path
        d="M18 36c4-8 14-16 28-16-4 6-6 10-4 16s4 10 4 10-6 2-14-2-12-8-14-8z"
        fill="white"
        animate={{
          rotate: [0, -3, 3, -2, 2, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }}
      />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}
