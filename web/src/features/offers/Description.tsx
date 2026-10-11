import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, cx, Skeleton } from '../../components/ui'
import { useI18n } from '../../i18n'
import { parseDescription, type Block } from '../../lib/description'
import './Description.css'

interface Props {
  // Null while the details load.
  text: string | null
  // Phone: clamped to 14 lines behind "Show full description" (§4.8).
  clamp: boolean
}

// Text nodes only, never HTML: scraped content is untrusted.
function DescriptionBlock({ block }: { block: Block }) {
  if (block.type === 'h4') return <h4>{block.text}</h4>
  if (block.type === 'p') return <p>{block.text}</p>
  return (
    <ul>
      {block.items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

// The scraped description rebuilt into headings, paragraphs and lists (lib/description.ts).
export function Description({ text, clamp }: Props) {
  const { t } = useI18n()
  const bodyId = useId()
  const blocks = useMemo(() => (text == null ? [] : parseDescription(text)), [text])
  const bodyRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  // Whether the clamp hides anything; only then is there something to show.
  const [overflows, setOverflows] = useState(false)
  const clamped = clamp && !expanded

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!clamped || !body) return
    const measure = () => setOverflows(body.scrollHeight > body.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [clamped, blocks])

  return (
    <section className="description">
      <h3 className="description__heading">
        {t.details.description}
      </h3>
      {text == null ? (
        <div className="description__loading" aria-hidden="true">
          {[96, 88, 92, 60].map((width) => (
            <Skeleton key={width} width={`${width}%`} />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <p className="description__empty">{t.details.noDescription}</p>
      ) : (
        <>
          <div
            ref={bodyRef}
            id={bodyId}
            className={cx('description__body', clamped && 'description__body--clamped', clamped && overflows && 'description__body--faded')}
          >
            {blocks.map((block, index) => (
              <DescriptionBlock key={index} block={block} />
            ))}
          </div>
          {clamp && (overflows || expanded) && (
            <Button
              variant="ghost"
              size="sm"
              className="description__more"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? t.details.showLess : t.details.showFull}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
