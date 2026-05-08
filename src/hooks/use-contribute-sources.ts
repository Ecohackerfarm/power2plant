'use client'
import { useState, useCallback } from 'react'
import { classifyUrl, type SourceClassification } from '@/lib/classify-url'

export type SourceEntry = {
  id: number
  url: string
  detectedType: SourceClassification
  overrideType: SourceClassification
}

export function useContributeSources() {
  const [sources, setSources] = useState<SourceEntry[]>([])

  const addSource = useCallback(() => {
    setSources(prev => [...prev, { id: Date.now(), url: '', detectedType: 'BLOG_FORUM', overrideType: 'BLOG_FORUM' }])
  }, [])

  const removeSource = useCallback((id: number) => {
    setSources(prev => prev.filter(s => s.id !== id))
  }, [])

  const updateUrl = useCallback((id: number, url: string) => {
    setSources(prev => prev.map(s => (s.id === id ? { ...s, url } : s)))
  }, [])

  const detectAndSet = useCallback((id: number) => {
    setSources(prev =>
      prev.map(s => {
        if (s.id !== id) return s
        const detected = classifyUrl(s.url)
        return { ...s, detectedType: detected, overrideType: detected }
      }),
    )
  }, [])

  const setOverride = useCallback((id: number, overrideType: SourceClassification) => {
    setSources(prev => prev.map(s => (s.id === id ? { ...s, overrideType } : s)))
  }, [])

  const resetSources = useCallback(() => {
    setSources([])
  }, [])

  return { sources, addSource, removeSource, updateUrl, detectAndSet, setOverride, resetSources }
}