import { useEffect } from 'react'
import { loadContent } from './lib/content'
import { initHashSync } from './store/useAppStore'
import { Shell } from './ui/Shell'

export default function App() {
  useEffect(() => {
    const stopHash = initHashSync()
    void loadContent()
    return stopHash
  }, [])
  return <Shell />
}
