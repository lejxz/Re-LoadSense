'use client'

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'

/**
 * useAlertsSocket — connects to the socket.io mini-service for live alert updates.
 *
 * Operator console uses this to receive new alerts in real time without polling.
 *
 * See concept/04-features.md RT-02.
 */

const SOCKET_PORT = 3001

export function useAlertsSocket(operatorId?: string) {
  const queryClient = useQueryClient()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!operatorId) return

    const socket = io('/?XTransformPort=' + SOCKET_PORT, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[alerts-socket] connected:', socket.id)
      socket.emit('subscribe', { role: 'operator', operatorId })
    })

    // ── On alert:new, invalidate the alerts query so it refetches ──
    socket.on('alert:new', (data: AlertEvent) => {
      console.log('[alerts-socket] alert:new received', data.alertId)
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    })

    socket.on('disconnect', (reason) => {
      console.log('[alerts-socket] disconnected:', reason)
    })

    socket.on('connect_error', (err) => {
      console.warn('[alerts-socket] connect error:', err.message)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [queryClient, operatorId])

  return socketRef
}

interface AlertEvent {
  alertId: string
  operatorId: string
  type: string
  severity: string
  vehicleId: string
}
