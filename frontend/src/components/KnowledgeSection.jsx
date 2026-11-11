/**
 * KnowledgeSection - Prototype knowledge retrieval display.
 * Premium dark theme with rule-based SOP matcher.
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
    <section className="px-6 py-12 bg-[#0d0d0f]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="text-xs font-mono font-normal text-[#6b728b] uppercase tracking-wider mb-2">
            Knowledge Base
          </div>
          <h2 className="text-2xl font-display font-semibold tracking-[0.04em] md:text-3xl text-[#fafafa]">
            Knowledge Retrieval Prototype
          </h2>
        </div>

        <div className="rounded-xl glass-panel border border-[#3f444f] bg-[#1e2328] p-5 md:p-7 transition-colors hover:border-[#3b82f6]">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg glass-surface bg-[#1e2328] border border-[#3f444f]">
              <Brain className="h-4.5 w-4.5 text-[#3b82f6]" />
            </div>
            <div>
              <div className="font-display text-sm font-semibold tracking-[0.06em] text-[#6b728b]">Rule-Based SOP Matcher</div>
              <div className="mt-0.5 text-[8px] text-[#6b728b]">
                {state.knowledge.length > 0
                  ? `Matched ${state.knowledge.length} candidate document${state.knowledge.length !== 1 ? 's' : ''} from the demo corpus`
                  : 'Awaiting mission data · no RAG or vector search active'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {docs.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="cursor-pointer rounded-xl glass-surface border border-[#3f444f] bg-[#1e2328] p-3 transition-colors hover:border-[#3b82f6]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-display text-sm font-semibold tracking-[0.04em] text-[#6b728b]">{doc.title}</div>
                  {doc.relevance > 0 && (
                    <div className="font-mono text-[8px] text-[#6b728b]/50">
                      {(doc.relevance * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
                <p className="reading-copy text-[10px] text-[#6b728b]">{doc.snippet}</p>
                {doc.relevance > 0 && (
                  <div className="mt-2 rounded-full glass-surface bg-[#1e2328] h-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${doc.relevance * 100}%` }} />
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