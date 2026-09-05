/**
 * useMission - Hook for mission CRUD and lifecycle operations.
 *
 * Architectural decision: Encapsulates all mission API calls with
 * loading states, error handling, and automatic state updates.
 */

import { useCallback } from 'react'
import { useMissionContext } from '@/context/MissionContext'
import * as missionService from '@/services/missionService'
import type { MissionCreateRequest } from '@/types/api'

export function useMission() {
  const { state, dispatch } = useMissionContext()

  /** Fetch mission list */
  const fetchMissions = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'missions', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'missions', value: null } })

    try {
      const response = await missionService.listMissions()
      dispatch({ type: 'SET_MISSIONS', payload: response.missions })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch missions'
      dispatch({ type: 'SET_ERROR', payload: { key: 'missions', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'missions', value: false } })
    }
  }, [dispatch])

  /** Fetch single mission */
  const fetchMission = useCallback(async (missionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'mission', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'mission', value: null } })

    try {
      const mission = await missionService.getMission(missionId)
      dispatch({ type: 'SET_MISSION', payload: mission })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch mission'
      dispatch({ type: 'SET_ERROR', payload: { key: 'mission', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'mission', value: false } })
    }
  }, [dispatch])

  /** Create new mission */
  const createMission = useCallback(async (request: MissionCreateRequest) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'mission', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'mission', value: null } })

    try {
      const mission = await missionService.createMission(request)
      dispatch({ type: 'SET_MISSION', payload: mission })
      return mission
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create mission'
      dispatch({ type: 'SET_ERROR', payload: { key: 'mission', value: message } })
      throw error
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'mission', value: false } })
    }
  }, [dispatch])

  /** Start mission */
  const startMission = useCallback(async (missionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'start', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'start', value: null } })

    try {
      const mission = await missionService.startMission(missionId)
      dispatch({ type: 'SET_MISSION', payload: mission })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start mission'
      dispatch({ type: 'SET_ERROR', payload: { key: 'start', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'start', value: false } })
    }
  }, [dispatch])

  /** Stop mission */
  const stopMission = useCallback(async (missionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'stop', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'stop', value: null } })

    try {
      const mission = await missionService.stopMission(missionId)
      dispatch({ type: 'SET_MISSION', payload: mission })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop mission'
      dispatch({ type: 'SET_ERROR', payload: { key: 'stop', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'stop', value: false } })
    }
  }, [dispatch])

  /** Fetch mission summary */
  const fetchSummary = useCallback(async (missionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'summary', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'summary', value: null } })

    try {
      const summary = await missionService.getMissionSummary(missionId)
      dispatch({ type: 'SET_SUMMARY', payload: summary })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch summary'
      dispatch({ type: 'SET_ERROR', payload: { key: 'summary', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'summary', value: false } })
    }
  }, [dispatch])

  /** Fetch mission telemetry */
  const fetchTelemetry = useCallback(async (missionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'telemetry', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'telemetry', value: null } })

    try {
      const telemetry = await missionService.getTelemetry(missionId)
      dispatch({ type: 'SET_TELEMETRY', payload: telemetry })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch telemetry'
      dispatch({ type: 'SET_ERROR', payload: { key: 'telemetry', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'telemetry', value: false } })
    }
  }, [dispatch])

  /** Fetch mission replay */
  const fetchReplay = useCallback(async (missionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'replay', value: true } })
    dispatch({ type: 'SET_ERROR', payload: { key: 'replay', value: null } })

    try {
      const replay = await missionService.getReplay(missionId)
      dispatch({ type: 'SET_REPLAY', payload: replay })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch replay'
      dispatch({ type: 'SET_ERROR', payload: { key: 'replay', value: message } })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'replay', value: false } })
    }
  }, [dispatch])

  return {
    state,
    fetchMissions,
    fetchMission,
    createMission,
    startMission,
    stopMission,
    fetchSummary,
    fetchTelemetry,
    fetchReplay,
  }
}

export default useMission
