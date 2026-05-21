'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Mode = 'idle' | 'modal' | 'data-selecting' | 'other-capturing' | 'data-form' | 'other-form' | 'submitting'

interface FeedbackContext {
  mode: 'DATA' | 'OTHER'
  targetKey?: string
  entityType?: string
  entityId?: string
  screenshot?: string
  annotation?: { x: number; y: number; w: number; h: number }
}

function getEntityContext(el: Element): { entityType?: string; entityId?: string } {
  let node: Element | null = el
  while (node) {
    const type = node.getAttribute('data-entity-type')
    const id = node.getAttribute('data-entity-id')
    if (type && id) return { entityType: type, entityId: id }
    node = node.parentElement
  }
  return {}
}

function AnnotationCanvas({
  screenshot,
  onConfirm,
}: {
  screenshot: string
  onConfirm: (ann: { x: number; y: number; w: number; h: number } | undefined) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragging = useRef(false)
  const startPt = useRef({ x: 0, y: 0 })
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => { imgRef.current = img }
    img.src = screenshot
  }, [screenshot])

  function draw(r: typeof rect) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (r) {
      const px = r.x * canvas.width
      const py = r.y * canvas.height
      const pw = r.w * canvas.width
      const ph = r.h * canvas.height
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.fillStyle = 'rgba(59,130,246,0.12)'
      ctx.fillRect(px, py, pw, ph)
      ctx.strokeRect(px, py, pw, ph)
    }
  }

  function getRelative(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!
    const bounds = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - bounds.left) / bounds.width,
      y: (clientY - bounds.top) / bounds.height,
    }
  }

  function onDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    dragging.current = true
    startPt.current = getRelative(e)
    setRect(null)
    draw(null)
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    if (!dragging.current) return
    const cur = getRelative(e)
    const r = {
      x: Math.min(startPt.current.x, cur.x),
      y: Math.min(startPt.current.y, cur.y),
      w: Math.abs(cur.x - startPt.current.x),
      h: Math.abs(cur.y - startPt.current.y),
    }
    setRect(r)
    draw(r)
  }

  function onUp() {
    dragging.current = false
  }

  useEffect(() => { draw(rect) }, [rect]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full">
      <img src={screenshot} alt="Screenshot" className="w-full rounded" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        width={800}
        height={600}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
      />
      <div className="mt-2 flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => onConfirm(undefined)}>Skip</Button>
        <Button size="sm" onClick={() => onConfirm(rect ?? undefined)}>Confirm area</Button>
      </div>
    </div>
  )
}

export function FeedbackButton() {
  const t = useTranslations('FeedbackButton')
  const [mode, setMode] = useState<Mode>('idle')
  const [ctx, setCtx] = useState<FeedbackContext | null>(null)
  const [message, setMessage] = useState('')
  const [pendingEl, setPendingEl] = useState<Element | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  // DATA mode: attach body-level event listeners
  useEffect(() => {
    if (mode !== 'data-selecting') return

    function onMouseOver(e: MouseEvent) {
      const target = (e.target as Element).closest('[data-feedback-target]')
      document.querySelectorAll('[data-feedback-target]').forEach(el => {
        el.classList.toggle('feedback-highlight', el === target)
      })
    }

    function onMouseOut() {
      document.querySelectorAll('[data-feedback-target]').forEach(el => {
        el.classList.remove('feedback-highlight')
      })
    }

    function onClick(e: MouseEvent) {
      const target = (e.target as Element).closest('[data-feedback-target]')
      if (!target) return
      e.preventDefault()
      e.stopPropagation()
      const key = target.getAttribute('data-feedback-target')!
      const entityCtx = getEntityContext(target)
      setCtx({ mode: 'DATA', targetKey: key, ...entityCtx })
      setMode('data-form')
      document.querySelectorAll('[data-feedback-target]').forEach(el => el.classList.remove('feedback-highlight'))
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMode('modal')
        document.querySelectorAll('[data-feedback-target]').forEach(el => el.classList.remove('feedback-highlight'))
      }
    }

    document.body.setAttribute('data-feedback-selecting', '')
    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.removeAttribute('data-feedback-selecting')
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mode])

  // OTHER mode: capture screenshot
  const captureScreenshot = useCallback(async () => {
    setMode('other-capturing')
    try {
      const { toJpeg } = await import('html-to-image')
      const dataUrl = await toJpeg(document.body, { pixelRatio: 0.75, quality: 0.75 })
      setCtx({ mode: 'OTHER', screenshot: dataUrl })
      setMode('other-form')
    } catch {
      toast.error(t('error'))
      setMode('modal')
    }
  }, [t])

  async function submit() {
    if (!ctx) return
    const isData = ctx.mode === 'DATA'
    if (isData && message.trim().length < 3) return

    setMode('submitting')
    const payload = {
      mode: ctx.mode,
      pageUrl: window.location.href,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      targetKey: ctx.targetKey,
      screenshot: ctx.screenshot,
      annotation: ctx.annotation,
      message: message.trim() || ' ',
      website: '',
    }

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 201) {
        toast.success(t('success'))
        reset()
      } else if (res.status === 429) {
        toast.error(t('rateLimit'))
        setMode('data-form')
      } else {
        toast.error(t('error'))
        setMode(ctx.mode === 'DATA' ? 'data-form' : 'other-form')
      }
    } catch {
      toast.error(t('error'))
      setMode(ctx.mode === 'DATA' ? 'data-form' : 'other-form')
    }
  }

  function reset() {
    setMode('idle')
    setCtx(null)
    setMessage('')
    setPendingEl(null)
  }

  if (mode === 'idle') {
    return (
      <button
        onClick={() => setMode('modal')}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t('label')}
        title={t('label')}
      >
        <Flag className="w-4 h-4" />
      </button>
    )
  }

  if (mode === 'data-selecting') {
    return (
      <div className="fixed inset-x-0 bottom-4 flex justify-center z-50 pointer-events-none">
        <div className="bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3 pointer-events-auto">
          <span className="text-sm">{t('selectTarget')}</span>
          <Button size="sm" variant="outline" onClick={() => setMode('modal')}>{t('cancel')}</Button>
        </div>
      </div>
    )
  }

  if (mode === 'other-capturing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
        <p className="text-sm text-muted-foreground">{t('screenshotCapturing')}</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" ref={overlayRef}>
      <div className="bg-background rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4">

        {mode === 'modal' && (
          <>
            <h2 className="font-semibold text-lg">{t('title')}</h2>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start h-auto py-3 text-left"
                onClick={() => setMode('data-selecting')}
              >
                <div>
                  <div className="font-medium">{t('dataMode')}</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3 text-left"
                onClick={captureScreenshot}
              >
                <div>
                  <div className="font-medium">{t('otherMode')}</div>
                </div>
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={reset}>{t('cancel')}</Button>
          </>
        )}

        {mode === 'data-form' && ctx && (
          <>
            <h2 className="font-semibold text-lg">{t('dataMode')}</h2>
            {ctx.targetKey && (
              <p className="text-sm text-muted-foreground">{t('targetLabel', { key: ctx.targetKey })}</p>
            )}
            {/* honeypot */}
            <input type="text" name="website" defaultValue="" className="hidden" aria-hidden="true" tabIndex={-1} />
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('messageLabel')}</label>
              <textarea
                ref={messageRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t('messagePlaceholder')}
                className="w-full border rounded p-2 text-sm min-h-[80px] resize-none"
                maxLength={2000}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMode('modal')} className="flex-1">{t('cancel')}</Button>
              <Button onClick={submit} disabled={message.trim().length < 3} className="flex-1">{t('submit')}</Button>
            </div>
          </>
        )}

        {mode === 'other-form' && ctx && (
          <>
            <h2 className="font-semibold text-lg">{t('otherMode')}</h2>
            {ctx.screenshot && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('drawAnnotation')}</p>
                <AnnotationCanvas
                  screenshot={ctx.screenshot}
                  onConfirm={ann => setCtx(prev => prev ? { ...prev, annotation: ann } : prev)}
                />
              </div>
            )}
            {/* honeypot */}
            <input type="text" name="website" defaultValue="" className="hidden" aria-hidden="true" tabIndex={-1} />
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('otherMessageLabel')}</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t('messagePlaceholder')}
                className="w-full border rounded p-2 text-sm min-h-[80px] resize-none"
                maxLength={2000}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset} className="flex-1">{t('cancel')}</Button>
              <Button onClick={submit} className="flex-1">{t('submit')}</Button>
            </div>
          </>
        )}

        {mode === 'submitting' && (
          <p className="text-sm text-center text-muted-foreground">{t('submitting')}</p>
        )}
      </div>
    </div>
  )
}
