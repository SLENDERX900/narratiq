export default function DolphinLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 22 C6 18, 10 12, 16 10 C20 9, 24 10, 26 8 C28 6, 28 3, 26 2 C24 4, 22 5, 20 6 C16 7, 12 6, 8 10 C5 13, 3 17, 4 22Z"
        fill="#2563EB" opacity="0.9"
      />
      <path
        d="M16 10 C20 9, 26 11, 28 16 C29 19, 27 23, 24 25 C21 27, 17 27, 14 25 C10 22, 8 17, 10 13 C11 11, 13 10, 16 10Z"
        fill="#3B82F6"
      />
      <path
        d="M24 25 C26 28, 28 30, 28 30 C26 29, 22 28, 20 27Z"
        fill="#2563EB"
      />
      <circle cx="22" cy="14" r="1.5" fill="white" opacity="0.9" />
    </svg>
  )
}
