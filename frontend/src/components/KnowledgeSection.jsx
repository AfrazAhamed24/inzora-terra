/**
 * KnowledgeSection - Prototype knowledge retrieval display.
 *
 * Connected to mission summary output. This is a prototype matcher, not RAG.
 */

import { motion } from 'framer-motion'
import { Brain } from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'

const DEFAULT_DOCS = [
  { id: 1, title: 'Awaiting knowledge retrieval...', relevance: 0, snippet: 'Start a mission to retrieve knowledge documents.' },
]

function KnowledgeSection() {
  const { state } = useMissionContext()

  // Use mission knowledge if available, fallback to an honest empty state.
  const docs = state.knowledge.length > 0 ? state.knowledge : DEFAULT_DOCS

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12">
          <div className="section-eyebrow mb-4">Knowledge Base</div>
          <h2 className="section-title font-display text-3xl font-semibold tracking-[0.04em] md:text-4xl">Knowledge Retrieval Prototype</h2>
        </div>

        <div className="glass-card rounded-2xl p-6 md:p-8">
          <div className="mb-7 flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/25">
              <Brain className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <div className="font-display text-sm font-semibold tracking-[0.06em] text-white/85">Rule-Based SOP Matcher</div>
              <div className="mt-0.5 text-[10px] text-white/30">
                {state.knowledge.length > 0
                  ? `Matched ${state.knowledge.length} candidate document${state.knowledge.length !== 1 ? 's' : ''} from the demo corpus`
                  : 'Awaiting mission data · no RAG or vector search active'}
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {docs.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-soft cursor-pointer rounded-xl border border-white/[0.05] p-4 transition-colors hover:border-white/[0.12]"
              >
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div className="font-display text-sm font-semibold tracking-[0.04em] text-white/80">{doc.title}</div>
                  {doc.relevance > 0 && (
                    <div className="font-mono text-[10px] text-emerald-400">
                      {(doc.relevance * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
                <p className="reading-copy text-[13px]">{doc.snippet}</p>
                {doc.relevance > 0 && (
                  <div className="mt-3 h-0.5 w-full rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-400/50" style={{ width: `${doc.relevance * 100}%` }} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default KnowledgeSection
