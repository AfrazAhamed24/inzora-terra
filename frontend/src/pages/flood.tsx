/**
 * PAGE 7 — FLOOD MONITORING
 * Flood-relevant telemetry from the real backend:
 *   GET /missions/{id}/telemetry → weather packets (precip) + environment snapshot.
 * There is NO water-level sensor channel in the backend, so water-level gauges
 * are shown as integration-pending. Nothing is invented.
 */

import { useState } from 'react';
import { api, type MissionListItem, type TelemetryResp, type TelemetryPacket } from '../api';
import { useAsyncData } from '../hooks';
import {
  Badge,
  EmptyCompact,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  MissionSelect,
  Panel,
  RefreshButton,
  formatDateTime,
  type Tone,
} from '../ui';

interface FloodData {
  missions: MissionListItem[];
  telemetry: TelemetryResp | null;
}

type RainAlert = { label: string; tone: Tone };

/** Rain alert derived from the real rain_intensity value (explicitly labelled as derived). */
function rainAlert(rain: number | undefined): RainAlert | null {
  if (rain === undefined) return null;
  if (rain >= 0.5) return { label: 'FLOOD ALERT (derived from rain intensity)', tone: 'red' };
  if (rain > 0) return { label: 'Flood watch (derived from rain intensity)', tone: 'orange' };
  return { label: 'No rain — no flood watch', tone: 'green' };
}

export function FloodMonitoringPage() {
  const [selectedId, setSelectedId] = useState<string>('');

  const { data, error, loading, refresh, loadedKey } = useAsyncData<FloodData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const latest = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
    let telemetry: TelemetryResp | null = null;
    if (latest) {
      try {
        telemetry = await api.telemetry(latest, signal);
      } catch {
        telemetry = null;
      }
    }
    return { missions, telemetry };
  }, [selectedId]);

  const missions = data?.missions ?? [];
  const currentId = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
  const telemetry = data?.telemetry ?? null;

  const weather = telemetry?.environment?.weather ?? {};
  const rainIntensity = typeof weather.rain_intensity === 'number' ? weather.rain_intensity : undefined;
  const alert = rainAlert(rainIntensity);

  // Rain / precipitation packets from the telemetry stream (real measurements).
  const rainPackets: TelemetryPacket[] = (telemetry?.telemetry ?? [])
    .filter((p) => p.sensor_type === 'weather')
    .slice(-12)
    .reverse();

  // Sensor channels observed on this mission (real packet types).
  const channelMap = new Map<string, TelemetryPacket>();
  for (const p of telemetry?.telemetry ?? []) {
    const existing = channelMap.get(p.sensor_type);
    if (!existing || p.ts > existing.ts) channelMap.set(p.sensor_type, p);
  }
  const channels = Array.from(channelMap.values()).sort((a, b) => a.sensor_type.localeCompare(b.sensor_type));

  const expectedKey = JSON.stringify([currentId]);
  const stale = loading && loadedKey !== null && loadedKey !== expectedKey;
  if (loading && (!data || stale)) return <LoadingBlock label="Loading flood monitoring…" />;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <MissionSelect missions={missions} value={currentId} onChange={setSelectedId} />
        </div>
        <div className="toolbar-right">
          <RefreshButton onClick={refresh} />
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={refresh} />}

      {missions.length === 0 ? (
        <Panel title="Flood Monitoring">
          <EmptyState
            icon="droplet"
            title="No missions registered — no flood telemetry available"
            hint="Flood-relevant sensor data streams from active mission scenarios"
          />
        </Panel>
      ) : !telemetry || telemetry.count === 0 ? (
        <Panel title="Flood Monitoring" tag={`Mission ${currentId}`}>
          <EmptyState
            icon="droplet"
            title="No telemetry received for this mission yet"
            hint="Telemetry streams once the mission loop is running"
          />
        </Panel>
      ) : (
        <>
          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Flood alert status (derived)</span>
              <span className="detail-value">
                {alert ? <Badge tone={alert.tone}>{alert.label}</Badge> : '—'}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Rain intensity (0–1)</span>
              <span className="detail-value detail-mono">
                {rainIntensity === undefined ? '—' : rainIntensity.toFixed(2)}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Temperature</span>
              <span className="detail-value detail-mono">
                {typeof weather.temp_c === 'number' ? `${weather.temp_c.toFixed(1)} °C` : '—'}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Humidity</span>
              <span className="detail-value detail-mono">
                {typeof weather.humidity_pct === 'number' ? `${weather.humidity_pct.toFixed(0)} %` : '—'}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Wind</span>
              <span className="detail-value detail-mono">
                {typeof weather.wind_mps === 'number' ? `${weather.wind_mps.toFixed(1)} m/s` : '—'}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Packets received</span>
              <span className="detail-value">{telemetry.count}</span>
            </div>
          </div>

          <Panel title="Precipitation Measurements" count={rainPackets.length} tag="weather channel">
            <div className="table table-scroll">
              <div className="table-head table-head-flood">
                <span>Timestamp</span>
                <span>Metric</span>
                <span>Value</span>
                <span>Unit</span>
                <span>Zone</span>
                <span>Source</span>
              </div>
              {rainPackets.length === 0 ? (
                <EmptyCompact>No precipitation packets in the current telemetry window</EmptyCompact>
              ) : (
                rainPackets.map((p) => (
                  <div className="table-row" key={p.packet_id}>
                    <span className="cell-muted detail-mono">{formatDateTime(p.ts)}</span>
                    <span className="cell-name">{p.metric}</span>
                    <span className="detail-mono">{p.value}</span>
                    <span className="cell-muted">{p.unit}</span>
                    <span className="cell-muted">{p.zone}</span>
                    <span className="cell-muted">{p.source}</span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <div className="lower-grid">
            <Panel title="Sensor Channels Observed" count={channels.length}>
              {channels.length === 0 ? (
                <EmptyCompact>No sensor channels recorded</EmptyCompact>
              ) : (
                <div className="table table-scroll">
                  <div className="table-head table-head-channels">
                    <span>Channel</span>
                    <span>Latest Metric</span>
                    <span>Value</span>
                    <span>Zone</span>
                  </div>
                  {channels.map((p) => (
                    <div className="table-row" key={`${p.sensor_type}-${p.packet_id}`}>
                      <span className="cell-name">{p.sensor_type}</span>
                      <span className="cell-muted">{p.metric}</span>
                      <span className="detail-mono">{p.value}</span>
                      <span className="cell-muted">{p.zone}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Water-Level Gauges" tag="Integration pending">
              <EmptyState
                icon="droplet"
                title="No water-level sensor feed is integrated"
                hint="The backend sensor set has no water-level channel — gauge readings will appear here once an endpoint exists. Nothing is simulated."
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
