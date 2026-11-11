/** Compact mission overview shown before the live dashboard. */

import { useEnvironment, useMissionStage, useIsRunning } from '@/context/MissionContext'

function SensorBadge({ icon, label, value }) {
  return (
    <div className="flex min-w-[112px] items-center gap-2 border-l border-[#3f444f] px-3 py-1 first:border-l-0">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#18181b] text-sm">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-xs font-medium text-[#a3a6af]">{label}</div>
        <div className="mt-1 font-mono text-sm font-semibold text-[#fafafa]">{value}</div>
      </div>
    </div>
  )
}

function HeroSection() {
  const environment = useEnvironment()
  const stage = useMissionStage()
  const isRunning = useIsRunning()

  // stable stage text
  const stageText = {
    created: 'SYSTEM ONLINE',
    initialized: 'MISSION INITIALIZED',
    evidence_ingested: 'ENVIRONMENT MAPPED',
    risk_assessed: 'RISK ASSESSMENT COMPLETE',
    victims_localized: 'VICTIMS DETECTED',
    resources_allocated: 'RESOURCES DEPLOYED',
    knowledge_queried: 'KNOWLEDGE RETRIEVED',
    briefing_ready: 'BRIEFING READY',
    awaiting_confirmation: 'AWAITING COMMANDER APPROVAL',
    completed: 'MISSION COMPLETE',
    stopped: 'MISSION STOPPED',
    aborted: 'MISSION ABORTED',
    errored: 'MISSION ERROR',
  }[stage] || 'AWAITING MISSION'

  const isActive = [
    'initialized',
    'evidence_ingested',
    'risk_assessed',
    'victims_localized',
    'resources_allocated',
    'knowledge_queried',
    'briefing_ready',
    'awaiting_confirmation',
  ].includes(stage)

  const isActiveRunning = isRunning || isActive

  const thermal = environment.temperature == null ? null : Math.round(environment.temperature)
  const wind = environment.wind_speed == null ? null : Math.round(environment.wind_speed * 10) / 10
  const humidity = environment.humidity == null ? null : Math.round(environment.humidity)
  const visibility = environment.visibility == null ? null : Math.round(environment.visibility * 10) / 10
  const metric = (value, suffix = '') => value == null ? '—' : `${value}${suffix}`

  // Rover connectivity status
  const rover = environment.rover_position || environment.rover || null
  const roverStatus = rover
    ? `Rover connected · ${Math.round(rover.distance * 10) / 10} km`
    : 'Rover — awaiting connection'

  return (
    <section className="border-b border-[#3f444f] bg-[#0d0d0f] px-4 pb-5 pt-[4.5rem] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[#3b82f6]">
            <span className={`h-2 w-2 rounded-full ${isActiveRunning ? 'bg-[#10b981]' : 'bg-[#a3a6af]'}`} />
            <span>{isActiveRunning ? 'Mission active' : 'Mission standby'}</span>
            <span className="text-[#a3a6af]">·</span>
            <span className="font-normal text-[#a3a6af]">{stageText}</span>
          </div>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#fafafa]">Mission overview</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#a3a6af]">
            Live environmental context and mission status for the current response operation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-y-2 rounded-xl bg-[#18181b] border border-[#3f444f] py-2 lg:shrink-0">
          <SensorBadge icon="🌡" label="Thermal" value={metric(thermal, '°C')} />
          <SensorBadge icon="💨" label="Wind" value={metric(wind, ' m/s')} />
          <SensorBadge icon="💧" label="Humidity" value={metric(humidity, '%')} />
          <SensorBadge icon="👁" label="Visibility" value={metric(visibility, ' km')} />
          {roverStatus && (
            <SensorBadge
              icon="🚁"
              label="Rover"
              value={roverStatus}
            />
          )}
        </div>
      </div>
    </section>
  )
}

export default HeroSection